import { SessionLive } from "@/components/admin/live/session-live";

export default async function SessionPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionLive id={id} />;
}
