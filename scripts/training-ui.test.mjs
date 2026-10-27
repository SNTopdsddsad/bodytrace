import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as training from "../src/lib/training.ts";
import { createTrainingClock } from "../src/lib/training-clock.ts";

const serverNow = "2026-10-27T12:00:00.000Z";
const recordId = "13000000-0000-4000-8000-000000000001";
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const editorSource = source("../src/components/app/training-editor.tsx");
const itemSource = source("../src/components/app/training-item-editor.tsx");
const entryFor = (input, version = 1) => ({ ...input, id: recordId, version, timeZone: "Asia/Shanghai", createdAt: serverNow, updatedAt: serverNow });

// 执行实际组件、表单转换和校时逻辑，仅隔离 React 宿主、浏览器导航和网络。
function createUi({ initial = training.newTraining("live", "2026-10-27", "20:00", serverNow), initialRecord = null, clock, create, update, lookup } = {}) {
  const calls = [], replacements = [], routes = [];
  const windowListeners = new Map(), documentListeners = new Map(), timers = new Map();
  const location = new URL(initialRecord ? `/training/${initialRecord.id}` : "/training/new", "http://localhost:3001");
  let instance = { hooks: [], mounted: true }, hookIndex = 0, effects = [], timerId = 0;
  let clientNow = Date.parse(serverNow) + 2000, monotonic = 100;
  let ignoredUpdates = 0;
  let historyGuard = null, blockedDestination = null;
  const historyTraversals = [];
  class ClientDate extends Date {
    constructor(value = clientNow) { super(value); }
    static now() { return clientNow; }
  }
  class Element {}
  class Anchor extends Element {
    constructor(href) { super(); this.href = new URL(href, location).href; this.target = ""; }
    closest() { return this; }
    hasAttribute() { return false; }
  }
  const on = (listeners, name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); };
  const off = (listeners, name, fn) => listeners.get(name)?.delete(fn);
  const changeLocation = value => { location.href = new URL(value, location).href; };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initialValue) {
      const frame = instance, i = hookIndex++;
      if (!(i in frame.hooks)) frame.hooks[i] = { value: typeof initialValue === "function" ? initialValue() : initialValue };
      return [frame.hooks[i].value, next => {
        if (!frame.mounted) { ignoredUpdates++; return; }
        frame.hooks[i].value = typeof next === "function" ? next(frame.hooks[i].value) : next;
      }];
    },
    useRef(initialValue) { const i = hookIndex++; return (instance.hooks[i] ??= { value: { current: initialValue } }).value; },
    useMemo(factory, deps) {
      const i = hookIndex++, previous = instance.hooks[i];
      if (!previous || !deps.every((dep, index) => Object.is(dep, previous.deps[index]))) instance.hooks[i] = { value: factory(), deps };
      return instance.hooks[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const frame = instance, i = hookIndex++, previous = frame.hooks[i];
      if (previous && deps?.every((dep, index) => Object.is(dep, previous.deps?.[index]))) return;
      effects.push(() => { previous?.cleanup?.(); frame.hooks[i] = { deps, cleanup: effect() }; });
    },
    useLayoutEffect(effect, deps) { react.useEffect(effect, deps); },
  };
  const api = async (path, init = {}) => {
    const call = { path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined, init };
    calls.push(call);
    if (path.endsWith("/clock")) return clock ? clock() : { serverNow };
    if (call.method === "POST") return create ? create(call.body) : { entry: entryFor(call.body.training) };
    if (call.method === "PATCH") return update ? update(call.body) : { entry: entryFor(call.body.training, call.body.version + 1) };
    return lookup ? lookup(path) : { entry: null };
  };
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/navigation": { useRouter: () => ({ push: path => { routes.push(path); changeLocation(path); }, refresh() {} }) },
    "next/link": { default: "Link" },
    "@/lib/api-client": { api, ApiError },
    "@/lib/training": training,
    "@/lib/training-clock": { createTrainingClock: value => createTrainingClock(value, () => monotonic) },
    "@/lib/training-navigation-guard": {
      // 浏览器历史算法另由 training-navigation.test.mjs 验证；这里验证编辑器与守卫的接线。
      ensureTrainingDocumentBoundary: () => "ready",
      installTrainingNavigationGuard(options) {
        historyGuard = options;
        const beforeUnload = event => { if (options.shouldBlock()) event.preventDefault(); };
        const pageHide = () => options.onLeave();
        const pageShow = event => { if (event.persisted) options.onResume?.(); };
        on(windowListeners, "beforeunload", beforeUnload);
        on(windowListeners, "pagehide", pageHide);
        on(windowListeners, "pageshow", pageShow);
        return {
          confirmLeave() {
            if (!blockedDestination) return false;
            historyTraversals.push(blockedDestination);
            options.onLeave();
            changeLocation(blockedDestination);
            blockedDestination = null;
            return true;
          },
          cancelLeave() { blockedDestination = null; },
          dispose() {
            off(windowListeners, "beforeunload", beforeUnload);
            off(windowListeners, "pagehide", pageHide);
            off(windowListeners, "pageshow", pageShow);
            if (historyGuard === options) historyGuard = null;
          },
        };
      },
    },
    "@/lib/request-timeout": { withRequestTimeout: callback => callback(new AbortController().signal) },
  };
  const globals = {
    Error, URL, Date: ClientDate, Intl, AbortController, crypto: { randomUUID }, Element, HTMLAnchorElement: Anchor,
    window: {
      location, history: { replaceState: (_state, _unused, url) => { replacements.push(url); changeLocation(url); } },
      addEventListener: (name, fn) => on(windowListeners, name, fn), removeEventListener: (name, fn) => off(windowListeners, name, fn),
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
    },
    document: { addEventListener: (name, fn) => on(documentListeners, name, fn), removeEventListener: (name, fn) => off(documentListeners, name, fn) },
    require: name => modules[name] ?? new Proxy({}, { get: (_, component) => component }),
  };
  const itemExports = {};
  vm.runInNewContext(itemSource, { ...globals, exports: itemExports });
  modules["./training-item-editor"] = itemExports;
  const editorExports = {};
  vm.runInNewContext(editorSource, { ...globals, exports: editorExports });
  const props = { initial, initialRecord, serverNow, today: "2026-10-27", timeZone: "Asia/Shanghai", userId: "synthetic-owner", reference: null, recentExercises: [] };
  function render() {
    assert.ok(instance.mounted, "卸载后的组件不应再渲染");
    hookIndex = 0; effects = [];
    const tree = editorExports.TrainingEditor(props);
    effects.forEach(effect => effect());
    return tree;
  }
  function elements(node) {
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
  }
  const textOf = node => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(textOf).join("") : textOf(node?.props?.children ?? "");
  const find = predicate => { const element = elements(render()).find(predicate); assert.ok(element, "找不到预期控件"); return element; };
  const button = text => find(node => node.type === "Button" && textOf(node) === text);
  const input = id => find(node => node.props?.id === id);
  function clickLink(path) {
    const event = { target: new Anchor(path), button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    for (const listener of [...(documentListeners.get("click") ?? [])]) listener(event);
    if (!event.defaultPrevented) changeLocation(path);
    return event;
  }
  render();
  return {
    calls, replacements, routes, historyTraversals, button, input, render, clickLink,
    fieldset: () => find(node => node.type === "fieldset"),
    title: value => input("training-title").props.onChange({ target: { value } }),
    text: () => textOf(render()),
    dialog: title => find(node => node.type === "Dialog" && textOf(node).includes(title)),
    get href() { return location.href; },
    get ignoredUpdates() { return ignoredUpdates; },
    setClientNow(value) { clientNow = Date.parse(value); },
    advanceMonotonic(milliseconds) { monotonic += milliseconds; },
    beforeUnload() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const listener of windowListeners.get("beforeunload") ?? []) listener(event); return event.prevented; },
    pageHide() { for (const listener of windowListeners.get("pagehide") ?? []) listener({ persisted: true }); },
    resume() { for (const listener of windowListeners.get("pageshow") ?? []) listener({ persisted: true }); },
    flushAutosave() { render(); const scheduled = [...timers.entries()].filter(([, timer]) => timer.delay === 900); for (const [id, timer] of scheduled) { timers.delete(id); timer.callback(); } },
    unmount() { instance.mounted = false; for (const hook of instance.hooks) hook?.cleanup?.(); },
    navigate: changeLocation,
    traverse(path) {
      render();
      if (historyGuard?.shouldBlock()) { blockedDestination = path; historyGuard.onBlocked(); return; }
      historyGuard?.onLeave();
      changeLocation(path);
    },
  };
}

