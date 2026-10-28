import { PageSkeleton } from "@/components/app/page-skeleton";

export default function PlanLoading() {
  return <PageSkeleton label="正在加载饮食计划…" blocks={4} layout="aside" />;
}
