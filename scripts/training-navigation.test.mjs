import assert from "node:assert/strict";
import test from "node:test";
import { ensureTrainingDocumentBoundary, installTrainingNavigationGuard } from "../src/lib/training-navigation-guard.ts";

const origin = "https://bodytrace.test";
const flush = () => new Promise(resolve => setImmediate(resolve));

function browser({ paths = ["/training", "/training/new"], index = paths.length - 1, modern = true, initialPath = paths[index] } = {}) {
  const listeners = new Map();
  const calls = { replaced: [], stateWrites: [], go: [], traversed: [], nextPop: 0 };
  const entries = paths.map((path, entryIndex) => ({ key: `entry-${entryIndex}`, index: entryIndex, url: `${origin}${path}`, sameDocument: true }));
  let current = index;
  const location = { href: entries[index].url, replace: url => calls.replaced.push(url) };
  const emit = (type, event) => {
    let stopped = false;
    const original = event.stopImmediatePropagation.bind(event);
    event.stopImmediatePropagation = () => { stopped = true; original(); };
    for (const listener of [...(listeners.get(type) ?? [])].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      listener.callback(event);
      if (stopped) break;
    }
  };
  const host = {
    location,
    crypto: { randomUUID: () => "document-token" },
    performance: { getEntriesByType: () => [{ name: `${origin}${initialPath}` }] },
    history: {
      state: { existing: "retained" },
      length: entries.length,
      replaceState(state, _title, url) { this.state = state; calls.stateWrites.push(state); location.href = url; },
      go(delta) { calls.go.push(delta); queueMicrotask(() => traverse(current + delta, true)); },
    },
    addEventListener(type, callback, capture = false) {
      const list = listeners.get(type) ?? [];
      list.push({ callback, capture: capture === true });
      listeners.set(type, list);
    },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) ?? []).filter(listener => listener.callback !== callback)); },
  };
  const navigation = new EventTarget();
  Object.defineProperty(navigation, "currentEntry", {
    get: () => Object.create({ get key() { return entries[current].key; }, get index() { return current; } }),
  });
  navigation.traverseTo = key => {
    calls.traversed.push(key);
    traverse(entries.findIndex(entry => entry.key === key), true);
    return { committed: Promise.resolve(), finished: Promise.resolve() };
  };
  if (modern) host.navigation = navigation;
  const traverse = (destinationIndex, cancelable) => {
    const destination = entries[destinationIndex];
    assert.ok(destination, "测试不能越过实际历史栈");
    const event = new Event("navigate", { cancelable });
    Object.assign(event, { navigationType: "traverse", destination });
    navigation.dispatchEvent(event);
    if (!event.defaultPrevented) {
      current = destinationIndex;
      location.href = destination.url;
      emit("popstate", new Event("popstate"));
    }
    return event;
  };
  host.addEventListener("popstate", () => calls.nextPop++);
  return { host, calls, navigation, entries, emit, traverse, get index() { return current; } };
}

function guarded(browser, dirty = true) {
  const state = { dirty, blocked: 0, left: 0, resumed: 0, errors: [] };
  const guard = installTrainingNavigationGuard({
    shouldBlock: () => state.dirty,
    onBlocked: () => state.blocked++,
    onLeave: () => state.left++,
    onResume: () => state.resumed++,
    onError: message => state.errors.push(message),
  }, browser.host);
  return { guard, state };
}

