"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useIsPresent } from "motion/react";
import type { Food } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import {
  DeepSeekClientError,
  estimateNutritionWithDeepSeek,
  extractReferenceSearchTerms,
  prefillFoodWithDeepSeek,
  type DeepSeekChatTurn,
  type ReferenceContextItem,
  type WebSearchSource,
} from "@/lib/deepseek-client";
import { MEAL_LABELS, round1, scaleMacro, type MealType } from "@/lib/nutrition";
import {
  draftCommitPayload, makeEditableDraft, revisePendingDrafts,
  type AiDraftCommitPayload, type EditableDraft,
} from "@/lib/nutrition-drafts";
import {
  DeepSeekConfigForm,
  dispatchOpenDeepSeekConfig,
  useDeepSeekConfig,
} from "./deepseek-config-dialog";

const STARTER_PROMPTS = [
  "一碗兰州牛肉面，少放辣油",
  "霸王茶姬伯牙绝弦中杯三分糖",
  "午饭：2个水煮蛋、半碗米饭、一盘番茄炒蛋",
] as const;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  drafts?: EditableDraft[];
  quickReplies?: string[];
  superseded?: boolean;
  error?: string;
  sourcePrompt?: string;
  webSources?: WebSearchSource[];
};

function makeLocalId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampField(raw: string, min: number, max: number, fallback: number): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return round1(Math.min(max, Math.max(min, num)));
}

