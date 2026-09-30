import { AuthGate } from "@/components/auth/auth-gate";
import { ProfessorShell } from "@/components/professor/professor-shell";
import { AdminFeedbackProvider } from "@/components/ui/admin-feedback";

export default function ProfessorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate roles={["PROFESSOR"]}>
      <AdminFeedbackProvider>
        <ProfessorShell>{children}</ProfessorShell>
      </AdminFeedbackProvider>
    </AuthGate>
  );
}
