"use client";

import { CalendarPlus, PauseCircle, PlayCircle, Repeat, Square } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal } from "../live/live-common";
import type { DanceClass, Professor } from "../live/live-types";
import styles from "./calendar.module.css";
import { DAY_LABEL, WEEK_DAYS, type DanceSpace, type ScheduleRule } from "./scheduling-types";

type Modal = { kind: "add" } | { kind: "change"; rule: ScheduleRule } | { kind: "end"; rule: ScheduleRule } | { kind: "pause" } | null;

const STATE_LABEL: Record<ScheduleRule["state"], string> = { CURRENT: "Vigente", UPCOMING: "Próximo", ENDED: "Finalizado" };

/**
 * Recurring schedule of a group with validity dates. Changes apply "from this date on" and never
 * touch classes that already happened; one-off changes are made on each session.
 */
export function GroupSchedulesPanel({
  classId,
  danceClass,
  professors,
  onChanged
}: {
  classId: string;
  danceClass: DanceClass;
  professors: Professor[];
  onChanged: () => void;
}) {
  const { toast } = useAdminFeedback();
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [spaces, setSpaces] = useState<DanceSpace[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const [schedules, spaceList] = await Promise.all([
        apiFetch<{ items: ScheduleRule[] }>("/admin/schedules?classId=" + classId),
        apiFetch<{ items: DanceSpace[] }>("/admin/spaces?branchId=" + danceClass.branchId)
      ]);
      setRules(schedules.items);
      setSpaces(spaceList.items);
    } catch (error) {
      toast({ title: "No pudimos cargar los horarios", description: apiMessage(error), tone: "error" });
    }
  }, [classId, danceClass.branchId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast({ title: success, tone: "success" });
      setModal(null);
      await load();
      onChanged();
    } catch (error) {
      toast({ title: "No se pudo guardar", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const professorIds = form.getAll("professorIds").map(String).filter(Boolean);
    if (modal?.kind === "add") {
      void run(
        () =>
          apiFetch("/admin/schedules", {
            method: "POST",
            body: JSON.stringify({
              classId,
              day: form.get("day"),
              startTime: form.get("startTime"),
              endTime: form.get("endTime"),
              spaceId: form.get("spaceId") || null,
              professorIds,
              validFrom: form.get("validFrom"),
              validTo: form.get("validTo") || undefined
            })
          }),
        "Horario agregado"
      );
    } else if (modal?.kind === "change") {
      void run(
        () =>
          apiFetch("/admin/schedules/" + modal.rule.seriesId + "/change", {
            method: "POST",
            body: JSON.stringify({
              fromDate: form.get("fromDate"),
              day: form.get("day"),
              startTime: form.get("startTime"),
              endTime: form.get("endTime"),
              spaceId: form.get("spaceId") || null,
              professorIds,
              reason: form.get("reason") || undefined
            })
          }),
        "Horario actualizado desde la fecha elegida"
      );
    } else if (modal?.kind === "end") {
      void run(
        () =>
          apiFetch("/admin/schedules/" + modal.rule.seriesId + "/end", {
            method: "POST",
            body: JSON.stringify({ fromDate: form.get("fromDate"), reason: form.get("reason") || undefined })
          }),
        "Horario finalizado"
      );
    } else if (modal?.kind === "pause") {
      void run(
        () =>
          apiFetch("/admin/classes/" + classId + "/pause", {
            method: "POST",
            body: JSON.stringify({ from: form.get("from"), to: form.get("to") || undefined, reason: form.get("reason") || undefined })
          }),
        "Clase en pausa"
      );
    }
  }

  const visible = rules.filter((rule) => showHistory || rule.state !== "ENDED");
  const spaceName = (id?: string) => spaces.find((item) => item._id === id)?.name;
  const openPause = danceClass.pauses?.find((pause) => !pause.to || pause.to >= todayInArgentina());
  const archived = danceClass.status === "ARCHIVED" || danceClass.status === "INACTIVE";
  const editingRule = modal?.kind === "change" ? modal.rule : undefined;

  return (
    <section className={styles.section} style={{ margin: "16px 0" }}>
      <div className={styles.actionRow} style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3>Horarios y vigencia</h3>
        <div className={styles.actionRow}>
          <button className={styles.actionButton} onClick={() => setShowHistory((value) => !value)}>
            {showHistory ? "Ocultar horarios finalizados" : "Ver horarios finalizados"}
          </button>
          {!archived && (
            <button className={`${styles.actionButton} ${styles.actionPrimary}`} disabled={busy} onClick={() => setModal({ kind: "add" })}>
              <CalendarPlus size={14} /> Agregar horario
            </button>
          )}
          {!archived && !openPause && (
            <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "pause" })}>
              <PauseCircle size={14} /> Pausar
            </button>
          )}
          {openPause && (
            <button
              className={styles.actionButton}
              disabled={busy}
              onClick={() =>
                void run(
                  () => apiFetch("/admin/classes/" + classId + "/resume", { method: "POST", body: JSON.stringify({ date: todayInArgentina() }) }),
                  "Clase reanudada"
                )
              }
            >
              <PlayCircle size={14} /> Reanudar
            </button>
          )}
        </div>
      </div>

      {openPause && (
        <p className={styles.sessionMeta}>
          En pausa desde el {formatDateOnly(openPause.from)}
          {openPause.to ? " hasta el " + formatDateOnly(openPause.to) : ""}
          {openPause.reason ? " · " + openPause.reason : ""}. No se generan clases regulares en ese período.
        </p>
      )}

      <div className={styles.listItems}>
        {visible.map((rule) => (
          <div key={rule._id} className={styles.sessionCard} style={{ cursor: "default" }}>
            <span className={styles.sessionTime}>
              {DAY_LABEL[rule.day]} {rule.startTime}–{rule.endTime}
            </span>
            <span className={styles.sessionMeta}>
              Desde {formatDateOnly(rule.validFrom)}
              {rule.validTo ? " hasta " + formatDateOnly(rule.validTo) : " · sin fecha de fin"}
              {spaceName(rule.spaceId) ? " · " + spaceName(rule.spaceId) : ""}
              {rule.professorIds.length
                ? " · " + professors.filter((item) => rule.professorIds.includes(item._id)).map((item) => item.displayName).join(", ")
                : ""}
            </span>
            <span className={styles.badges}>
              <span className={`${styles.badge} ${rule.state === "ENDED" ? styles.badgeOff : rule.state === "UPCOMING" ? styles.badgeWarn : styles.badgeOk}`}>
                {STATE_LABEL[rule.state]}
              </span>
            </span>
            {rule.state !== "ENDED" && !archived && (
              <span className={styles.actionRow}>
                <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "change", rule })}>
                  <Repeat size={13} /> Cambiar desde…
                </button>
                <button className={`${styles.actionButton} ${styles.actionDanger}`} disabled={busy} onClick={() => setModal({ kind: "end", rule })}>
                  <Square size={13} /> Finalizar
                </button>
              </span>
            )}
          </div>
        ))}
        {!visible.length && <p className={styles.emptyDay}>La clase no tiene horarios vigentes.</p>}
      </div>

      <LiveModal
        open={modal?.kind === "add" || modal?.kind === "change"}
        title={modal?.kind === "change" ? "Cambiar esta y las siguientes" : "Nuevo horario"}
        description={
          modal?.kind === "change"
            ? "Las clases desde la fecha elegida pasan al nuevo horario, con los mismos alumnos, asistencias y pagos. Las anteriores no cambian."
            : "Horario recurrente con fecha de inicio y, si querés, de fin. Se controla que la pista y los profesores estén libres."
        }
        submitting={busy}
        onClose={() => setModal(null)}
        onSubmit={submit}
      >
        {modal?.kind === "change" && (
          <Field label="Desde">
            <input name="fromDate" type="date" min={todayInArgentina()} defaultValue={todayInArgentina()} required />
          </Field>
        )}
        <Field label="Día">
          <select name="day" defaultValue={editingRule?.day ?? "MONDAY"}>
            {WEEK_DAYS.map((day) => (
              <option key={day} value={day}>
                {DAY_LABEL[day]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde las">
          <input name="startTime" type="time" defaultValue={editingRule?.startTime} required />
        </Field>
        <Field label="Hasta las">
          <input name="endTime" type="time" defaultValue={editingRule?.endTime} required />
        </Field>
        <Field label="Pista">
          <select name="spaceId" defaultValue={editingRule?.spaceId ?? danceClass.defaultSpaceId ?? ""}>
            <option value="">Sin pista</option>
            {spaces.filter((item) => item.status === "ACTIVE").map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Profesores del horario (vacío: los de la clase)">
          <select name="professorIds" multiple defaultValue={editingRule?.professorIds ?? []}>
            {professors.map((item) => (
              <option key={item._id} value={item._id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </Field>
        {modal?.kind === "add" && (
          <>
            <Field label="Vigente desde">
              <input name="validFrom" type="date" min={todayInArgentina()} defaultValue={todayInArgentina()} required />
            </Field>
            <Field label="Hasta (opcional)">
              <input name="validTo" type="date" min={todayInArgentina()} />
            </Field>
          </>
        )}
        {modal?.kind === "change" && (
          <Field label="Motivo (opcional)" wide>
            <input name="reason" maxLength={300} />
          </Field>
        )}
      </LiveModal>

      <LiveModal
        open={modal?.kind === "end"}
        title="Finalizar horario"
        description="Desde esa fecha no se generan más clases de este horario. Las futuras sin movimientos se eliminan; las que tienen asistencia o pagos quedan canceladas con el motivo."
        submitting={busy}
        submitLabel="Finalizar"
        onClose={() => setModal(null)}
        onSubmit={submit}
      >
        <Field label="Sin clases desde">
          <input name="fromDate" type="date" min={todayInArgentina()} defaultValue={todayInArgentina()} required />
        </Field>
        <Field label="Motivo">
          <input name="reason" maxLength={300} />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "pause"}
        title="Pausar la clase"
        description="No se generan clases regulares durante la pausa. Las inscripciones y el historial se conservan; las clases ya programadas en ese período quedan suspendidas."
        submitting={busy}
        submitLabel="Pausar"
        onClose={() => setModal(null)}
        onSubmit={submit}
      >
        <Field label="Desde">
          <input name="from" type="date" min={todayInArgentina()} defaultValue={todayInArgentina()} required />
        </Field>
        <Field label="Hasta (opcional)">
          <input name="to" type="date" min={todayInArgentina()} />
        </Field>
        <Field label="Motivo" wide>
          <input name="reason" maxLength={300} />
        </Field>
      </LiveModal>
    </section>
  );
}