async function fetchReferenceContext(message: string, externalSignal: AbortSignal): Promise<ReferenceContextItem[]> {
  const terms = extractReferenceSearchTerms(message);
  if (terms.length === 0) return [];
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  externalSignal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), 2_500);
  try {
    const settled = await Promise.allSettled(
      terms.map((term) =>
        api<{ foods: ReferenceContextItem[] }>(
          `/api/v1/foods/reference?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        ),
      ),
    );
    const seen = new Set<string>();
    const combined: ReferenceContextItem[] = [];
    for (const item of settled) {
      if (item.status !== "fulfilled") continue;
      for (const ref of item.value.foods.slice(0, 4)) {
        if (!seen.has(ref.foodCode)) {
          seen.add(ref.foodCode);
          combined.push(ref);
        }
      }
    }
    return combined.slice(0, 10);
  } finally {
    clearTimeout(timer);
    externalSignal.removeEventListener("abort", onAbort);
  }
}

export function AiNutritionPanel({
  userId,
  date,
  canRecord,
  targetMeal,
  myFoods,
  writeBlocked,
  loggingKey,
  pendingPrompt,
  onConsumePendingPrompt,
  onCommitDraft,
  onFallbackCustomFood,
}: {
  userId: string;
  date: string;
  canRecord: boolean;
  targetMeal: MealType;
  myFoods: Food[];
  writeBlocked: boolean;
  loggingKey: string | null;
  pendingPrompt: { id: number; text: string } | null;
  onConsumePendingPrompt: () => void;
  onCommitDraft: (key: string, payload: AiDraftCommitPayload, onFoodSaved: (food: Food) => void) => Promise<string | null>;
  onFallbackCustomFood: (initialName: string) => void;
}) {
  const config = useDeepSeekConfig(userId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [stageText, setStageText] = useState("");
  const [showNotice, setShowNotice] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastConsumedPromptIdRef = useRef<number>(0);
  const latestEstimate = messages.findLast(message => message.drafts !== undefined);
  const latestDrafts = latestEstimate?.drafts;
  const revisePending = latestDrafts?.some(draft => draft.loggedSummary || draft.savedFood) ?? false;
  const promptBlocked = generating || writeBlocked;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [config]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  const sendPrompt = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || promptBlocked || abortRef.current) return;
      if (!config) {
        setInput(text);
        return;
      }

      setInput("");
      const controller = new AbortController();
      abortRef.current = controller;
      setGenerating(true);
      setStageText("正在检索食物库与官方成分表…");

      // 当前清单使用本地编号，供模型区分份量修订、删除和新增。
      const rounds = messages.slice(messages.findLastIndex(m => m.drafts?.length === 0) + 1)
        .filter(m => m.drafts?.length).slice(revisePending ? -1 : -3);
      const history = rounds.flatMap<DeepSeekChatTurn>(round => [
        { role: "user", content: round.sourcePrompt ?? "当前食物清单" },
        { role: "assistant", content: JSON.stringify({
          reply: round.text,
          items: round.drafts?.map(draft => ({
            previousDraftId: round === latestEstimate ? draft.localId : undefined,
            name: draft.name, grams: draft.grams, saved: Boolean(draft.loggedSummary),
            source: draft.source, matchedFoodId: draft.matchedFoodId, matchedReferenceCode: draft.matchedReferenceCode,
            per100g: draft.per100g, servingGrams: draft.servingGrams, assumption: draft.assumption,
          })),
        }) },
      ]);

      const userMsgId = makeLocalId();
      setMessages((prev) => [...prev, { id: userMsgId, role: "user", text }]);
      scrollToBottom();

      try {
        const referenceFoods = await fetchReferenceContext(text, controller.signal);
        if (controller.signal.aborted) return;

        setStageText(`正在通过 DeepSeek 搜索网页并估算营养（${config.model}）…`);
        scrollToBottom();

        const result = await estimateNutritionWithDeepSeek({
          config,
          userMessage: text,
          previousDrafts: latestDrafts,
          history,
          myFoods,
          referenceFoods,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        const drafts = latestDrafts?.length
          ? revisePendingDrafts(latestDrafts, result.items, makeLocalId)
          : result.items.map(item => makeEditableDraft(item, makeLocalId()));
        setMessages((prev) => [
          ...prev.map((m) =>
            m.drafts ? { ...m, superseded: true } : m,
          ),
          {
            id: makeLocalId(),
            role: "assistant",
            text: result.reply,
            drafts,
            quickReplies: result.quickReplies,
            webSources: result.webSources,
            sourcePrompt: text,
          },
        ]);
        scrollToBottom();
      } catch (err) {
        if (abortRef.current !== controller) return;
        if (err instanceof DeepSeekClientError && err.code === "aborted") {
          setMessages((prev) => [
            ...prev,
            { id: makeLocalId(), role: "assistant", text: "已停止生成。你可以补充描述后重新估算。" },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: makeLocalId(),
              role: "assistant",
              text: "",
              error: err instanceof Error ? err.message : "估算请求失败，请重试",
              sourcePrompt: text,
            },
          ]);
        }
        scrollToBottom();
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setGenerating(false);
          setStageText("");
        }
      }
    },
    [config, promptBlocked, myFoods, messages, latestDrafts, latestEstimate, revisePending, scrollToBottom],
  );

  // 承接从「查库入账」无结果跳转过来的估算词
  useEffect(() => {
    if (!pendingPrompt || pendingPrompt.id === lastConsumedPromptIdRef.current) return;
    lastConsumedPromptIdRef.current = pendingPrompt.id;
    onConsumePendingPrompt();
    setInput(pendingPrompt.text);
  }, [pendingPrompt, onConsumePendingPrompt]);

  function stopGenerating() {
    abortRef.current?.abort();
  }

  function resetConversation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
    setStageText("");
    setMessages([]);
  }

  function updateDraft(
    msgId: string,
    draftId: string,
    updater: (draft: EditableDraft) => EditableDraft,
  ) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.drafts) return m;
        return {
          ...m,
          drafts: m.drafts.map((d) => (d.localId === draftId ? updater(d) : d)),
        };
      }),
    );
  }

  async function commitSingleDraft(msgId: string, draft: EditableDraft) {
    if (draft.loggedSummary || writeBlocked || generating) return null;
    if (!draft.name.trim()) {
      toast.error("请填写食物名称");
      return null;
    }
    const summary = await onCommitDraft(`ai-${draft.localId}`, draftCommitPayload(draft, myFoods), food => {
      updateDraft(msgId, draft.localId, d => ({
        ...d, savedFood: food, matchedFoodId: food.id, saveToLibrary: false,
      }));
    });
    if (summary) {
      updateDraft(msgId, draft.localId, (d) => ({ ...d, loggedSummary: summary }));
    }
    return summary;
  }

  async function commitSelectedDrafts(msgId: string, drafts: EditableDraft[]) {
    const targets = drafts.filter((d) => d.selected && !d.loggedSummary);
    if (targets.length === 0 || writeBlocked) return;
    for (const draft of targets) {
      if (!await commitSingleDraft(msgId, draft)) break;
    }
  }

  const mealLabel = MEAL_LABELS[targetMeal];

  /* ---------------- 状态 1：未配置本地 DeepSeek Key 的内联引导 ---------------- */
  if (!config) {
    return (
      <div className="space-y-3.5 text-xs">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
            <ShieldCheck className="size-3" aria-hidden />
            仅保存在当前浏览器本地
          </span>
          <h4 className="text-sm font-bold">填写你的 DeepSeek 官方配置即可开始估算</h4>
          <p className="leading-5 text-muted-foreground">
            请求由浏览器直连 DeepSeek 官方接口，API Key 与 Base URL 仅保存在本机浏览器（
            <code className="font-mono">localStorage</code>
            ），不经 BodyTrace 服务器；<strong className="text-foreground">退出登录时自动清除</strong>。
          </p>
        </div>

        {input.trim() && (
          <div className="rounded-xl border border-chart-3/40 bg-chart-3/10 px-3 py-2 text-[11px] text-foreground">
            待估算内容已保留：<strong>「{input.trim()}」</strong>，保存配置后即可直接发送。
          </div>
        )}

        <div className="rounded-2xl border bg-background p-3.5">
          <DeepSeekConfigForm
            userId={userId}
            initialConfig={null}
            compact
          />
        </div>
      </div>
    );
  }

  /* ---------------- 状态 2：已配置本地密钥的对话与草稿卡流 ---------------- */
  return (
    <div className="flex min-h-[420px] flex-col xl:max-h-[calc(100svh-14.5rem)]">
      {/* 顶部状态栏：官方直连标识 + 新对话 + 修改密钥 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-[11px]">
        <button
          type="button"
          onClick={() => dispatchOpenDeepSeekConfig()}
          className="inline-flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          title="查看或修改本地 DeepSeek 官方配置"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <span className="truncate font-mono">
            官方直连 · {config.model}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2.5">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetConversation}
              disabled={writeBlocked}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <RotateCcw className="size-3" aria-hidden />
              新对话
            </button>
          )}
          <button
            type="button"
            onClick={() => dispatchOpenDeepSeekConfig()}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <KeyRound className="size-3" aria-hidden />
            修改密钥
          </button>
        </div>
      </div>

      {/* 可滚动对话流 */}
      <div
        ref={scrollRef}
        className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {showNotice && (
          <div className="flex items-start justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-[11px] leading-4 text-muted-foreground">
            <span>
              每次估算都会调用 DeepSeek 网页搜索。搜索词来自本次描述和当前草稿食物名，超长时会额外调用一次模型提取食品和品牌。搜索有结果时按次计费，提取和估算按模型用量计费。生成草稿时还会发送相关对话、匹配的个人食物（编号、名称、营养值、份量）及公开成分表数据。
            </span>
            <button
              type="button"
              onClick={() => setShowNotice(false)}
              className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="关闭估算说明"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        {!canRecord && (
          <div className="rounded-xl border border-chart-3/40 bg-chart-3/10 px-3 py-2 text-[11px] text-foreground">
            当前查看的是未来日期（{date}）：不可记入餐次，但可估算营养并存入「我的食物库」。
          </div>
        )}

        {messages.length === 0 ? (
          <div className="space-y-3 py-3">
            <div className="space-y-1">
              <p className="text-sm font-bold">告诉我你吃了什么，我来帮你算营养</p>
              <p className="text-xs leading-5 text-muted-foreground">
                支持外食单品、连锁饮品或整顿饭拆解；命中个人食物库和《中国食物成分表》的会优先复用权威值。
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">点示例快速开始：</p>
              {STARTER_PROMPTS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  disabled={promptBlocked}
                  onClick={() => void sendPrompt(sample)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2.5 text-left text-xs font-medium transition-colors hover:border-primary/40 hover:bg-secondary/60 disabled:opacity-50"
                >
                  <span>{sample}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-primary" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-xs leading-5 text-primary-foreground">
                    {msg.text}
                  </div>
                </div>
              );
            }

            const unloggedSelected = (msg.drafts ?? []).filter(
              (d) => d.selected && !d.loggedSummary,
            );
            const isSuperseded = Boolean(msg.superseded);

            return (
              <div key={msg.id} className="space-y-2.5">
                {msg.error ? (
                  <div
                    role="alert"
                    className="space-y-2.5 rounded-2xl rounded-tl-sm border border-destructive/40 bg-background p-3.5 text-xs"
                  >
                    <p className="font-semibold text-destructive">估算未能完成</p>
                    <p className="leading-5 text-muted-foreground">{msg.error}</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sourcePrompt && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={promptBlocked}
                          onClick={() => void sendPrompt(msg.sourcePrompt!)}
                          className="h-8 text-xs"
                        >
                          重试估算
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => dispatchOpenDeepSeekConfig()}
                        className="h-8 text-xs"
                      >
                        检查本地配置
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onFallbackCustomFood((msg.sourcePrompt ?? "").slice(0, 24))}
                        className="h-8 text-xs"
                      >
                        手动新建食物
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl rounded-tl-sm border bg-background px-3.5 py-2.5 text-xs leading-5">
                    {msg.text}
                    {msg.webSources && (msg.webSources.length ? (
                      <details className="mt-2 text-muted-foreground">
                        <summary className="cursor-pointer">查看本轮检索到的网页（{msg.webSources.length}）</summary>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {msg.webSources.map(({ title, url }, index) => (
                            <li key={`${index}-${url}`}>
                              <a href={url} target="_blank" rel="noopener noreferrer" className="break-words underline">{title || url}</a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p className="mt-2 text-muted-foreground">本轮网页搜索无结果。</p>
                    ))}
                  </div>
                )}

                {msg.drafts && msg.drafts.length > 0 && (
                  <div className={`space-y-2 ${isSuperseded ? "opacity-60" : ""}`}>
                    {isSuperseded && (
                      <p className="text-[11px] text-muted-foreground">
                        以下为上一轮估算，已更新为下方最新版本
                      </p>
                    )}

                    {msg.drafts.map((draft) => {
                      const scaled = scaleMacro(draft.per100g, draft.grams);
                      const isLogged = Boolean(draft.loggedSummary);
                      const isSavingThis = loggingKey === `ai-${draft.localId}`;
                      const linkedFood = draft.matchedFoodId ? draftCommitPayload(draft, myFoods).matchedFoodId : null;
                      const futurePersonalOnly = !canRecord && Boolean(linkedFood);
                      const locked = isLogged || isSavingThis || isSuperseded || writeBlocked || generating;

                      const baseServing = draft.servingGrams || draft.grams || 100;
                      const quickOptions = [
                        { label: "半份", grams: Math.max(1, Math.round(baseServing * 0.5)) },
                        { label: "1份", grams: Math.round(baseServing) },
                        { label: "1.5份", grams: Math.min(5000, Math.round(baseServing * 1.5)) },
                      ];

                      const badgeText =
                        draft.matchedFoodId
                          ? linkedFood ? "我的食物库" : "本次修改"
                          : draft.source === "reference"
                            ? "官方成分表"
                            : "AI 估算 · 参考";
                      const badgeClass =
                        draft.source === "ai"
                          ? "border-chart-3/40 bg-chart-3/15 text-foreground"
                          : "border-primary/20 bg-secondary text-secondary-foreground";

                      return (
                        <div
                          key={draft.localId}
                          className={`rounded-2xl border bg-card p-3.5 text-xs shadow-xs ${
                            isLogged
                              ? "border-primary"
                              : isSuperseded
                                ? "border-border"
                                : "border-primary/25"
                          }`}
                        >
                          {/* 头部：勾选 + 食物名 + 来源 */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              {msg.drafts!.length > 1 && !isLogged && (
                                <input
                                  type="checkbox"
                                  checked={draft.selected}
                                  disabled={locked}
                                  aria-label={`选择 ${draft.name}`}
                                  onChange={(e) =>
                                    updateDraft(msg.id, draft.localId, (d) => ({
                                      ...d,
                                      selected: e.target.checked,
                                    }))
                                  }
                                  className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold">{draft.name}</div>
                                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                  {draft.assumption}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}
                            >
                              {badgeText}
                            </span>
                          </div>

                          {/* 份量输入 + 快捷档位 */}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background px-2.5 py-2">
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span>本次份量</span>
                              <Input
                                type="number"
                                min={1}
                                max={5000}
                                step="any"
                                disabled={locked}
                                aria-label={`${draft.name}本次食用克数`}
                                value={draft.gramsText}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const parsed = Number(raw);
                                  updateDraft(msg.id, draft.localId, (d) => ({
                                    ...d,
                                    gramsText: raw,
                                    grams:
                                      raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 1 && parsed <= 5000
                                        ? round1(parsed)
                                        : d.grams,
                                  }));
                                }}
                                onBlur={() =>
                                  updateDraft(msg.id, draft.localId, (d) => {
                                    const clamped = clampField(d.gramsText, 1, 5000, d.grams);
                                    return { ...d, grams: clamped, gramsText: String(clamped) };
                                  })
                                }
                                className="h-7 w-16 bg-card px-2 text-center font-mono text-xs font-bold"
                              />
                              <span>g</span>
                            </label>

                            <div className="flex items-center gap-1">
                              {quickOptions.map((opt) => {
                                const active = Math.round(draft.grams) === opt.grams;
                                return (
                                  <button
                                    key={opt.label}
                                    type="button"
                                    disabled={locked}
                                    onClick={() =>
                                      updateDraft(msg.id, draft.localId, (d) => ({
                                        ...d,
                                        grams: opt.grams,
                                        gramsText: String(opt.grams),
                                      }))
                                    }
                                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-45 ${
                                      active
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 实际营养素汇总 */}
                          <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center font-mono tabular-nums">
                            <div className="rounded-xl bg-secondary px-2 py-2">
                              <div className="text-[10px] text-secondary-foreground">热量</div>
                              <div className="mt-0.5 text-sm font-bold text-primary">
                                {Math.round(scaled.calories)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">kcal</div>
                            </div>
                            <div className="rounded-xl bg-background px-2 py-2">
                              <div className="text-[10px] text-muted-foreground">蛋白</div>
                              <div className="mt-0.5 text-sm font-bold">{scaled.protein}</div>
                              <div className="text-[10px] text-muted-foreground">g</div>
                            </div>
                            <div className="rounded-xl bg-background px-2 py-2">
                              <div className="text-[10px] text-muted-foreground">碳水</div>
                              <div className="mt-0.5 text-sm font-bold">{scaled.carbs}</div>
                              <div className="text-[10px] text-muted-foreground">g</div>
                            </div>
                            <div className="rounded-xl bg-background px-2 py-2">
                              <div className="text-[10px] text-muted-foreground">脂肪</div>
                              <div className="mt-0.5 text-sm font-bold">{scaled.fat}</div>
                              <div className="text-[10px] text-muted-foreground">g</div>
                            </div>
                          </div>

                          {/* 可折叠每 100g 基准编辑 */}
                          <div className="mt-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft(msg.id, draft.localId, (d) => ({
                                  ...d,
                                  expanded: !d.expanded,
                                }))
                              }
                              aria-expanded={draft.expanded}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              {draft.expanded ? (
                                <ChevronDown className="size-3.5" aria-hidden />
                              ) : (
                                <ChevronRight className="size-3.5" aria-hidden />
                              )}
                              <span className="font-mono tabular-nums">
                                每 100g 基准：{Math.round(draft.per100g.calories)} kcal · P{" "}
                                {draft.per100g.protein} · C {draft.per100g.carbs} · F{" "}
                                {draft.per100g.fat}
                              </span>
                            </button>

                            {draft.expanded && (
                              <div className="mt-2 space-y-2 rounded-xl border bg-background p-2.5">
                                <label className="block space-y-1">
                                  <span className="text-[10px] text-muted-foreground">食物名称</span>
                                  <Input
                                    type="text"
                                    maxLength={100}
                                    disabled={locked}
                                    value={draft.name}
                                    onChange={(e) =>
                                      updateDraft(msg.id, draft.localId, (d) => ({
                                        ...d,
                                        name: e.target.value,
                                      }))
                                    }
                                    className="h-7 bg-card px-2 text-xs"
                                  />
                                </label>
                                <div className="grid grid-cols-4 gap-1.5 font-mono">
                                  {(
                                    [
                                      { label: "热量/100g", textKey: "calText", macroKey: "calories", max: 2000 },
                                      { label: "蛋白 g", textKey: "proText", macroKey: "protein", max: 200 },
                                      { label: "碳水 g", textKey: "carbText", macroKey: "carbs", max: 200 },
                                      { label: "脂肪 g", textKey: "fatText", macroKey: "fat", max: 200 },
                                    ] as const
                                  ).map((field) => (
                                    <label key={field.macroKey} className="space-y-0.5">
                                      <span className="text-[10px] text-muted-foreground">
                                        {field.label}
                                      </span>
                                      <Input
                                        type="number"
                                        min={0}
                                        max={field.max}
                                        step="0.1"
                                        disabled={locked}
                                        value={draft[field.textKey]}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          const num = Number(raw);
                                          updateDraft(msg.id, draft.localId, (d) => ({
                                            ...d,
                                            [field.textKey]: raw,
                                            per100g:
                                              raw.trim() !== "" && Number.isFinite(num) && num >= 0 && num <= field.max
                                                ? { ...d.per100g, [field.macroKey]: round1(num) }
                                                : d.per100g,
                                          }));
                                        }}
                                        onBlur={() =>
                                          updateDraft(msg.id, draft.localId, (d) => {
                                            const clamped = clampField(
                                              d[field.textKey],
                                              0,
                                              field.max,
                                              d.per100g[field.macroKey],
                                            );
                                            return {
                                              ...d,
                                              [field.textKey]: String(clamped),
                                              per100g: { ...d.per100g, [field.macroKey]: clamped },
                                            };
                                          })
                                        }
                                        className="h-7 bg-card px-1.5 text-xs"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 底部确认与可选存入食物库 */}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
                            {isLogged ? (
                              <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground">
                                <Check className="size-3.5 text-primary" aria-hidden />
                                <span>{draft.loggedSummary}</span>
                              </div>
                            ) : (
                              <>
                                {draft.matchedFoodId ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    {linkedFood ? "已在你的食物库中" : "按本次修改的值保存"}
                                  </span>
                                ) : (
                                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={draft.saveToLibrary}
                                      disabled={locked || !canRecord}
                                      onChange={(e) =>
                                        updateDraft(msg.id, draft.localId, (d) => ({
                                          ...d,
                                          saveToLibrary: e.target.checked,
                                        }))
                                      }
                                      className="size-3.5 rounded accent-primary"
                                    />
                                    <span>同时存入我的食物库</span>
                                  </label>
                                )}

                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={locked || futurePersonalOnly}
                                  onClick={() => void commitSingleDraft(msg.id, draft)}
                                  className="h-8 rounded-xl px-3.5 text-xs font-semibold"
                                >
                                  {isSavingThis ? (
                                    <>
                                      <Loader2 className="size-3 animate-spin" aria-hidden />
                                      记入中…
                                    </>
                                  ) : canRecord ? (
                                    `记入${mealLabel}`
                                  ) : futurePersonalOnly ? (
                                    "未来日期不可记"
                                  ) : (
                                    "仅存入食物库"
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {msg.drafts.length > 1 && unloggedSelected.length > 1 && !isSuperseded && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canRecord || writeBlocked || generating}
                        onClick={() => void commitSelectedDrafts(msg.id, msg.drafts!)}
                        className="h-9 w-full rounded-xl text-xs font-semibold"
                      >
                        <Check className="size-3.5" aria-hidden />
                        一键记入所选 {unloggedSelected.length} 项到{mealLabel}
                      </Button>
                    )}
                  </div>
                )}

                {!isSuperseded && msg.quickReplies && msg.quickReplies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msg.quickReplies.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        disabled={promptBlocked}
                        onClick={() => void sendPrompt(reply)}
                        className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/70 disabled:opacity-45"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {generating && (
          <div className="space-y-2">
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border bg-background px-3.5 py-2.5 text-xs text-muted-foreground"
            >
              <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
              <span>{stageText || "DeepSeek 正在估算…"}</span>
            </div>
            <div className="space-y-2 rounded-2xl border bg-card p-3.5" aria-hidden>
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
              <div className="grid grid-cols-4 gap-2 pt-1">
                <div className="h-9 animate-pulse rounded-xl bg-muted" />
                <div className="h-9 animate-pulse rounded-xl bg-muted" />
                <div className="h-9 animate-pulse rounded-xl bg-muted" />
                <div className="h-9 animate-pulse rounded-xl bg-muted" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部输入栏 */}
      {revisePending && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          已保存的食物会保留原记录。追问新增的食物需单独确认或勾选后批量记入。
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendPrompt(input);
        }}
        className="mt-3 flex shrink-0 items-end gap-2 border-t pt-3"
      >
        <textarea
          rows={1}
          value={input}
          disabled={promptBlocked}
          aria-label="输入食物描述让 DeepSeek 估算热量与营养素"
          placeholder="描述菜品、份量或追问微调，如：一碗牛肉面少油…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendPrompt(input);
            }
          }}
          className="max-h-24 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-xs leading-4 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
        />
        {generating ? (
          <Button
            type="button"
            variant="outline"
            onClick={stopGenerating}
            className="h-10 shrink-0 rounded-xl border-destructive/40 px-3 text-xs font-semibold text-destructive hover:border-destructive hover:text-destructive"
          >
            <Square className="size-3 fill-current" aria-hidden />
            停止
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!input.trim() || promptBlocked}
            className="h-10 shrink-0 rounded-xl px-3.5 text-xs font-semibold"
          >
            <Send className="size-3.5" aria-hidden />
            估算
          </Button>
        )}
      </form>
    </div>
  );
}

export function AiPrefillButton({
  userId,
  foodName,
  brand,
  disabled,
  onPrefilled,
}: {
  userId: string;
  foodName: string;
  brand?: string;
  disabled?: boolean;
  onPrefilled: (values: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    servingGrams: number;
    assumption: string;
  }) => void;
}) {
  const config = useDeepSeekConfig(userId);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const present = useIsPresent();
  useLayoutEffect(() => {
    return () => request.current?.abort();
  }, [foodName, brand, userId, config, disabled, present]);

  async function handlePrefill() {
    if (request.current || disabled || !present) return;
    const trimmed = foodName.trim();
    if (!trimmed) {
      toast.error("请先填写食物名称，再使用 AI 帮填");
      return;
    }
    if (!config) {
      toast.error("请先配置你自己的 DeepSeek 官方 API Key");
      dispatchOpenDeepSeekConfig();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const values = await prefillFoodWithDeepSeek({
        config,
        foodName: trimmed,
        brand,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      onPrefilled(values);
      toast.success(`DeepSeek 已预填「${trimmed}」每 100g 参考营养，请核对后保存`);
    } catch (err) {
      if (!controller.signal.aborted) toast.error(err instanceof Error ? err.message : "AI 帮填失败，请手动输入");
    } finally {
      request.current = null;
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled || busy}
      onClick={() => void handlePrefill()}
      className="h-8 shrink-0 gap-1 rounded-lg px-2.5 text-xs font-semibold"
      title={config ? "使用 DeepSeek 网页搜索食物名称和品牌，再预填每 100g 营养值" : "先配置本地 DeepSeek API Key"}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-3" aria-hidden />
      )}
      {busy ? "估算中…" : "AI 帮填"}
    </Button>
  );
}
