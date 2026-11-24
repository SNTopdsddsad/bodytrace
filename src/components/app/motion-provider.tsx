"use client";

import { MotionConfig } from "motion/react";

/** 胶囊滑块与高响应控件使用的干脆弹簧 */
export const TAB_SPRING = {
  type: "spring" as const,
  stiffness: 460,
  damping: 34,
  mass: 0.85,
};

/** 卡片浮入、进度条与抽屉展开使用的柔和弹簧 */
export const SOFT_SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 28,
  mass: 0.9,
};

/** 胶囊、快捷按钮的微按压回弹 */
export const TAP_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 26,
};

export function AppMotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
