import { DebtRemindersLive } from "@/components/admin/reminders/debt-reminders-live";
export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  return <DebtRemindersLive initialStudentId={(await searchParams).studentId ?? ""} />;
}
