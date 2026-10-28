import { PageSkeleton } from "@/components/app/page-skeleton";

export default function FoodsLoading() {
  return <PageSkeleton label="正在加载食物库…" blocks={4} layout="stack" />;
}
