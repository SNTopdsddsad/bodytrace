import { PageSkeleton } from "@/components/app/page-skeleton";

export default function MeasurementsLoading() {
  return <PageSkeleton label="正在加载身体变化…" blocks={3} layout="stack" />;
}
