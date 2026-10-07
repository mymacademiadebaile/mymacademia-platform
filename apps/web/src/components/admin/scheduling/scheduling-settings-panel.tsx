"use client";

import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal } from "../live/live-common";
import type { Branch } from "../live/live-types";
import liveStyles from "../live/live.module.css";
import styles from "./calendar.module.css";
import type { DanceSpace, Holiday } from "./scheduling-types";

type BillingSettings = { monthlyDueDay: number; midMonthPolicy: "ASK" | "FULL" | "PRORATED" | "CUSTOM" };

const SPACE_STATUS: Record<DanceSpace["status"], string> = { ACTIVE: "Disponible", MAINTENANCE: "En mantenimiento", INACTIVE: "Fuera de uso" };

/** Dance floors, holidays and billing rules of the academy. */
export function SchedulingSettingsPanel({ branches }: { branches: Branch[] }) {
  const { toast, confirm } = useAdminFeedback();
  const [spaces, setSpaces] = useState<DanceSpace[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [billing, setBilling] = useState<BillingSettings | null>(null);
  const [spaceModal, setSpaceModal] = useState<{ space?: DanceSpace } | null>(null);
  const [holidayModal, setHolidayModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [spaceList, holidayList, settings] = await Promise.all([
        apiFetch<{ items: DanceSpace[] }>("/admin/spaces"),
        apiFetch<{ items: Holiday[] }>("/admin/holidays?from=" + todayInArgentina().slice(0, 4) + "-01-01"),
        apiFetch<BillingSettings>("/admin/billing/settings")
      ]);
      setSpaces(spaceList.items);
      setHolidays(holidayList.items);
      setBilling(settings);
    } catch (error) {
      toast({ title: "No pudimos cargar la configuración", description: apiMessage(error), tone: "error" });
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast({ title: success, tone: "success" });
      setSpaceModal(null);
      setHolidayModal(false);
      await load();
    } catch (error) {
      toast({ title: "No se pudo guardar", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function submitSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const capacity = Number(form.get("capacity"));
    const body = {
      name: form.get("name"),
      description: form.get("description") ?? "",
      capacity: capacity > 0 ? capacity : null,
      status: form.get("status"),
      availabilityNotes: form.get("availabilityNotes") ?? ""
    };
    const editing = spaceModal?.space;
    void run(
      () =>
        editing
          ? apiFetch("/admin/spaces/" + editing._id, { method: "PATCH", body: JSON.stringify(body) })
          : apiFetch("/admin/spaces", { method: "POST", body: JSON.stringify({ ...body, branchId: form.get("branchId") }) }),
      editing ? "Pista actualizada" : "Pista creada"
    );
  }

  function submitHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        apiFetch("/admin/holidays", {
          method: "POST",
          body: JSON.stringify({ date: form.get("date"), name: form.get("name"), branchId: form.get("branchId") || undefined })
        }),
      "Feriado cargado: las clases de ese día quedaron suspendidas"
    );
  }

  async function removeHoliday(holiday: Holiday) {
    const approved = await confirm({
      title: "Quitar feriado",
      description: `Las clases del ${formatDateOnly(holiday.date)} suspendidas por el feriado vuelven a quedar programadas.`,
      confirmLabel: "Quitar"
    });
    if (approved) await run(() => apiFetch("/admin/holidays/" + holiday._id, { method: "DELETE" }), "Feriado quitado");
  }

  function submitBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        apiFetch("/admin/billing/settings", {
          method: "PATCH",
          body: JSON.stringify({ monthlyDueDay: Number(form.get("monthlyDueDay")), midMonthPolicy: form.get("midMonthPolicy") })
        }),
      "Reglas de cobro guardadas"
    );
  }

  const branchName = (id?: string) => branches.find((item) => item._id === id)?.name ?? "Todas las sedes";

  return (
    <div className={styles.drawerBody} style={{ padding: 0 }}>
      <section className={styles.section}>
        <div className={styles.actionRow} style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3>Pistas de baile</h3>
          <button className={`${styles.actionButton} ${styles.actionPrimary}`} onClick={() => setSpaceModal({})}>
            <Plus size={14} /> Nueva pista
          </button>
        </div>
        <p className={styles.sessionMeta}>Dos clases pueden coincidir en horario si usan pistas distintas. El sistema impide superponer clases en la misma pista.</p>
        <div className={styles.listItems}>
          {spaces.map((space) => (
            <button key={space._id} className={styles.sessionCard} onClick={() => setSpaceModal({ space })}>
              <span className={styles.sessionName}>{space.name}</span>
              <span className={styles.sessionMeta}>
                {branchName(space.branchId)}
                {space.capacity ? " · " + space.capacity + " personas" : ""}
                {space.availabilityNotes ? " · " + space.availabilityNotes : ""}
              </span>
              <span className={styles.badges}>
                <span className={`${styles.badge} ${space.status === "ACTIVE" ? styles.badgeOk : styles.badgeOff}`}>{SPACE_STATUS[space.status]}</span>
              </span>
            </button>
          ))}
          {!spaces.length && <p className={styles.emptyDay}>Todavía no hay pistas cargadas. Asignarlas es opcional.</p>}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.actionRow} style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3>Feriados</h3>
          <button className={styles.actionButton} onClick={() => setHolidayModal(true)}>
            <CalendarOff size={14} /> Cargar feriado
          </button>
        </div>
        <div className={liveStyles.listCard}>
          {holidays.map((holiday) => (
            <div key={holiday._id} className={liveStyles.listRow}>
              <div className={liveStyles.rowBody}>
                <strong>{holiday.name}</strong>
                <small>
                  {formatDateOnly(holiday.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {branchName(holiday.branchId)}
                </small>
              </div>
              <button className={liveStyles.inlineAction} aria-label={"Quitar " + holiday.name} onClick={() => void removeHoliday(holiday)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!holidays.length && <p className={styles.emptyDay}>Sin feriados cargados este año.</p>}
        </div>
      </section>

      {billing && (
        <section className={styles.section}>
          <h3>Cobros</h3>
          <form className={liveStyles.formGrid} onSubmit={submitBilling}>
            <Field label="Día de vencimiento de la mensualidad">
              <input name="monthlyDueDay" type="number" min={1} max={28} defaultValue={billing.monthlyDueDay} required />
            </Field>
            <Field label="Alta a mitad de mes">
              <select name="midMonthPolicy" defaultValue={billing.midMonthPolicy}>
                <option value="ASK">Preguntar en cada alta</option>
                <option value="FULL">Cuota completa</option>
                <option value="PRORATED">Proporcional</option>
                <option value="CUSTOM">Importe personalizado</option>
              </select>
            </Field>
            <div>
              <button className={liveStyles.primary} disabled={busy}>
                Guardar reglas
              </button>
            </div>
          </form>
        </section>
      )}

      <LiveModal
        open={Boolean(spaceModal)}
        title={spaceModal?.space ? "Editar pista" : "Nueva pista"}
        description="Espacio físico donde se dictan las clases."
        submitting={busy}
        onClose={() => setSpaceModal(null)}
        onSubmit={submitSpace}
      >
        {!spaceModal?.space && (
          <Field label="Sede">
            <select name="branchId" required>
              {branches.filter((item) => item.isActive).map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Nombre">
          <input name="name" required maxLength={80} defaultValue={spaceModal?.space?.name} />
        </Field>
        <Field label="Capacidad (personas)">
          <input name="capacity" type="number" min={1} max={1000} defaultValue={spaceModal?.space?.capacity} />
        </Field>
        <Field label="Estado">
          <select name="status" defaultValue={spaceModal?.space?.status ?? "ACTIVE"}>
            {(Object.keys(SPACE_STATUS) as DanceSpace["status"][]).map((item) => (
              <option key={item} value={item}>
                {SPACE_STATUS[item]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Disponibilidad" wide>
          <input name="availabilityNotes" maxLength={300} defaultValue={spaceModal?.space?.availabilityNotes} placeholder="Ej.: solo turno noche" />
        </Field>
        <Field label="Descripción" wide>
          <textarea name="description" maxLength={500} defaultValue={spaceModal?.space?.description} />
        </Field>
      </LiveModal>

      <LiveModal
        open={holidayModal}
        title="Cargar feriado"
        description="Las clases regulares de ese día quedan suspendidas: podés reprogramarlas desde el calendario."
        submitting={busy}
        submitLabel="Cargar"
        onClose={() => setHolidayModal(false)}
        onSubmit={submitHoliday}
      >
        <Field label="Fecha">
          <input name="date" type="date" required />
        </Field>
        <Field label="Nombre">
          <input name="name" required minLength={2} maxLength={120} placeholder="Ej.: Día de la Bandera" />
        </Field>
        <Field label="Sede" wide>
          <select name="branchId" defaultValue="">
            <option value="">Todas las sedes</option>
            {branches.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      </LiveModal>
    </div>
  );
}
