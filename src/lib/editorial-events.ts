import { shiftDate } from "./date";

export type EditorialModalName = "trends" | "library" | "settings" | "auth";

export const OPEN_MODAL_EVENT = "bodytrace:open-modal";

export function dispatchOpenModal(modal: EditorialModalName) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<EditorialModalName>(OPEN_MODAL_EVENT, { detail: modal }));
}

export type WeekStripDay = {
  date: string;
  short: string;
  label: string;
  isToday: boolean;
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function dayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return "今天";
  if (dateStr === shiftDate(today, -1)) return "昨天";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return WEEKDAYS[d.getUTCDay()];
}

function shortDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${month}/${day}`;
}

/**
 * 生成顶部胶囊周历展示的 4 天窗口（不跨越今天），
 * 若当前查看历史更早日期，则窗口包含该日期并尽量向后展至今天。
 */
export function buildWeekStripDays(selectedDate: string, today: string): {
  days: WeekStripDay[];
  tomorrow: string;
  showsToday: boolean;
} {
  const clamped = selectedDate > today ? today : selectedDate;
  const lastDay = shiftDate(clamped, 3);
  const windowEnd = lastDay > today ? today : lastDay;

  const days: WeekStripDay[] = [];
  for (let offset = -3; offset <= 0; offset++) {
    const date = shiftDate(windowEnd, offset);
    days.push({
      date,
      short: shortDate(date),
      label: dayLabel(date, today),
      isToday: date === today,
    });
  }

  return {
    days,
    tomorrow: shiftDate(today, 1),
    showsToday: windowEnd === today,
  };
}

export function formatShortDate(dateStr: string): string {
  return shortDate(dateStr);
}
