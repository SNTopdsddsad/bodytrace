type HistoryEntry = { key: string; index: number };
type Destination = HistoryEntry & { url: string; sameDocument: boolean };
type NavigationEvent = Event & { navigationType: string; destination: Destination };
type NavigationApi = EventTarget & {
  currentEntry: HistoryEntry;
  traverseTo: (key: string) => { committed: Promise<unknown>; finished: Promise<unknown> };
};
type GuardHost = Pick<Window, "addEventListener" | "removeEventListener" | "location" | "history" | "performance" | "crypto"> & { navigation?: unknown };
type GuardOptions = {
  shouldBlock: () => boolean;
  onBlocked: () => void;
  onLeave: () => void;
  onResume: () => void;
  onError: (message: string) => void;
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function entry(value: unknown): value is HistoryEntry {
  return object(value) && typeof value.key === "string" && Number.isInteger(value.index) && typeof value.index === "number" && value.index >= 0;
}

function navigationApi(value: unknown): value is NavigationApi {
  return object(value) && entry(value.currentEntry) && typeof value.addEventListener === "function" && typeof value.removeEventListener === "function" && typeof value.traverseTo === "function";
}

function navigationEvent(value: Event): value is NavigationEvent {
  return "navigationType" in value && typeof value.navigationType === "string" && "destination" in value && entry(value.destination) && "url" in value.destination && typeof value.destination.url === "string" && "sameDocument" in value.destination && typeof value.destination.sameDocument === "boolean";
}

function route(url: string) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

const documents = new WeakMap<object, { token: string; initialEntryClaimed: boolean; replacingFrom: string | null }>();
const boundaryField = "bodytraceTrainingDocument";
const boundaryParameter = "__bodytraceTrainingDocument";

function cleanBoundaryUrl(href: string) {
  const url = new URL(href);
  if (url.searchParams.has(boundaryParameter)) url.searchParams.delete(boundaryParameter);
  return url.href;
}

/**
 * 旧浏览器无法取消同文档的 popstate。进入编辑器时建立完整文档边界，
 * 让返回由 beforeunload 保护；replace 不增加历史条目，也不截断前进历史。
 * 不能用 reload 或同 URL replace：此前 pushState 条目可能仍共享文档。
 * 临时 query 只用于建立新文档，抵达后立即清理，不传递任何业务/API 数据。
 */
export function ensureTrainingDocumentBoundary(host: GuardHost = window): "ready" | "replacing" {
  const cleanHref = cleanBoundaryUrl(host.location.href);
  if (navigationApi(host.navigation)) {
    if (cleanHref !== host.location.href) host.history.replaceState(host.history.state, "", cleanHref);
    return "ready";
  }
  let document = documents.get(host);
  if (!document) {
    document = { token: host.crypto.randomUUID(), initialEntryClaimed: false, replacingFrom: null };
    documents.set(host, document);
  }
  const url = route(cleanHref);
  const state: unknown = host.history.state;
  const marker = object(state) ? state[boundaryField] : null;
  if (object(marker) && marker.token === document.token && marker.url === url) {
    if (cleanHref !== host.location.href) host.history.replaceState(state, "", cleanHref);
    return "ready";
  }
  const initialNavigation = host.performance.getEntriesByType("navigation")[0];
  if (!document.initialEntryClaimed && initialNavigation && route(cleanBoundaryUrl(initialNavigation.name)) === url) {
    document.initialEntryClaimed = true;
    host.history.replaceState({ ...(object(state) ? state : {}), [boundaryField]: { token: document.token, url } }, "", cleanHref);
    return "ready";
  }
  if (document.replacingFrom !== url) {
    document.replacingFrom = url;
    const destination = new URL(cleanHref);
    destination.searchParams.set(boundaryParameter, host.crypto.randomUUID());
    host.location.replace(destination.href);
  }
  return "replacing";
}

/** 不写入 Next 的路由状态；只取消原导航，或按原历史索引往返。 */
export function installTrainingNavigationGuard(options: GuardOptions, host: GuardHost = window) {
  const navigation = navigationApi(host.navigation) ? host.navigation : null;
  let disposed = false;
  let allowedKey: string | null = null;
  let blocked: Destination | null = null;
  let rollback: { origin: HistoryEntry; destination: Destination; restoring: boolean } | null = null;

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!options.shouldBlock()) return;
    event.preventDefault();
    event.returnValue = "本页仍有尚未保存的训练输入。";
  };
  const pageHide = () => options.onLeave();
  const pageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    allowedKey = null;
    blocked = null;
    rollback = null;
    options.onResume();
  };
  const onNavigate = (event: Event) => {
    if (!navigation || !navigationEvent(event) || event.navigationType !== "traverse") return;
    const destination = event.destination;
    if (rollback) {
      // 浏览器连续后退时，必须先回到原条目；不能在恢复中途开放确认。
      if (destination.key !== rollback.origin.key && event.cancelable) event.preventDefault();
      return;
    }
    if (allowedKey === destination.key) {
      allowedKey = null;
      options.onLeave();
      return;
    }
    if (route(destination.url) === route(host.location.href)) return;
    if (!options.shouldBlock()) {
      options.onLeave();
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
      blocked = destination;
      options.onBlocked();
    } else if (destination.sameDocument) {
      // 连续按返回时浏览器可撤销 cancelable 权限；在 popstate 捕获阶段
      // 先恢复原条目，再弹确认框，不让 Next 提前卸载仍有输入的编辑器。
      rollback ??= { origin: { key: navigation.currentEntry.key, index: navigation.currentEntry.index }, destination, restoring: false };
    }
    // 跨文档且不可取消的导航由 beforeunload 接管，不能提前标记离开。
  };
  const onPopState = (event: PopStateEvent) => {
    if (!navigation || !rollback) return;
    event.stopImmediatePropagation();
    const current = navigation.currentEntry;
    if (rollback.restoring && current.key === rollback.origin.key) {
      blocked = rollback.destination;
      rollback = null;
      // 恢复前 URL 短暂指向其他条目；其间的异步结果可能已被编辑器忽略。
      // 重新激活编辑会话，让在途写入进入可核对状态，避免永远停在“保存中”。
      options.onResume();
      options.onBlocked();
      return;
    }
    const delta = rollback.origin.index - current.index;
    if (delta !== 0) {
      rollback.restoring = true;
      host.history.go(delta);
    }
  };
  navigation?.addEventListener("navigate", onNavigate);
  host.addEventListener("popstate", onPopState, true);
  host.addEventListener("beforeunload", beforeUnload);
  host.addEventListener("pagehide", pageHide);
  host.addEventListener("pageshow", pageShow);

  return {
    confirmLeave() {
      if (disposed || !navigation || !blocked || rollback) return false;
      const destination = blocked;
      blocked = null;
      allowedKey = destination.key;
      const failed = () => {
        if (disposed) return;
        allowedKey = null;
        blocked = destination;
        options.onError("未能返回原来的页面，输入仍保留，请重试或使用页面中的返回链接。");
      };
      try {
        const result = navigation.traverseTo(destination.key);
        void result.committed.catch(failed);
        void result.finished.catch(() => {});
      } catch {
        failed();
      }
      return true;
    },
    cancelLeave() { blocked = null; },
    dispose() {
      disposed = true;
      navigation?.removeEventListener("navigate", onNavigate);
      host.removeEventListener("popstate", onPopState, true);
      host.removeEventListener("beforeunload", beforeUnload);
      host.removeEventListener("pagehide", pageHide);
      host.removeEventListener("pageshow", pageShow);
    },
  };
}
