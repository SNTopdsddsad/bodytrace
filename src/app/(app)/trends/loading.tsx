import { PageSkeleton } from "@/components/app/page-skeleton";

export default function TrendsLoading() {
  return <PageSkeleton label="正在加载营养趋势…" blocks={6} layout="grid" />;
}
