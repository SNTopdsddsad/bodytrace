import { PageSkeleton } from "@/components/app/page-skeleton";

export default function AppLoading() {
  return <PageSkeleton label="正在加载今日概览…" blocks={3} layout="aside" />;
}
