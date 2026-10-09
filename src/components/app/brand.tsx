import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${inverse ? "bg-white/15 text-(--brand-pale)" : "bg-primary text-primary-foreground"}`}>
        <Leaf className="size-5" strokeWidth={1.8} aria-hidden />
      </span>
      <span className="text-xl font-semibold tracking-tight">BodyTrace<span className={inverse ? "text-(--brand-light)" : "text-primary"}>.</span></span>
    </span>
  );
}