test("校时请求期间锁输入，快速重复创建只发出一次校时和一次 POST", async () => {
  const sample = deferred();
  const ui = createUi({ clock: () => sample.promise });
  ui.title("正在开始的合成训练");
  const submit = ui.button("开始记录，自动保存").props.onClick;
  submit(); submit();
  assert.equal(ui.fieldset().props.disabled, true);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].path, "/api/v1/training-records/clock");
  assert.equal(ui.beforeUnload(), true, "采样期间也不能静默离开");
  sample.resolve({ serverNow }); await tick();
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  assert.equal(ui.replacements.length, 1);
  ui.unmount();
});

test("设备时间跨到明天仍用服务端时间创建，POST 保持严格未来时间校验", async () => {
  const ui = createUi();
  ui.setClientNow("2026-10-28T12:00:00.000Z");
  ui.button("开始记录，自动保存").props.onClick(); await tick();
  const post = ui.calls.find(call => call.method === "POST");
  assert.ok(post);
  assert.equal(post.body.training.startedAt, serverNow);
  assert.equal(post.body.training.date, "2026-10-27");
  assert.equal(post.body.training.time, "20:00");
  assert.equal(training.trainingSchemas("2026-10-27", "20:00", serverNow).create.safeParse(post.body).success, true);
  ui.unmount();
});

