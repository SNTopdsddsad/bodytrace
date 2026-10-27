"use client";

import { Button } from "@/components/ui/button";

export default function TrainingError({ retry }: { error: unknown; retry: () => void }) {
  return <div className="mx-auto max-w-lg rounded-2xl border p-6"><h1 className="text-xl font-semibold">暂时无法读取训练记录</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">请稍后重试。已保存的训练不会因此改变。</p><Button className="mt-5 min-h-11" onClick={retry}>重新读取</Button></div>;
}
