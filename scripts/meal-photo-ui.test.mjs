import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const food = { id: "food-a", name: "合成食物", calories: 100, protein: 10, carbs: 10, fat: 1, servingGrams: 100 };
const imageFile = new File(["synthetic"], "photo.webp", { type: "image/webp" });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

// 与登录表单测试相同，执行实际组件事件；增加卸载清理以验证关闭后的异步结果。
function createUi({ component = "FoodPicker", create, upload, prepare } = {}) {
  const filename = component === "FoodPicker" ? "food-picker" : "meal-photo-gallery";
  const source = ts.transpileModule(readFileSync(new URL(`../src/components/app/${filename}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const messages = [], mealCalls = [], uploadCalls = [], revoked = [];
  let instance;
  let hookIndex = 0;
  let pendingEffects = [];
  let prepareCalls = 0;
  let open = true;
  const jsx = (type, props) => ({ type, props });
  function unmount() {
    if (!instance) return;
    for (const hook of instance.hooks) hook?.cleanup?.();
    instance = null;
  }
  const props = component === "FoodPicker"
    ? { date: "2026-10-23", mealType: "breakfast", mealLabel: "早餐", open: true, onOpenChange: value => { open = value; if (!value) unmount(); } }
    : { entryId: "entry-a", entryName: "合成食物", photos: [] };
  vm.runInNewContext(source, {
    exports, Error, AbortController, crypto: { randomUUID }, setTimeout, clearTimeout,
    URL: { revokeObjectURL: url => revoked.push(url) },
    require: name => {
      if (name === "react") return {
        useState(initial) {
          const frame = instance;
          const i = hookIndex++;
          if (!(i in frame.hooks)) frame.hooks[i] = { value: typeof initial === "function" ? initial() : initial };
          return [frame.hooks[i].value, next => { frame.hooks[i].value = typeof next === "function" ? next(frame.hooks[i].value) : next; }];
        },
        useRef(initial) {
          const i = hookIndex++;
          return (instance.hooks[i] ??= { value: { current: initial } }).value;
        },
        useEffect(effect, deps) {
          const frame = instance;
          const i = hookIndex++;
          const previous = frame.hooks[i];
          if (previous && deps?.every((dep, index) => Object.is(dep, previous.deps?.[index]))) return;
          pendingEffects.push(() => { previous?.cleanup?.(); frame.hooks[i] = { deps, cleanup: effect() }; });
        },
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
      if (name === "sonner") return { toast: { success: text => messages.push(text), error: text => messages.push(text) } };
      if (name === "@/lib/api-client") return { api: async (path, init) => {
        if (init?.method === "POST") {
          const input = JSON.parse(init.body); mealCalls.push(input);
          return create ? create(input) : { entry: { id: `entry-${mealCalls.length}`, name: food.name, grams: input.grams } };
        }
        return { foods: [food] };
      } };
      if (name === "@/lib/meal-photo") return { MEAL_PHOTO_MAX: 6, MEAL_PHOTO_ACCEPT: "image/webp" };
      if (name === "@/lib/meal-photo-client") return {
        prepareMealPhoto: async file => {
          prepareCalls++;
          return prepare ? prepare(file) : { file, previewUrl: `blob:${prepareCalls}` };
        },
        uploadMealPhoto: async (...args) => { uploadCalls.push(args); return upload?.(...args); },
      };
      return new Proxy({}, { get: (_, name) => name });
    },
  });
  function render() {
    assert.ok(open);
    instance ??= { hooks: [] };
    hookIndex = 0;
    pendingEffects = [];
    let tree = exports[component](props);
    if (typeof tree.type === "function") tree = tree.type(tree.props);
    pendingEffects.forEach(effect => effect());
    return tree;
  }
  function elements(node) {
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
  }
  const find = predicate => { const element = elements(render()).find(predicate); assert.ok(element, "找不到预期控件"); return element; };
  const textOf = node => typeof node === "string" ? node : Array.isArray(node) ? node.map(textOf).join("") : textOf(node?.props?.children ?? "");
  const button = text => find(node => ["Button", "button"].includes(node.type) && textOf(node) === text);
  render();
  return {
    messages, mealCalls, uploadCalls, revoked, button,
    get prepareCalls() { return prepareCalls; },
    get open() { return open; },
    pick: () => find(node => typeof node.type === "function" && node.type.name === "FoodRow").props.onPick(food),
    grams: () => find(node => node.props?.["aria-label"] === "食物克数"),
    photos: () => find(node => node.type === "MealPhotoPicker"),
    add: files => component === "FoodPicker" ? find(node => node.type === "MealPhotoPicker").props.onAdd(files)
      : find(node => node.type === "input").props.onChange({ target: { files, value: "" } }),
    close: () => find(node => node.type === "Dialog").props.onOpenChange(false),
    reopen: () => { open = true; render(); },
    unmount,
  };
}

test("创建记录期间锁定克数和关闭，连续点击只创建一次", async () => {
  const pending = deferred();
  const ui = createUi({ create: () => pending.promise });
  await tick(); ui.pick();
  const submit = ui.button("确认记录").props.onClick;
  const saving = submit();
  await submit();
  assert.equal(ui.grams().props.disabled, true);
  ui.close();
  assert.equal(ui.open, true);
  assert.equal(ui.mealCalls.length, 1);
  pending.resolve({ entry: { id: "entry-a", name: food.name, grams: 100 } });
  await saving;
  assert.equal(ui.open, false);
});

test("部分上传失败后份量只读，重试使用原记录与服务端回读份量", async () => {
  let attempt = 0;
  const ui = createUi({ upload: async () => { if (++attempt === 1) throw new Error("模拟失败"); } });
  await tick(); ui.pick(); await ui.add([imageFile]);
  await ui.button("确认记录").props.onClick();
  assert.equal(ui.grams().props.disabled, true);
  assert.equal(ui.button("200g").props.disabled, true);
  await ui.button("重试上传照片").props.onClick();
  assert.equal(ui.mealCalls.length, 1);
  assert.equal(ui.uploadCalls[0][2], ui.uploadCalls[1][2]);
  assert.equal(ui.uploadCalls[0][1], ui.uploadCalls[1][1]);
  assert.match(ui.messages.at(-1), /100g/);
});

test("关闭上传中的弹窗后旧请求不继续队列、不关闭新表单", async () => {
  const pending = deferred();
  const ui = createUi({ upload: () => pending.promise });
  await tick(); ui.pick(); await ui.add([imageFile, imageFile]);
  const saving = ui.button("确认记录").props.onClick();
  await tick();
  assert.equal(ui.uploadCalls.length, 1);
  ui.close();
  assert.equal(ui.uploadCalls[0][3].aborted, true);
  ui.reopen(); await tick(); ui.pick();
  pending.resolve(); await saving;
  assert.equal(ui.open, true);
  assert.equal(ui.uploadCalls.length, 1);
  assert.equal(ui.photos().props.photos.length, 0);
  assert.equal(ui.grams().props.disabled, false);
  ui.unmount();
});

test("关闭时仍在压缩的图片不会进入新表单，并释放迟到的预览 URL", async () => {
  const pending = deferred();
  const ui = createUi({ prepare: () => pending.promise });
  await tick(); ui.pick(); const preparing = ui.add([imageFile]);
  ui.close(); ui.reopen(); await tick(); ui.pick();
  pending.resolve({ file: imageFile, previewUrl: "blob:late" }); await preparing;
  assert.equal(ui.photos().props.photos.length, 0);
  assert.ok(ui.revoked.includes("blob:late"));
  ui.unmount();
});

test("页面切换卸载后迟到的记录创建不会上传照片或关闭新表单", async () => {
  const pending = deferred();
  const ui = createUi({ create: () => pending.promise });
  await tick(); ui.pick(); await ui.add([imageFile]);
  const saving = ui.button("确认记录").props.onClick();
  ui.unmount(); ui.reopen(); await tick(); ui.pick();
  pending.resolve({ entry: { id: "old-entry", name: food.name, grams: 100 } }); await saving;
  assert.equal(ui.open, true);
  assert.equal(ui.uploadCalls.length, 0);
  assert.equal(ui.grams().props.disabled, false);
  ui.unmount();
});

test("记录卡片失败重试保留相同文件与编号，预览 URL 即使上传失败也释放", async () => {
  let attempt = 0;
  const ui = createUi({ component: "MealPhotoGallery", upload: async () => { if (++attempt === 1) throw new Error("模拟失败"); } });
  ui.add([imageFile]); await tick();
  await ui.button("重试未上传的照片").props.onClick();
  assert.equal(ui.uploadCalls.length, 2);
  assert.equal(ui.uploadCalls[0][2], ui.uploadCalls[1][2]);
  assert.equal(ui.uploadCalls[0][1], ui.uploadCalls[1][1]);
  assert.equal(ui.prepareCalls, 1);
  assert.equal(ui.revoked.length, 1);
  ui.unmount();
});