test("校时失败保留输入且不写入，恢复网络后可重新校时创建", async () => {
  let attempts = 0;
  const ui = createUi({ clock: async () => { if (++attempts === 1) throw new Error("网络中断"); return { serverNow }; } });
  ui.title("校时失败时要保留的名字");
  ui.button("开始记录，自动保存").props.onClick(); await tick();
  assert.equal(ui.input("training-title").props.value, "校时失败时要保留的名字");
  assert.equal(ui.fieldset().props.disabled, false);
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
  assert.match(ui.text(), /无法校准服务器时间/);
  ui.button("重试保存").props.onClick(); await tick();
  assert.equal(attempts, 2);
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  ui.unmount();
});

test("确认离开或卸载后迟到的 POST 不会改写新页面地址", async () => {
  for (const leave of ["confirm", "unmount"]) {
    const pending = deferred();
    const ui = createUi({ create: () => pending.promise });
    ui.button("开始记录，自动保存").props.onClick(); await tick();
    ui.render();
    const post = ui.calls.find(call => call.method === "POST");
    assert.ok(post);
    if (leave === "confirm") {
      assert.equal(ui.clickLink("/").defaultPrevented, true);
      assert.equal(ui.dialog("离开训练记录？").props.open, true);
      ui.button("放弃本页修改并离开").props.onClick();
    } else { ui.unmount(); ui.navigate("/"); }
    pending.resolve({ entry: entryFor(post.body.training) }); await tick();
    assert.equal(ui.href, "http://localhost:3001/");
    assert.deepEqual(ui.replacements, []);
    assert.equal(ui.ignoredUpdates, 0, "卸载后不提交迟到的状态更新");
    if (leave === "confirm") ui.unmount();
  }
});

