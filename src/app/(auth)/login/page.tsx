import { connection } from "next/server";
import { LoginForm } from "@/components/app/login-form";
import { isSmsConfigured } from "@/lib/aliyun-sms";
import { getSmsCodeSettings } from "@/lib/sms-config";

export default async function LoginPage() {
  await connection();
  return <LoginForm smsConfigured={isSmsConfigured()} smsSettings={getSmsCodeSettings()} />;
}
