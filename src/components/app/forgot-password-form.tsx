"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm({ localPreview }: { localPreview: boolean }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!localPreview || loading) return;
    setError("");
    setLoading(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      if (result.error) {
        setError(result.error.status === 429 ? "申请过于频繁，请一分钟后再试。" : "申请未成功，请稍后重试。");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("网络连接失败，请检查网络后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="gap-8 border-0 bg-transparent shadow-none">
      <CardHeader className="gap-3 px-0">
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
          {submitted ? <Check className="size-6" aria-hidden /> : <LockKeyhole className="size-5" aria-hidden />}
        </span>
        <p className="text-xs font-medium tracking-[0.16em] text-primary">找回你的健康空间</p>
        <CardTitle><h1 className="text-3xl font-semibold tracking-tight">{submitted ? "重置申请已提交。" : "忘记密码？"}</h1></CardTitle>
        <CardDescription className="leading-6">
          {submitted ? "如果该邮箱已注册，可以使用本地开发终端中的链接设置新密码。" : "输入注册邮箱，开始重置密码。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-0">
        {submitted ? (
          <div className="space-y-4">
            <p role="status" className="rounded-xl border bg-secondary/50 p-4 text-sm leading-6 text-primary">重置链接有效期为 15 分钟，只能使用一次。</p>
            <Button variant="outline" className="w-full" onClick={() => { setSubmitted(false); setError(""); }}>重新填写邮箱</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="reset-email">注册邮箱</Label>
              <Input id="reset-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={!localPreview || loading} />
            </div>
            {localPreview ? (
              <p className="rounded-xl border bg-secondary/40 p-4 text-xs leading-6 text-muted-foreground">当前为本地调试模式，暂不发送邮件。重置链接会显示在运行开发服务的终端中。</p>
            ) : (
              <p className="rounded-xl border bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">密码找回渠道暂未开放，请稍后再试。</p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={!localPreview || loading}>
              {loading ? <><LoaderCircle className="size-4 animate-spin" aria-hidden />提交中…</> : localPreview ? <>申请重置密码<ArrowRight className="size-4" aria-hidden /></> : "暂未开放"}
            </Button>
          </form>
        )}
        <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-primary hover:underline underline-offset-4"><ArrowLeft className="size-4" aria-hidden />返回登录</Link>
      </CardContent>
    </Card>
  );
}
