import type { Metadata } from "next";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { ResetPasswordForm } from "@/components/app/reset-password-form";

export const metadata: Metadata = {
  title: "重置密码 · BodyTrace",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  let token: string | null = null;

  if (!params.error && typeof params.token === "string" && params.token.length > 0 && params.token.length <= 256) {
    const [record] = await db
      .select({ id: verification.id })
      .from(verification)
      .where(and(
        eq(verification.identifier, `reset-password:${params.token}`),
        gt(verification.expiresAt, new Date()),
      ))
      .limit(1);
    if (record) token = params.token;
  }

  return <ResetPasswordForm key={token ?? "invalid"} token={token} />;
}
