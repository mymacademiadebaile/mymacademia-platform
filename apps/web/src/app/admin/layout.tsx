import { AuthGate } from "@/components/auth/auth-gate";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate role="ADMIN">
      <AdminShell>{children}</AdminShell>
    </AuthGate>
  );
}