test("可取消的后退先确认；继续编辑不改变 URL、历史长度或前进条目", () => {
  const b = browser();
  const { guard, state } = guarded(b);
  const event = b.traverse(0, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(state.blocked, 1);
  assert.equal(state.left, 0);
  assert.equal(b.index, 1);
  assert.equal(b.host.location.href, `${origin}/training/new`);
  guard.cancelLeave();
  assert.equal(guard.confirmLeave(), false);
  assert.equal(b.host.history.length, 2);
  assert.deepEqual(b.calls.stateWrites, []);
  assert.deepEqual(b.calls.go, []);
});

test("确认后退重走原历史 key，允许一次并交回 Next；再次进入仍受保护", () => {
  const b = browser();
  const { guard, state } = guarded(b);
  b.traverse(0, true);
  assert.equal(guard.confirmLeave(), true);
  assert.deepEqual(b.calls.traversed, ["entry-0"]);
  assert.equal(state.left, 1);
  assert.equal(b.calls.nextPop, 1);
  assert.equal(b.index, 0);
  assert.equal(b.host.history.length, 2);
  assert.equal(b.traverse(1, true).defaultPrevented, true);
  assert.equal(state.blocked, 2);
});

test("不可取消的同文档后退先恢复原条目，Next 看不到中间 popstate", async () => {
  const b = browser();
  const { guard, state } = guarded(b);
  b.traverse(0, false);
  assert.equal(state.blocked, 0, "必须等恢复完成才允许确认");
  assert.equal(guard.confirmLeave(), false);
  await flush();
  assert.equal(b.index, 1);
  assert.equal(state.blocked, 1);
  assert.equal(state.left, 0);
  assert.deepEqual(b.calls.go, [1]);
  assert.equal(state.resumed, 1, "恢复后允许编辑器核对在临时 URL 期间忽略的请求结果");
  assert.equal(b.calls.nextPop, 0);
  assert.equal(b.host.history.length, 2);
  assert.equal(guard.confirmLeave(), true);
  assert.equal(b.index, 0);
  assert.equal(b.calls.nextPop, 1);
});

test("不可取消的多步前进按实际索引恢复，不能假设浏览器只后退一页", async () => {
  const b = browser({ paths: ["/", "/training/new", "/training", "/profile"], index: 1 });
  const { guard, state } = guarded(b);
  b.traverse(3, false);
  await flush();
  assert.deepEqual(b.calls.go, [-2]);
  assert.equal(b.index, 1);
  assert.equal(state.blocked, 1);
  guard.cancelLeave();
  assert.equal(b.host.history.length, 4);
  assert.equal(b.calls.nextPop, 0);
});

test("快速连续后退期间先完成恢复，再开放确认，不把中间条目交给 Next", async () => {
  const b = browser({ paths: ["/", "/training", "/training/new"] });
  const { guard, state } = guarded(b);
  b.traverse(1, false);
  b.traverse(0, false);
  assert.equal(state.blocked, 0);
  await flush();
  assert.equal(b.index, 2);
  assert.equal(state.blocked, 1);
  assert.equal(b.calls.nextPop, 0);
  assert.equal(guard.confirmLeave(), true);
  assert.equal(b.index, 1);
});

test("无未保存输入和仅 hash 变化正常通行", () => {
  const clean = browser();
  const { state } = guarded(clean, false);
  assert.equal(clean.traverse(0, true).defaultPrevented, false);
  assert.equal(state.left, 1);
  assert.equal(clean.calls.nextPop, 1);
  const hash = browser({ paths: ["/training/new#one", "/training/new#two"] });
  const dirty = guarded(hash);
  assert.equal(hash.traverse(0, true).defaultPrevented, false);
  assert.equal(dirty.state.blocked, 0);
  assert.equal(dirty.state.left, 0);
});

test("跨文档 beforeunload 取消时仍活跃，只有实际 pagehide 才离开", () => {
  const b = browser({ modern: false });
  const { state } = guarded(b);
  const event = new Event("beforeunload", { cancelable: true });
  b.emit("beforeunload", event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(state.left, 0);
  b.emit("pagehide", new Event("pagehide"));
  assert.equal(state.left, 1);
});

test("BFCache 恢复仅在 persisted pageshow 通知编辑器恢复，清理后不再通知", () => {
  const b = browser({ modern: false });
  const { guard, state } = guarded(b);
  b.emit("pageshow", Object.assign(new Event("pageshow"), { persisted: false }));
  assert.equal(state.resumed, 0, "普通首次加载不能重复恢复会话");
  b.emit("pagehide", Object.assign(new Event("pagehide"), { persisted: true }));
  assert.equal(state.left, 1);
  b.emit("pageshow", Object.assign(new Event("pageshow"), { persisted: true }));
  assert.equal(state.resumed, 1, "从BFCache回来不保证React effect重跑，需显式恢复");
  guard.dispose();
  b.emit("pageshow", Object.assign(new Event("pageshow"), { persisted: true }));
  b.emit("pagehide", Object.assign(new Event("pagehide"), { persisted: true }));
  assert.equal(state.resumed, 1);
  assert.equal(state.left, 1);
});

test("确认导航失败给出可重试错误，不丢弃原目标；卸载后不再处理", async () => {
  const b = browser();
  const { guard, state } = guarded(b);
  b.navigation.traverseTo = () => ({ committed: Promise.reject(new Error("entry removed")), finished: Promise.reject(new Error("entry removed")) });
  b.traverse(0, true);
  assert.equal(guard.confirmLeave(), true);
  await flush();
  assert.equal(state.errors.length, 1);
  assert.match(state.errors[0], /输入仍保留/);
  assert.equal(guard.confirmLeave(), true);
  await flush();
  guard.dispose();
  assert.equal(b.traverse(0, true).defaultPrevented, false);
  assert.equal(state.left, 0);
  const event = new Event("beforeunload", { cancelable: true });
  b.emit("beforeunload", event);
  assert.equal(event.defaultPrevented, false);
});

test("现代浏览器不需要完整文档边界，不重写任何历史状态", () => {
  const b = browser();
  assert.equal(ensureTrainingDocumentBoundary(b.host), "ready");
  assert.deepEqual(b.calls.replaced, []);
  assert.deepEqual(b.calls.stateWrites, []);
});

test("旧浏览器 SPA 进入编辑器时完整替换文档，新文档直接可编辑且不会循环", () => {
  const spa = browser({ modern: false, initialPath: "/training" });
  assert.equal(ensureTrainingDocumentBoundary(spa.host), "replacing");
  assert.equal(ensureTrainingDocumentBoundary(spa.host), "replacing", "重复挂载不能发起多个文档导航");
  assert.deepEqual(spa.calls.replaced, [`${origin}/training/new?__bodytraceTrainingDocument=document-token`]);
  assert.equal(spa.host.history.length, 2);
  const loaded = browser({ modern: false });
  assert.equal(ensureTrainingDocumentBoundary(loaded.host), "ready");
  assert.equal(ensureTrainingDocumentBoundary(loaded.host), "ready", "StrictMode 同条目再次挂载不重复导航");
  assert.deepEqual(loaded.calls.replaced, []);
  assert.equal(loaded.host.history.state.existing, "retained");
  assert.equal(loaded.calls.stateWrites.length, 1);
  loaded.host.history.state = {};
  assert.equal(ensureTrainingDocumentBoundary(loaded.host), "replacing", "后来新入同一 URL 的 SPA 条目也要建立边界");
});

test("完整文档交接以不同 query URL 打开，抵达后保留业务参数、hash 与原历史状态并清理标识", () => {
  const path = "/training/new?copy=reference-id&mode=manual#sets";
  const spa = browser({ paths: ["/training", path], modern: false, initialPath: "/training" });
  assert.equal(ensureTrainingDocumentBoundary(spa.host), "replacing");
  const destination = new URL(spa.calls.replaced[0]);
  assert.equal(destination.searchParams.get("copy"), "reference-id");
  assert.equal(destination.searchParams.get("mode"), "manual");
  assert.equal(destination.searchParams.get("__bodytraceTrainingDocument"), "document-token");
  assert.equal(destination.hash, "#sets");
  assert.notEqual(destination.href, `${origin}${path}`);
  const arrived = browser({ paths: ["/training", destination.pathname + destination.search + destination.hash], modern: false });
  assert.equal(ensureTrainingDocumentBoundary(arrived.host), "ready");
  assert.equal(arrived.host.location.href, `${origin}${path}`);
  assert.equal(arrived.host.history.state.existing, "retained");
  assert.equal(arrived.host.history.length, 2);
  assert.equal(ensureTrainingDocumentBoundary(arrived.host), "ready");
  assert.deepEqual(arrived.calls.replaced, []);
  assert.equal(arrived.calls.stateWrites.length, 1);
});

test("文档交接抵达时 Navigation API 已可用也清理临时 query", () => {
  const b = browser({ paths: ["/training", "/training/new?mode=manual&__bodytraceTrainingDocument=nonce"] });
  assert.equal(ensureTrainingDocumentBoundary(b.host), "ready");
  assert.equal(b.host.location.href, `${origin}/training/new?mode=manual`);
  assert.equal(b.host.history.state.existing, "retained");
  assert.deepEqual(b.calls.replaced, []);
});
