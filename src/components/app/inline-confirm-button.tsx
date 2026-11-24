"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { TAP_SPRING } from "./motion-provider";

/**
 * 行内二次确认按钮：代替突兀的浏览器原生 window.confirm()。
 * 第一次点击展开为暖红色确认胶囊，3 秒内未二次点击或失焦时自动复原。
 */
export function InlineConfirmButton({
  onConfirm,
  disabled = false,
  ariaLabel,
  confirmText = "确认删除",
  icon,
  className,
  confirmClassName,
  title = "删除",
}: {
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  ariaLabel: string;
  confirmText?: string;
  icon?: React.ReactNode;
  className?: string;
  confirmClassName?: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      transition={TAP_SPRING}
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onKeyDown={(e) => {
        if (e.repeat && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          return;
        }
        if (armed && e.key === "Escape") {
          e.stopPropagation();
          setArmed(false);
        }
      }}
      onClick={() => {
        setArmed(!armed);
        if (armed) void onConfirm();
      }}
      className={armed
        ? cn("shrink-0 whitespace-nowrap rounded-lg bg-destructive px-2 py-1 text-[11px] font-semibold text-white shadow-xs transition-opacity hover:opacity-90 disabled:opacity-45", confirmClassName)
        : cn("shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-45", className)}
      title={armed ? confirmText : title}
      aria-label={armed ? `确认${ariaLabel}` : ariaLabel}
    >
      {armed ? confirmText : (icon ?? <Trash2 className="size-3.5" aria-hidden />)}
    </motion.button>
  );
}
