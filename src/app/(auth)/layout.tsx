import { BookOpen, ChartNoAxesCombined, Leaf, Target } from "lucide-react";
import { Brand } from "@/components/app/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh flex-1 gap-6 p-5 lg:grid-cols-2 lg:p-5">
      <section className="relative hidden flex-col justify-between overflow-hidden rounded-3xl bg-(--brand-deep) p-8 text-white lg:flex xl:p-10">
        <div className="relative z-10"><Brand inverse /><p className="mt-8 text-xs tracking-[0.2em] text-(--brand-light)">EAT WELL. LIVE WELL.</p><h2 className="mt-4 text-4xl leading-[1.5] font-semibold tracking-tight xl:text-[2.5rem]">把每一餐，<br />变成看得见的进步。</h2><p className="mt-4 max-w-sm text-sm leading-7 text-white/65">用简单的记录，了解每日摄入。<br />找到适合自己的节奏，让好习惯自然发生。</p></div>
        <div className="relative mx-auto my-5 flex size-48 items-center justify-center xl:size-56" aria-hidden>
          <div className="absolute inset-0 rounded-full border border-white/10" />
          <div className="absolute inset-5 rounded-full border border-white/15" />
          <div className="absolute inset-10 rounded-full border-[18px] border-(--brand-light)/20" />
          <div className="flex size-24 items-center justify-center rounded-full bg-(--brand-light)/10"><Leaf className="size-10 text-(--brand-light)" strokeWidth={1} /></div>
          <span className="absolute -right-1 top-7 flex size-12 items-center justify-center rounded-2xl bg-(--brand-cream) text-(--brand-deep) shadow-lg"><Target className="size-5" strokeWidth={1.5} /></span>
          <span className="absolute bottom-10 -left-3 flex size-12 items-center justify-center rounded-2xl bg-(--brand-cream) text-(--brand-deep) shadow-lg"><BookOpen className="size-5" strokeWidth={1.5} /></span>
        </div>
        <div className="relative z-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/15 pt-6 text-xs text-white/70"><span className="flex items-center gap-2"><BookOpen className="size-4" aria-hidden />饮食记录</span><span className="flex items-center gap-2"><ChartNoAxesCombined className="size-4" aria-hidden />营养趋势</span><span className="flex items-center gap-2"><Target className="size-4" aria-hidden />每日目标</span></div>
      </section>
      <section className="flex min-w-0 flex-col px-1 sm:px-8">
        <div className="py-3 lg:hidden"><Brand /></div>
        <div className="flex flex-1 items-center justify-center py-8 lg:py-12"><div className="w-full max-w-sm">{children}</div></div>
        <p className="pb-3 text-center text-[11px] tracking-wide text-muted-foreground">BodyTrace · 记录当下，看见变化</p>
      </section>
    </main>
  );
}
