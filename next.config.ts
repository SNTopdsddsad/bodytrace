import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 允许通过 127.0.0.1 访问 dev server（默认只允许 localhost），
   * 否则浏览器从 127.0.0.1 打开时 JS/HMR 等开发态资源会被拦截，页面无法水合。
   */
  allowedDevOrigins: ["127.0.0.1"],
  /**
   * 关闭 Cache Components（Next 16 的新缓存模式）：
   * 这个应用的每个页面都要读登录会话，天生全动态，
   * 经典的动态渲染行为更直接，也避免构建期预渲染报错。
   */
  cacheComponents: false,
  turbopack: {
    // D:\code 本身是个 git 仓库，显式指定项目根目录避免误判
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
