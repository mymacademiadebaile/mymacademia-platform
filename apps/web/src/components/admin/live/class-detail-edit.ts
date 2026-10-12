import { FormEvent, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { BillingMode, DanceClass } from "./live-types";
import type { ScheduleDraft } from "./class-detail-types";
import { normalizedMode } from "./class-detail-helpers";

type Params = {
  id: string;
  danceClass: DanceClass | null;
  load: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
};

export function useClassEdit({ id, danceClass, load, setBusy, setError }: Params) {
  const { toast } = useAdminFeedback();
  const [editing, setEditing] = useState(false);
  const [editBillingMode, setEditBillingMode] = useState<BillingMode>("PER_CLASS");
  const [editSchedules, setEditSchedules] = useState<ScheduleDraft[]>([]);

  function openEdit() {
    if (!danceClass) return;
    setEditSchedules(danceClass.schedules.map((schedule) => ({ ...schedule })));
    setEditBillingMode(normalizedMode(danceClass));
    setEditing(true);
  }

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setEditSchedules((current) =>
      current.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? { ...schedule, ...patch } : schedule
      )
    );
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      await apiFetch("/admin/classes/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          name: form.get("name"),
          professorIds: form.getAll("professorIds"),
          disciplineIds: form.getAll("disciplineIds"),
          segmentIds: form.getAll("segmentIds"),
          levelIds: form.getAll("levelIds"),
          capacity: Number(form.get("capacity")),
          billingMode: editBillingMode,
          pricePerClass: Number(form.get("pricePerClass") || 0),
          monthlyPrice4: form.get("monthlyPrice4") === null ? undefined : Number(form.get("monthlyPrice4") || 0),
          monthlyPrice8: form.get("monthlyPrice8") === null ? undefined : Number(form.get("monthlyPrice8") || 0),
          freeTrialEnabled: form.get("freeTrialEnabled") === "on",
          schedules: editSchedules
        })
      });
      setEditing(false);
      toast("Clase actualizada");
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo guardar la clase", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return {
    editing,
    editBillingMode,
    editSchedules,
    setEditing,
    setEditBillingMode,
    setEditSchedules,
    openEdit,
    updateSchedule,
    saveClass
  };
}
