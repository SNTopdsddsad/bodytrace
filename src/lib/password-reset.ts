/** 临时找回渠道只用于本地开发，重置链接不会返回给浏览器。 */
export function isLocalPasswordResetEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;

  try {
    const url = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
