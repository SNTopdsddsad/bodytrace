/**
 * 浏览器端的认证客户端：登录/注册/登出都通过它调用后端。
 * Web 端自动走 cookie，不需要额外配置；
 * 未来的手机 app 则直接带 Authorization 头请求 API，无需这个文件。
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
