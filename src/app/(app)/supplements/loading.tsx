import { PageSkeleton } from "@/components/app/page-skeleton";

export default function SupplementsLoading() {
  return <PageSkeleton label="正在加载每日补剂…" blocks={3} layout="stack" />;
}
