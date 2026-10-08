/**
 * 根布局：整个应用最外层的 HTML 骨架，所有页面都会套在里面。
 * 这里只放全局的东西——页面标题、语言、全局弹窗提示（Toaster）。
 */
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BodyTrace · 饮食与健身记录",
  description: "记录每天的饮食、训练和身体变化",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        {/* sonner 的 Toaster：页面里调用 toast() 时，提示气泡从这里弹出来 */}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
