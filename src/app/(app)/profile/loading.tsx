import { PageSkeleton } from "@/components/app/page-skeleton";

export default function ProfileLoading() {
  return <PageSkeleton label="正在加载个人资料…" blocks={4} layout="aside" />;
}
