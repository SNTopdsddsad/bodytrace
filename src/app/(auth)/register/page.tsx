"use client";

/**
 * 注册页。注册成功后会自动预置一份常用食物库（见 src/db/seed.ts），
 * 登录后就能直接开始记录饮食。
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

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? "注册失败");
      return;
    }
    toast.success("注册成功，已为你预置常用食物库");
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="gap-8 border-0 bg-transparent shadow-none">
      <CardHeader className="gap-3 px-0">
        <p className="text-xs font-medium tracking-[0.16em] text-primary">从今天开始，了解自己</p>
        <CardTitle><h1 className="text-3xl font-semibold tracking-tight">创建你的健康空间。</h1></CardTitle>
        <CardDescription className="leading-6">一个邮箱就够了，常用食物库已为你准备好。</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">昵称</Label>
            <Input
              id="name"
              autoComplete="nickname"
              required
              placeholder="怎么称呼你"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="至少 8 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
            {loading ? <><LoaderCircle className="size-4 animate-spin" aria-hidden />创建中…</> : <>创建账号<ArrowRight className="size-4" aria-hidden /></>}
          </Button>
          <p className="pt-3 text-center text-sm text-muted-foreground">
            已有账号？{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              去登录
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
