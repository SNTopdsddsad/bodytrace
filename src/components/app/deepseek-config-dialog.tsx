"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { withRequestTimeout } from "@/lib/request-timeout";
import {
  clearDeepSeekConfig,
  DEEPSEEK_CONFIG_EVENT,
  DEEPSEEK_STORAGE_KEY,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  parseDeepSeekConfig,
  maskApiKey,
  saveDeepSeekConfig,
  testDeepSeekConnection,
  type DeepSeekLocalConfig,
} from "@/lib/deepseek-client";

export const OPEN_DEEPSEEK_CONFIG_EVENT = "bodytrace:open-deepseek-config";

export function dispatchOpenDeepSeekConfig() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_DEEPSEEK_CONFIG_EVENT));
}

function subscribeDeepSeekStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DEEPSEEK_STORAGE_KEY) callback();
  };
  window.addEventListener(DEEPSEEK_CONFIG_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(DEEPSEEK_CONFIG_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function readRawDeepSeekSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEEPSEEK_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 响应式读取当前账号绑定的本地 DeepSeek 配置（SSR 水合安全，支持跨标签页同步）。 */
export function useDeepSeekConfig(userId: string): DeepSeekLocalConfig | null {
  const raw = useSyncExternalStore(
    subscribeDeepSeekStorage,
    readRawDeepSeekSnapshot,
    () => null,
  );
  return useMemo(() => parseDeepSeekConfig(userId, raw), [raw, userId]);
}

type FormProps = {
  userId: string;
  initialConfig: DeepSeekLocalConfig | null;
  compact?: boolean;
  showClear?: boolean;
  onSaved?: (config: DeepSeekLocalConfig) => void;
  onCleared?: () => void;
};

/**
 * 可复用的 DeepSeek 官方本地配置表单：
 * - 用于「AI 估算」首次未配置的内联引导；
 * - 也用于全局「配置 AI」设置弹窗。
 */
export function DeepSeekConfigForm({
  userId,
  initialConfig,
  compact = false,
  showClear = false,
  onSaved,
  onCleared,
}: FormProps) {
  const [baseUrl, setBaseUrl] = useState(initialConfig?.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL);
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey ?? "");
  const [model, setModel] = useState(initialConfig?.model ?? DEFAULT_DEEPSEEK_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const idPrefix = useId();

  useLayoutEffect(() => {
    const cancel = () => abortRef.current?.abort();
    const unsubscribe = subscribeDeepSeekStorage(cancel);
    return () => {
      unsubscribe();
      cancel();
    };
  }, [userId]);

  async function submitConfig(action: "save" | "test" | "testAndSave") {
    if (abortRef.current) return;
    setError("");
    setStatusMessage("");
    const controller = new AbortController();
    abortRef.current = controller;
    setTesting(true);
    try {
      if (action !== "save") {
        const result = await testDeepSeekConnection({ baseUrl, apiKey, model }, controller.signal);
        if (controller.signal.aborted) return;
        if (action === "test") {
          setStatusMessage(`已连通 ${result.endpoint}（模型 ${result.model}），点击「保存到本地」生效。`);
          return;
        }
      }
      // 另一标签页可能已经退出或切换账号，保存前用当前 Cookie 核对。
      const session = await withRequestTimeout(signal => authClient.getSession({
        query: { disableCookieCache: true },
        fetchOptions: { signal: AbortSignal.any([signal, controller.signal]), cache: "no-store" },
      }));
      if (controller.signal.aborted) return;
      if (session.error || session.data?.user.id !== userId) {
        throw new Error("请刷新页面核对当前登录账号，再保存配置");
      }
      const saved = saveDeepSeekConfig(userId, { baseUrl, apiKey, model });
      toast.success(`已保存到本机浏览器（${saved.model}）`);
      onSaved?.(saved);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "请检查配置后重试");
    } finally {
      abortRef.current = null;
      setTesting(false);
    }
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    void submitConfig("save");
  }

  function handleClear() {
    abortRef.current?.abort();
    clearDeepSeekConfig();
    setBaseUrl(DEFAULT_DEEPSEEK_BASE_URL);
    setApiKey("");
    setModel(DEFAULT_DEEPSEEK_MODEL);
    setError("");
    setStatusMessage("");
    toast.success("已清除本机保存的 DeepSeek 配置");
    onCleared?.();
  }

  return (
    <form onSubmit={handleSave} className="space-y-3 text-xs">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-base-url`} className="text-xs font-semibold">
            DeepSeek 官方 Base URL *
          </Label>
          <button
            type="button"
            disabled={testing}
            onClick={() => {
              setBaseUrl(DEFAULT_DEEPSEEK_BASE_URL);
              setError("");
              setStatusMessage("");
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline underline-offset-2 disabled:opacity-50"
          >
            <RotateCcw className="size-3" aria-hidden />
            恢复默认
          </button>
        </div>
        <Input
          id={`${idPrefix}-base-url`}
          type="url"
          required
          disabled={testing}
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            setError("");
            setStatusMessage("");
          }}
          placeholder={DEFAULT_DEEPSEEK_BASE_URL}
          className="h-9 bg-card font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          仅支持 DeepSeek 官方 HTTPS 地址（<code className="font-mono">https://api.deepseek.com</code> 或 <code className="font-mono">/v1</code>）。
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-api-key`} className="text-xs font-semibold">
            API Key *
          </Label>
          {initialConfig?.apiKey && (
            <span className="font-mono text-[11px] text-muted-foreground">
              已存：{maskApiKey(initialConfig.apiKey)}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <Input
            id={`${idPrefix}-api-key`}
            type={showKey ? "text" : "password"}
            required
            autoComplete="off"
            spellCheck={false}
            disabled={testing}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError("");
              setStatusMessage("");
            }}
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
            className="h-9 flex-1 bg-card font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testing}
            onClick={() => setShowKey((prev) => !prev)}
            className="h-9 shrink-0 px-2.5 text-xs"
            aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
          >
            {showKey ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            <span className="sr-only sm:not-sr-only">{showKey ? "隐藏" : "显示"}</span>
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-model`} className="text-xs font-semibold">
          模型名称
        </Label>
        <Input
          id={`${idPrefix}-model`}
          type="text"
          disabled={testing}
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setError("");
            setStatusMessage("");
          }}
          placeholder={DEFAULT_DEEPSEEK_MODEL}
          className="h-9 bg-card font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          默认使用 <code className="font-mono">{DEFAULT_DEEPSEEK_MODEL}</code>，支持结构化 JSON 输出。
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-[11px] leading-5 text-destructive"
        >
          {error}
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="flex items-start gap-1.5 rounded-xl border border-primary/25 bg-secondary px-3 py-2 text-[11px] leading-5 text-secondary-foreground"
        >
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <span>{statusMessage}</span>
        </div>
      )}

      {compact ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={testing}
            onClick={() => void submitConfig("testAndSave")}
            className="h-9 flex-1 text-xs"
          >
            {testing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                测试连接中…
              </>
            ) : (
              "测试连接并保存"
            )}
          </Button>
          <Button type="submit" variant="outline" size="sm" disabled={testing} className="h-9 text-xs">
            直接保存
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          {showClear ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing || !initialConfig}
              onClick={handleClear}
              className="h-9 text-xs text-destructive hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
              清除本地配置
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={() => void submitConfig("test")}
              className="h-9 text-xs"
            >
              {testing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  测试中…
                </>
              ) : (
                "测试连接"
              )}
            </Button>
            <Button type="submit" size="sm" disabled={testing} className="h-9 text-xs">
              保存到本地
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export function DeepSeekConfigDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const config = useDeepSeekConfig(userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/20 bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
            <ShieldCheck className="size-3" aria-hidden />
            官方直连 · 仅保存于本机
          </span>
          <DialogTitle className="mt-1 flex items-center gap-2 text-base font-bold">
            <KeyRound className="size-4 text-primary" aria-hidden />
            DeepSeek 本地接口配置
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            API Key 与 Base URL 保存在当前浏览器（<code className="font-mono">localStorage</code>），退出或切换账号时清除。每次估算和帮填都会直连 DeepSeek，网页搜索有结果时按次计费。生成草稿和从超长描述中提取搜索词按模型用量计费。
          </DialogDescription>
        </DialogHeader>

        {open && (
          <DeepSeekConfigForm
            key={`${userId}:${config?.apiKey ?? "none"}:${config?.baseUrl ?? "default"}:${config?.model ?? "default"}`}
            userId={userId}
            initialConfig={config}
            showClear
            onSaved={() => onOpenChange(false)}
            onCleared={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
