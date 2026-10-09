import type { Metadata } from "next";
import { connection } from "next/server";
import { ForgotPasswordForm } from "@/components/app/forgot-password-form";
import { isLocalPasswordResetEnabled } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "忘记密码 · BodyTrace",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  await connection();
  return <ForgotPasswordForm localPreview={isLocalPasswordResetEnabled()} />;
}
