import { ProfessorSessionDetail } from "@/components/professor/sessions/session-detail";

export default async function ProfessorSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfessorSessionDetail sessionId={id} />;
}
