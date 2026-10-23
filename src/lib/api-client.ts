/**
 * 浏览器端调用后端 API 的小封装（客户端组件共用）。
 * 统一处理 JSON、错误提示，省得每个地方重复写。
 */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `请求失败（${res.status}）`, res.status);
  }
  return data as T;
}

/**
 * multipart 上传专用：不能设置 Content-Type，浏览器要自己补 boundary。
 * 其余错误处理与 api() 保持一致。
 */
export async function apiForm<T = unknown>(
  path: string,
  form: FormData,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, { ...init, method: init?.method ?? "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `请求失败（${res.status}）`, res.status);
  }
  return data as T;
}
