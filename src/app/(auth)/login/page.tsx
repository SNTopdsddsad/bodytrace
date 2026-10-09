"use client";

/**
 * 登录页。
 *
 * "use client" 表示这是“客户端组件”——在浏览器里运行，
 * 可以使用 state、输入框事件这类交互能力（服务端组件不行）。
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    // 阻止表单默认的整页提交，改用 fetch 异步请求
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? "登录失败，请检查邮箱和密码");
      return;
    }
    // refresh() 让服务端组件重新渲染，带上新的登录状态
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="gap-8 border-0 bg-transparent shadow-none">
      <CardHeader className="gap-3 px-0">
        <p className="text-xs font-medium tracking-[0.16em] text-primary">欢迎回到 BODYTRACE</p>
        <CardTitle><h1 className="text-3xl font-semibold tracking-tight">继续你的健康日常。</h1></CardTitle>
        <CardDescription className="leading-6">登录账号，记录今天的饮食与营养。</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">密码</Label>
              <Link href="/forgot-password" className="text-xs text-primary underline-offset-4 hover:underline">
                忘记密码？
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="至少 8 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
            {loading ? <><LoaderCircle className="size-4 animate-spin" aria-hidden />登录中…</> : <>登录 BodyTrace<ArrowRight className="size-4" aria-hidden /></>}
          </Button>
          <p className="pt-3 text-center text-sm text-muted-foreground">
            还没有账号？{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              注册一个
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
