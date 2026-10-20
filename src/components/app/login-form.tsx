"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { maskPhoneNumber, normalizeMainlandPhoneNumber } from "@/lib/phone-number";
import { RequestTimeoutError, withRequestTimeout } from "@/lib/request-timeout";
import type { SmsCodeSettings } from "@/lib/sms-config";

function phoneLoginError(status: number, code?: string) {
  if (code === "OTP_EXPIRED" || code === "OTP_NOT_FOUND") return "验证码已过期或失效，请重新获取。";
  if (code === "INVALID_OTP") return "验证码不正确，请检查后重试。";
  if (status === 429 || code === "TOO_MANY_ATTEMPTS") return "尝试过于频繁，请稍后重试或重新获取验证码。";
  if (status >= 500) return "登录服务暂时不可用，请稍后重试。";
  return "手机号或验证码不正确，请检查后重试。";
}

export function LoginForm({ smsConfigured, smsSettings }: { smsConfigured: boolean; smsSettings: SmsCodeSettings }) {
  const router = useRouter();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [sentPhoneNumber, setSentPhoneNumber] = useState<string | null>(null);
  const [pendingPhoneNumber, setPendingPhoneNumber] = useState<string | null>(null);
  const [resendAvailableAtByPhone, setResendAvailableAtByPhone] = useState<Record<string, number>>({});
  const [currentTime, setCurrentTime] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const operationInFlight = useRef(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const normalizedPhoneNumber = normalizeMainlandPhoneNumber(phoneNumber);
  const resendAvailableAt = normalizedPhoneNumber ? resendAvailableAtByPhone[normalizedPhoneNumber] ?? 0 : 0;
  const remainingSeconds = Math.max(0, Math.ceil((resendAvailableAt - currentTime) / 1000));
  const busy = sending || loading;

  useEffect(() => {
    if (resendAvailableAt === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);
      if (now >= resendAvailableAt) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  function finishLogin() {
    router.push("/");
    router.refresh();
  }

  function changePhoneNumber(value: string) {
    const normalized = normalizeMainlandPhoneNumber(value);
    const nextValue = normalized ? normalized.slice(3) : value.replace(/\D/g, "").slice(0, 11);
    setPhoneNumber(nextValue);
    setCurrentTime(Date.now());
    setPhoneError("");
    setLoginError("");
    if (normalizeMainlandPhoneNumber(nextValue) !== normalizedPhoneNumber) {
      setCode("");
      setCodeError("");
      setSentPhoneNumber(null);
      setPendingPhoneNumber(null);
      setNotice(sentPhoneNumber ? "手机号已修改，请填写该号码收到的验证码。" : "");
    }
  }

  async function hasPhoneSession(expectedPhoneNumber: string) {
    const result = await withRequestTimeout(signal => authClient.getSession({
      query: { disableCookieCache: true },
      fetchOptions: { signal, cache: "no-store" },
    }));
    return !result.error
      && result.data?.user.phoneNumberVerified === true
      && normalizeMainlandPhoneNumber(result.data.user.phoneNumber ?? "") === expectedPhoneNumber;
  }

  async function confirmPhoneLogin(expectedPhoneNumber: string) {
    setNotice("正在核对登录状态…");
    try {
      if (await hasPhoneSession(expectedPhoneNumber)) {
        finishLogin();
        return;
      }
    } catch {
      // 核对失败时保留待确认状态，不把其他账号的现有会话视为本次成功。
    }
    setPendingPhoneNumber(expectedPhoneNumber);
    setNotice("");
    setLoginError("暂未确认该手机号登录。可再次核对登录状态，或获取新验证码后重试。");
  }

  async function handleSendCode() {
    if (!smsConfigured || operationInFlight.current || Date.now() < resendAvailableAt) return;
    const normalized = normalizeMainlandPhoneNumber(phoneNumber);
    if (!normalized) {
      setPhoneError("请输入 11 位中国大陆手机号。");
      phoneInput.current?.focus();
      return;
    }

    operationInFlight.current = true;
    setSending(true);
    setPhoneError("");
    setCodeError("");
    setLoginError("");
    setNotice("");
    const previousSentPhoneNumber = sentPhoneNumber;
    const previousResendAvailableAt = resendAvailableAtByPhone[normalized] ?? 0;
    setSentPhoneNumber(normalized);
    setPendingPhoneNumber(null);
    const now = Date.now();
    setCurrentTime(now);
    setResendAvailableAtByPhone(previous => ({ ...previous, [normalized]: now + smsSettings.rateLimitSeconds * 1000 }));
    let retryAfterSeconds: number | null = null;

    try {
      const result = await withRequestTimeout(signal => authClient.phoneNumber.sendOtp({
        phoneNumber: normalized,
        fetchOptions: {
          signal,
          onResponse: ({ response }) => {
            const header = response.headers.get("Retry-After") ?? response.headers.get("X-Retry-After");
            const seconds = header === null ? NaN : Number(header);
            if (Number.isFinite(seconds) && seconds >= 0) retryAfterSeconds = seconds;
          },
        },
      }));
      if (result.error) {
        // 供应商超时可能已经下发；保留验证码入口，不能要求用户再次付费发送。
        if (result.error.code === "SMS_SEND_FAILED") {
          setNotice("短信发送结果暂未确认。若已收到验证码，可直接填写；请等待倒计时结束再重发。");
          return;
        }
        setSentPhoneNumber(previousSentPhoneNumber);
        // 明确拒绝没有再次发送；使用服务端剩余时间，不从头再等完整间隔。
        const rejectedAt = Date.now();
        setCurrentTime(rejectedAt);
        setResendAvailableAtByPhone(previous => ({
          ...previous,
          [normalized]: result.error.status === 429 && retryAfterSeconds !== null
            ? rejectedAt + retryAfterSeconds * 1000
            : previousResendAvailableAt,
        }));
        setLoginError(result.error.status === 429
          ? "验证码发送过于频繁，请稍后再试。"
          : "验证码暂时未能发送，请稍后重试。");
        return;
      }
      setCode("");
      setNotice(`验证码已发送至 ${maskPhoneNumber(normalized)}，请及时填写。`);
    } catch (error) {
      setNotice(error instanceof RequestTimeoutError
        ? "发送请求超过 15 秒，短信可能已发出。收到后可填写验证码，请等待倒计时结束再重发。"
        : "网络连接中断，短信可能已发出。收到后可填写验证码，请等待倒计时结束再重发。");
    } finally {
      operationInFlight.current = false;
      setSending(false);
    }
  }

  async function handlePhoneSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!smsConfigured || operationInFlight.current) return;
    const normalized = normalizeMainlandPhoneNumber(phoneNumber);
    if (!normalized) {
      setPhoneError("请输入 11 位中国大陆手机号。");
      phoneInput.current?.focus();
      return;
    }
    if (!pendingPhoneNumber && !new RegExp(`^[0-9]{${smsSettings.codeLength}}$`).test(code)) {
      setCodeError(`请输入 ${smsSettings.codeLength} 位短信验证码。`);
      codeInput.current?.focus();
      return;
    }

    operationInFlight.current = true;
    setLoading(true);
    setCodeError("");
    setLoginError("");
    setNotice("");
    try {
      if (pendingPhoneNumber) {
        await confirmPhoneLogin(pendingPhoneNumber);
        return;
      }
      const result = await withRequestTimeout(signal => authClient.phoneNumber.verify({
        phoneNumber: normalized,
        code,
        fetchOptions: { signal },
      }));
      if (result.error) {
        setLoginError(phoneLoginError(result.error.status, result.error.code));
        return;
      }
      if (result.data?.user?.phoneNumberVerified === true
        && normalizeMainlandPhoneNumber(result.data.user.phoneNumber ?? "") === normalized) {
        finishLogin();
        return;
      }
      await confirmPhoneLogin(normalized);
    } catch {
      await confirmPhoneLogin(normalized);
    } finally {
      operationInFlight.current = false;
      setLoading(false);
    }
  }

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setLoading(true);
    setLoginError("");
    try {
      const result = await withRequestTimeout(signal => authClient.signIn.email({
        email: email.trim(),
        password,
        fetchOptions: { signal },
      }));
      if (result.error) {
        setLoginError(result.error.status === 401
          ? "邮箱或密码不正确，请检查后重试。"
          : result.error.status === 429
            ? "登录尝试过于频繁，请稍后再试。"
            : "登录服务暂时不可用，请稍后重试。");
        return;
      }
      finishLogin();
    } catch (error) {
      setLoginError(error instanceof RequestTimeoutError
        ? "登录请求超过 15 秒，请重试。"
        : "网络连接中断或登录发生异常，请重试。");
    } finally {
      operationInFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <Card className="gap-8 border-0 bg-transparent shadow-none">
      <CardHeader className="gap-3 px-0">
        <p className="text-xs font-medium tracking-[0.16em] text-primary">欢迎回到 BODYTRACE</p>
        <CardTitle><h1 className="text-3xl font-semibold tracking-tight">继续你的健康日常。</h1></CardTitle>
        <CardDescription className="leading-6">
          {mode === "phone" ? "使用手机号和短信验证码登录。" : "使用原有邮箱和密码登录。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        <form onSubmit={mode === "phone" ? handlePhoneSubmit : handleEmailSubmit} noValidate={mode === "phone"} aria-busy={busy} className="space-y-5">
          {mode === "phone" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="login-phone">中国大陆手机号</Label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-sm text-muted-foreground">+86</span>
                  <Input
                    ref={phoneInput}
                    id="login-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    required
                    maxLength={18}
                    placeholder="11 位手机号"
                    value={phoneNumber}
                    disabled={busy || !smsConfigured}
                    aria-invalid={Boolean(phoneError)}
                    aria-describedby={phoneError ? "phone-error" : undefined}
                    className="pl-14"
                    onChange={event => changePhoneNumber(event.target.value)}
                  />
                </div>
                {phoneError && <p id="phone-error" role="alert" className="text-sm text-destructive">{phoneError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-code">短信验证码（{smsSettings.codeLength} 位）</Label>
                <div className="flex gap-3">
                  <Input
                    ref={codeInput}
                    id="login-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={smsSettings.codeLength}
                    pattern={`[0-9]{${smsSettings.codeLength}}`}
                    placeholder={`${smsSettings.codeLength} 位验证码`}
                    value={code}
                    disabled={busy || !smsConfigured || Boolean(pendingPhoneNumber)}
                    aria-invalid={Boolean(codeError)}
                    aria-describedby={codeError ? "code-hint code-error" : "code-hint"}
                    onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, smsSettings.codeLength)); setCodeError(""); setLoginError(""); }}
                  />
                  <Button type="button" variant="outline" className="h-11 min-w-28" disabled={!smsConfigured || busy || remainingSeconds > 0} onClick={handleSendCode}>
                    {sending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden />发送中…</> : remainingSeconds > 0 ? `${remainingSeconds} 秒后重发` : "获取验证码"}
                  </Button>
                </div>
                <p id="code-hint" className="text-sm text-muted-foreground">验证码 {smsSettings.expireMinutes} 分钟内有效。</p>
                {codeError && <p id="code-error" role="alert" className="text-sm text-destructive">{codeError}</p>}
              </div>
              {!smsConfigured && <p role="status" className="rounded-xl border bg-secondary/40 p-4 text-sm leading-6 text-muted-foreground">短信登录暂未开放，可使用原邮箱账号登录。</p>}
              {notice && <p role="status" className="text-sm leading-6 text-muted-foreground">{notice}</p>}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="login-email">邮箱</Label>
                <Input id="login-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="login-password">密码</Label>
                  <Link href="/forgot-password" className="text-xs text-primary underline-offset-4 hover:underline">忘记密码？</Link>
                </div>
                <Input id="login-password" type="password" autoComplete="current-password" required minLength={8} placeholder="至少 8 位" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
              </div>
            </>
          )}
          {loginError && <p role="alert" className="text-sm leading-6 text-destructive">{loginError}</p>}
          <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy || (mode === "phone" && !smsConfigured)}>
            {loading ? <><LoaderCircle className="size-4 animate-spin" aria-hidden />{pendingPhoneNumber && mode === "phone" ? "核对中…" : "登录中…"}</> : pendingPhoneNumber && mode === "phone" ? "核对登录状态" : <>登录 BodyTrace<ArrowRight className="size-4" aria-hidden /></>}
          </Button>
          {mode === "phone" && <p className="text-center text-xs leading-6 text-muted-foreground">未注册的手机号验证后将自动创建账号。</p>}
        </form>
        <Button type="button" variant="link" className="w-full" disabled={busy} onClick={() => { setMode(mode === "phone" ? "email" : "phone"); setLoginError(""); }}>
          {mode === "phone" ? "原邮箱账号登录" : "返回手机号登录"}
        </Button>
      </CardContent>
    </Card>
  );
}
