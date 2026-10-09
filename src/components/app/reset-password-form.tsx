"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(!token);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || invalid || loading) return;
    setError("");
    if (password !== confirmation) {
      setError("两次输入的密码不一致，请重新确认。");
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") setInvalid(true);
        else setError(result.error.status === 429 ? "尝试过于频繁，请一分钟后再试。" : "密码重置未成功，请稍后重试。");
        return;
      }
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch {
      setError("网络连接失败，请检查网络后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="gap-8 border-0 bg-transparent shadow-none">
      <CardHeader className="gap-3 px-0">
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">{done ? <Check className="size-6" aria-hidden /> : <LockKeyhole className="size-5" aria-hidden />}</span>
        <p className="text-xs font-medium tracking-[0.16em] text-primary">重新开启你的健康日常</p>
        <CardTitle><h1 className="text-3xl font-semibold tracking-tight">{done ? "密码已更新。" : invalid ? "重置链接已失效。" : "设置新的密码。"}</h1></CardTitle>
        <CardDescription className="leading-6">{done ? "请使用新密码重新登录 BodyTrace。" : invalid ? "链接无效、已过期或已被使用，请重新申请。" : "新密码至少 8 位，请妥善保管。"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-0">
        {done ? (
          <div className="space-y-5">
            <p role="status" className="rounded-xl border bg-secondary/50 p-4 text-sm leading-6 text-primary">密码重置成功，之前的登录会话已退出。</p>
            <Button size="lg" className="w-full" render={<Link href="/login" />} nativeButton={false}>使用新密码登录<ArrowRight className="size-4" aria-hidden /></Button>
          </div>
        ) : invalid ? (
          <Button size="lg" className="w-full" render={<Link href="/forgot-password" />} nativeButton={false}>重新申请重置<ArrowRight className="size-4" aria-hidden /></Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password">新密码</Label>
              <Input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="至少 8 位" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">确认新密码</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="再次输入新密码" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={loading} aria-invalid={error ? true : undefined} aria-describedby={error ? "reset-error" : undefined} />
            </div>
            {error && <p id="reset-error" role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? <><LoaderCircle className="size-4 animate-spin" aria-hidden />保存中…</> : <>确认重置密码<ArrowRight className="size-4" aria-hidden /></>}</Button>
          </form>
        )}
        {!done && <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-primary hover:underline underline-offset-4"><ArrowLeft className="size-4" aria-hidden />返回登录</Link>}
      </CardContent>
    </Card>
  );
}
