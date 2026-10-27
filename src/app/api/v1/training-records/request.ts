import { trainingSchemas } from "@/lib/training";

const MAX_BODY_BYTES = 256 * 1024;
const tooLarge = () => Response.json({ error: "训练内容过大，请减少项目或组数。" }, { status: 413 });

/** 防止旧标签页在账号切换后误存到新账号；归属始终取服务端会话。 */
export function checkTrainingAccount(request: Request, sessionUserId: string): Response | null {
  const expectedUserId = request.headers.get("X-BodyTrace-User");
  if (expectedUserId !== null && expectedUserId !== sessionUserId) {
    return Response.json({ error: "账号已切换，请重新打开训练记录" }, { status: 401 });
  }
  return null;
}

/** 按实际字节数限制 JSON，未提供 Content-Length 时也不无限读取。 */
export async function readTrainingBody(request: Request): Promise<
  { ok: true; body: unknown } | { ok: false; response: Response }
> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return { ok: false, response: tooLarge() };
  if (!request.body) return { ok: true, body: null };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: tooLarge() };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return { ok: true, body };
  } catch {
    return { ok: false, response: Response.json({ error: "请求体必须是有效的 JSON。" }, { status: 400 }) };
  } finally {
    reader.releaseLock();
  }
}

export function currentTrainingSchemas() {
  const now = new Date();
  const timeZone = process.env.APP_TIMEZONE ?? "Asia/Shanghai";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return trainingSchemas(today, time, now.toISOString());
}
