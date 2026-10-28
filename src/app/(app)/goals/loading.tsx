import { PageSkeleton } from "@/components/app/page-skeleton";

export default function GoalsLoading() {
  return <PageSkeleton label="正在加载目标设置…" blocks={3} layout="aside" />;
}
