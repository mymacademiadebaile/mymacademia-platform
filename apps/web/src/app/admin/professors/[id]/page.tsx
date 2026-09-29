import { ProfessorDetailLive } from "@/components/admin/live/professor-detail-live";

export default async function ProfessorDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProfessorDetailLive id={id} />;
}
