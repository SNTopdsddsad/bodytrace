"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { withRequestTimeout } from "@/lib/request-timeout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { RecordCounts } from "@/services/records";

/**
 * 一键清空当前用户的饮食与身体指标记录（入口在个人资料页的数据管理卡片）。
 * 服务端在同一事务里硬删除饮食、照片和指标；失败时留在对话框里展示原因，
 * 关闭对话框后刷新页面，让卡片上的记录数量回到服务端真实状态。
 */
export function ClearRecordsButton({ counts }: { counts: RecordCounts }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const total = counts.mealEntries + counts.measurements + counts.mealPhotos;

  async function clear() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { cleared } = await withRequestTimeout(signal =>
        api<{ ok: true; cleared: RecordCounts }>("/api/v1/records", { method: "DELETE", signal }),
      );
      setOpen(false);
      toast.success(`已清空 ${cleared.mealEntries} 条饮食记录、${cleared.measurements} 条身体指标记录和 ${cleared.mealPhotos} 条照片数据`);
      router.refresh();
    } catch (err) {
      // 清空接口可安全重试：即使刚才超时但实际已成功，重试也只会删到 0 条。
      setError(err instanceof Error ? err.message : "清空未完成，请核对后重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        disabled={total === 0}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden />
        清空全部记录
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空全部饮食、照片与身体记录？</DialogTitle>
            <DialogDescription>
              将永久删除你的 {counts.mealEntries} 条饮食记录、{counts.measurements} 条身体指标记录和 {counts.mealPhotos} 张照片（此前删除过的指标和照片标记也会彻底移除），无法恢复。
              请先停止其他设备的照片上传并放弃待重试照片，避免清空后重新保存。日记、趋势和最新指标会立即清零；个人食物库、每日目标、饮食计划和个人资料保持不变。
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                // 结果未知就关掉时同步一次服务端状态，卡片数量不作假。
                if (error) router.refresh();
              }}
            >
              取消
            </Button>
            <Button variant="destructive" disabled={busy} onClick={clear}>
              {busy ? "清空中…" : "确认清空"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
