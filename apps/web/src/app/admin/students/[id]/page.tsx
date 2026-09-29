import { StudentDetailLive } from "@/components/admin/live/student-detail-live";

export default async function StudentDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentDetailLive id={id} />;
}
