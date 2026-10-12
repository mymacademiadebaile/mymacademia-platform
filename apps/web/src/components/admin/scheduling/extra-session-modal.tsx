"use client";

import { FormEvent, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal } from "../live/live-common";
import type { CalendarOptions } from "./calendar-helpers";

export function ExtraSessionModal({
  open,
  anchor,
  options,
  onClose,
  onCreated
}: {
  open: boolean;
  anchor: string;
  options: CalendarOptions;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { toast } = useAdminFeedback();
  const [saving, setSaving] = useState(false);

  async function submitExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    try {
      await apiFetch("/admin/sessions", {
        method: "POST",
        body: JSON.stringify({
          classId: form.get("classId"),
          date: form.get("date"),
          startTime: form.get("startTime"),
          endTime: form.get("endTime"),
          spaceId: form.get("spaceId") || null,
          notes: form.get("notes") || undefined
        })
      });
      toast({ title: "Clase extra creada", tone: "success" });
      onClose();
      formElement.reset();
      await onCreated();
    } catch (requestError) {
      toast({ title: "No se pudo crear la clase", description: apiMessage(requestError), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <LiveModal
      open={open}
      title="Clase extraordinaria"
      description="Una fecha adicional para todo el grupo, fuera de su horario habitual. Se controlan pista y profesores."
      submitting={saving}
      submitLabel="Crear clase"
      onClose={onClose}
      onSubmit={submitExtra}
    >
      <Field label="Clase" wide>
        <select name="classId" required>
          {options.classes
            .filter((item) => item.status === "ACTIVE" || item.status === "PAUSED")
            .map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Fecha">
        <input name="date" type="date" min={todayInArgentina()} defaultValue={anchor >= todayInArgentina() ? anchor : todayInArgentina()} required />
      </Field>
      <Field label="Pista">
        <select name="spaceId" defaultValue="">
          <option value="">Sin pista</option>
          {options.spaces.filter((item) => item.status === "ACTIVE").map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Desde">
        <input name="startTime" type="time" required />
      </Field>
      <Field label="Hasta">
        <input name="endTime" type="time" required />
      </Field>
      <Field label="Notas" wide>
        <input name="notes" maxLength={1000} />
      </Field>
    </LiveModal>
  );
}
