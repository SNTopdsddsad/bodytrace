const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 按配置时区取“今天”的 YYYY-MM-DD（默认上海）。 */
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE ?? "Asia/Shanghai",
  }).format(new Date());
}

export function isValidDateStr(s: string): boolean {
  return DATE_RE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/** n 天前/后的 YYYY-MM-DD。 */
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function formatDateCn(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 周${WEEKDAYS[d.getUTCDay()]}`;
}
