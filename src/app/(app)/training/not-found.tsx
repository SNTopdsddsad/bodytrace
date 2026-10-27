import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TrainingNotFound() {
  return <div className="mx-auto max-w-lg rounded-2xl border p-6"><h1 className="text-xl font-semibold">找不到这次训练</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">记录可能已经删除，请返回列表查看自己的训练。</p><Button nativeButton={false} render={<Link href="/training?range=all" />} className="mt-5 min-h-11">返回训练记录</Button></div>;
}
