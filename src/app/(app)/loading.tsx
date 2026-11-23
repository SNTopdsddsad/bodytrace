export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <p className="sr-only">正在加载主手账…</p>
      <div className="space-y-5 lg:col-span-4 xl:col-span-3">
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="space-y-4 lg:col-span-8 xl:col-span-5">
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-44 animate-pulse rounded-2xl bg-muted" />
        <div className="h-44 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="lg:col-span-12 xl:col-span-4">
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
