import { AuthGate } from "@/components/auth/auth-gate";

export default function ProfessorLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate roles={["PROFESSOR"]}>{children}</AuthGate>;
}