test("未知 POST 先核对，再用原 requestId 与 startedAt 重试，不重新校时", async () => {
  let attempts = 0;
  const ui = createUi({ create: async body => { if (++attempts === 1) throw new Error("响应丢失"); return { entry: entryFor(body.training) }; } });
  ui.button("开始记录，自动保存").props.onClick(); await tick();
  assert.match(ui.text(), /暂未确认本次保存/);
  ui.advanceMonotonic(60000);
  ui.setClientNow("2026-10-29T00:00:00.000Z");
  await ui.button("核对并重试").props.onClick();
  const posts = ui.calls.filter(call => call.method === "POST");
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[1].body, posts[0].body);
  assert.equal(ui.calls.filter(call => call.path.endsWith("/clock")).length, 1);
  assert.equal(ui.calls.filter(call => call.path.includes("?requestId=")).length, 2, "失败后和再次写入前各核对一次");
  assert.equal(ui.replacements.length, 1);
  ui.unmount();
});

test("更新在途时把输入改回旧值仍有离开保护，响应后保留尚待再次保存的输入", async () => {
  const original = training.newTraining("manual", "2026-10-27", null, serverNow);
  const pending = deferred();
  const ui = createUi({ initial: original, initialRecord: entryFor(original), update: () => pending.promise });
  ui.title("服务器即将收到的新名字");
  ui.flushAutosave(); await tick();
  const patch = ui.calls.find(call => call.method === "PATCH");
  assert.ok(patch);
  ui.title(original.title); ui.render();
  assert.equal(ui.beforeUnload(), true);
  assert.equal(ui.clickLink("/").defaultPrevented, true);
  assert.equal(ui.dialog("离开训练记录？").props.open, true);
  ui.button("继续记录").props.onClick();
  pending.resolve({ entry: entryFor(patch.body.training, 2) }); await tick();
  assert.equal(ui.input("training-title").props.value, original.title);
  assert.match(ui.text(), /等待自动保存/);
  assert.equal(ui.beforeUnload(), true);
  ui.unmount();
});

test("历史返回触发离开对话框，取消保留输入，确认交给原历史遍历且不另 push 页面", () => {
  const ui = createUi();
  ui.title("浏览器返回前尚未保存的合成输入");
  ui.traverse("/training");
  assert.equal(ui.href, "http://localhost:3001/training/new");
  assert.equal(ui.dialog("离开训练记录？").props.open, true);
  ui.button("继续记录").props.onClick();
  assert.equal(ui.dialog("离开训练记录？").props.open, false);
  assert.equal(ui.input("training-title").props.value, "浏览器返回前尚未保存的合成输入");
  assert.deepEqual(ui.historyTraversals, []);
  ui.traverse("/training");
  ui.button("放弃本页修改并离开").props.onClick();
  assert.equal(ui.href, "http://localhost:3001/training");
  assert.deepEqual(ui.historyTraversals, ["/training"]);
  assert.deepEqual(ui.routes, [], "历史返回的确认不能用 push 创建新的历史条目");
  ui.unmount();
});

test("BFCache 恢复后先核对在途 POST，旧回调失效且确认原记录只创建一次", async () => {
  const pending = deferred();
  let saved = null;
  const ui = createUi({ create: () => pending.promise, lookup: async () => ({ entry: saved }) });
  ui.title("恢复后保留的训练");
  ui.button("开始记录，自动保存").props.onClick(); await tick();
  const post = ui.calls.find(call => call.method === "POST");
  assert.ok(post);
  ui.pageHide(); ui.resume();
  assert.match(ui.text(), /页面已恢复，请核对上一次保存结果后继续/);
  assert.equal(ui.button("核对并重试").props.disabled, false);
  saved = entryFor(post.body.training);
  pending.resolve({ entry: saved }); await tick();
  assert.deepEqual(ui.replacements, [], "离开前发起的旧回调不能重新控制已恢复的文档");
  assert.equal(ui.href, "http://localhost:3001/training/new");
  await ui.button("核对并重试").props.onClick();
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  assert.equal(ui.calls.filter(call => call.path.endsWith("/clock")).length, 1);
  assert.equal(ui.calls.filter(call => call.path.includes("?requestId=")).length, 1);
  assert.deepEqual(ui.replacements, [`/training/${recordId}`]);
  assert.equal(ui.fieldset().props.disabled, false);
  ui.title("恢复后继续修改");
  assert.equal(ui.input("training-title").props.value, "恢复后继续修改");
  ui.unmount();
});

