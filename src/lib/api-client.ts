/**
 * 浏览器端调用后端 API 的小封装（客户端组件共用）。
 * 统一处理 JSON、错误提示，省得每个地方重复写。
 */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `请求失败（${res.status}）`);
  }
  return data as T;
}
