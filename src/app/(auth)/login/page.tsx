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
import { Flame } from "lucide-react";
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
    <Card>
      <CardHeader className="items-center text-center">
        {/* 品牌标识：渐变色方块 + 火焰 */}
        <div className="mx-auto mb-1 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
          <Flame className="size-7" aria-hidden />
        </div>
        <CardTitle className="text-xl">登录 BodyTrace</CardTitle>
        <CardDescription>记录你的饮食、训练和身体变化</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              placeholder="至少 8 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中…" : "登录"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
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
