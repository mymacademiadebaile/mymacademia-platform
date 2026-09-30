import { StudentDetail } from "@/components/professor/students/student-detail";

export default async function ProfessorStudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentDetail studentId={id} />;
}
