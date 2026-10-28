/**
 * 页面级加载骨架：结构对齐 PageHeader 与内容网格，
 * 让 App Router 在服务端渲染完成前就能展示稳定布局，避免白屏和布局跳动。
 */
export function PageSkeleton({ label, blocks, layout = "stack" }: {
  label: string;
  blocks: number;
  layout?: "stack" | "aside" | "grid";
}) {
  const containerClass = layout === "aside"
    ? "grid gap-6 xl:grid-cols-[1.5fr_1fr]"
    : layout === "grid"
      ? "grid gap-4 sm:grid-cols-3"
      : "space-y-4";

  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <p className="sr-only">{label}</p>
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        <div className="h-8 w-44 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className={containerClass}>
        {Array.from({ length: blocks }, (_, index) => (
          <div key={index} className={layout === "grid" ? "h-24 animate-pulse rounded-2xl bg-muted" : "h-56 animate-pulse rounded-2xl bg-muted"} />
        ))}
      </div>
    </div>
  );
}
