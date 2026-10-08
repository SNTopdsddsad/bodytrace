/**
 * 登录/注册页共用的布局：整屏居中一张卡片。
 * (auth) 是“路由组”：带括号的文件夹不体现在网址里，
 * 只用来让一组页面共享同一个布局文件。
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
