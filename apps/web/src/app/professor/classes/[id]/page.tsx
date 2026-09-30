import { Suspense } from "react";
import { ClassDetail } from "@/components/professor/classes/class-detail";
import { PageSkeleton } from "@/components/professor/professor-ui";

export default async function ProfessorClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton blocks={3} />}>
      <ClassDetail classId={id} />
    </Suspense>
  );
}
