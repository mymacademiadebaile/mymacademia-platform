import { ClassDetailLive } from "@/components/admin/live/class-detail-live";

export default async function ClassDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassDetailLive id={id} />;
}
