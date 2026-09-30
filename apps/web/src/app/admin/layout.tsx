import { AuthGate } from "@/components/auth/auth-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminFeedbackProvider } from "@/components/ui/admin-feedback";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate roles={["SUPER_ADMIN", "ADMIN"]}>
      <AdminFeedbackProvider>
        <AdminShell>{children}</AdminShell>
      </AdminFeedbackProvider>
    </AuthGate>
  );
}
