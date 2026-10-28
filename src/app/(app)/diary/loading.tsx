import { PageSkeleton } from "@/components/app/page-skeleton";

export default function DiaryLoading() {
  return <PageSkeleton label="正在加载饮食日记…" blocks={3} layout="aside" />;
}
