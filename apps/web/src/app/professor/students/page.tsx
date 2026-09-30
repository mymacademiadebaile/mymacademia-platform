import { Suspense } from "react";
import { PageSkeleton } from "@/components/professor/professor-ui";
import { ProfessorStudents } from "@/components/professor/students/professor-students";

export default function ProfessorStudentsPage() {
  return (
    <Suspense fallback={<PageSkeleton blocks={2} />}>
      <ProfessorStudents />
    </Suspense>
  );
}