test("BFCache 恢复中断的校时会解锁重试，迟到的旧样本不能触发创建", async () => {
  const pending = deferred();
  let samples = 0;
  const ui = createUi({ clock: () => ++samples === 1 ? pending.promise : { serverNow } });
  ui.title("校时恢复后输入仍在");
  ui.button("开始记录，自动保存").props.onClick();
  assert.equal(ui.fieldset().props.disabled, true);
  ui.pageHide(); ui.resume();
  assert.match(ui.text(), /页面已恢复，输入仍保留，请重新保存/);
  assert.equal(ui.fieldset().props.disabled, false);
  pending.resolve({ serverNow }); await tick();
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 0);
  assert.deepEqual(ui.replacements, []);
  assert.equal(ui.input("training-title").props.value, "校时恢复后输入仍在");
  ui.button("重试保存").props.onClick(); await tick();
  assert.equal(samples, 2);
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1);
  assert.equal(ui.fieldset().props.disabled, false);
  ui.unmount();
});

test("结束核对先重新校时再计算经过时长，已手填的整场分钟保持不变", async () => {
  for (const enteredDuration of [null, "37"]) {
    const original = training.newTraining("live", "2026-10-27", "20:00", serverNow);
    const sample = deferred();
    const ui = createUi({ initial: original, initialRecord: entryFor(original), clock: () => sample.promise });
    if (enteredDuration !== null) ui.input("training-duration").props.onChange({ target: { value: enteredDuration } });
    ui.button("结束训练并核对").props.onClick();
    assert.equal(ui.button("结束训练并核对").props.disabled, true, "新样本返回前不能重复结束");
    assert.equal(ui.dialog("核对并完成这次训练").props.open, false, "不要先展示过期时钟估算的时长");
    sample.resolve({ serverNow: "2026-10-27T13:00:00.000Z" }); await tick();
    assert.equal(ui.dialog("核对并完成这次训练").props.open, true);
    assert.equal(ui.input("training-finish-duration").props.value, enteredDuration ?? "60");
    assert.equal(ui.calls.filter(call => call.path.endsWith("/clock")).length, 1);
    assert.equal(ui.calls.filter(call => call.method !== "GET").length, 0, "打开核对弹窗尚不写入记录");
    ui.unmount();
  }
});

test("结束核对的校时失败保留输入并解锁，重新点击可以取得正确时长", async () => {
  const original = training.newTraining("live", "2026-10-27", "20:00", serverNow);
  let samples = 0;
  const ui = createUi({ initial: original, initialRecord: entryFor(original), clock: async () => {
    if (++samples === 1) throw new Error("临时断网");
    return { serverNow: "2026-10-27T13:00:00.000Z" };
  } });
  ui.title("结束前尚未保存的输入");
  ui.button("结束训练并核对").props.onClick(); await tick();
  assert.equal(ui.dialog("核对并完成这次训练").props.open, false);
  assert.equal(ui.input("training-title").props.value, "结束前尚未保存的输入");
  assert.equal(ui.button("结束训练并核对").props.disabled, false);
  assert.match(ui.text(), /无法核对训练时长/);
  assert.equal(ui.calls.filter(call => call.method !== "GET").length, 0);
  ui.button("结束训练并核对").props.onClick(); await tick();
  assert.equal(ui.dialog("核对并完成这次训练").props.open, true);
  assert.equal(ui.input("training-finish-duration").props.value, "60");
  assert.equal(samples, 2);
  ui.unmount();
});
