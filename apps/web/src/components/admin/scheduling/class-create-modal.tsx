"use client";

import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal, WebSwitch } from "../live/live-common";
import type { BillingMode, DanceClass } from "../live/live-types";
import styles from "./calendar.module.css";
import { DAY_LABELS, DEFAULT_SCHEDULE, hourAfter, type CalendarOptions, type ScheduleDraft } from "./calendar-helpers";
import { MultiSelect } from "./multi-select";

export function ClassCreateModal({
  open,
  options,
  onClose,
  onCreated
}: {
  open: boolean;
  options: CalendarOptions;
  onClose: () => void;
  onCreated: (danceClass: DanceClass) => Promise<void>;
}) {
  const { toast } = useAdminFeedback();
  const [classSaving, setClassSaving] = useState(false);
  const [billingMode, setBillingMode] = useState<BillingMode>("PER_CLASS");
  const [classBranchId, setClassBranchId] = useState("");
  const [classSpaceId, setClassSpaceId] = useState("");
  const [selectedProfessorIds, setSelectedProfessorIds] = useState<string[]>([]);
  const [selectedDisciplineIds, setSelectedDisciplineIds] = useState<string[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [selectedLevelIds, setSelectedLevelIds] = useState<string[]>([]);
  const [freeTrialEnabled, setFreeTrialEnabled] = useState(false);
  const [openMultiSelect, setOpenMultiSelect] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([DEFAULT_SCHEDULE]);

  const classSpaces = useMemo(
    () => options.spaces.filter((item) => item.status === "ACTIVE" && (!classBranchId || item.branchId === classBranchId)),
    [options.spaces, classBranchId]
  );

  useEffect(() => {
    if (!classBranchId && options.branches[0]) setClassBranchId(options.branches[0]._id);
  }, [classBranchId, options.branches]);

  useEffect(() => {
    if (!classSpaces.some((item) => item._id === classSpaceId)) setClassSpaceId(classSpaces[0]?._id ?? "");
  }, [classSpaceId, classSpaces]);

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setSchedules((current) => current.map((schedule, scheduleIndex) => (scheduleIndex === index ? { ...schedule, ...patch } : schedule)));
  }

  function addSchedule() {
    setSchedules((current) => {
      const last = current.at(-1);
      const startTime = last?.endTime ?? "18:00";
      return [...current, { day: last?.day ?? "MONDAY", startTime, endTime: hourAfter(startTime) }];
    });
  }

  function removeSchedule(index: number) {
    setSchedules((current) => current.filter((_, scheduleIndex) => scheduleIndex !== index));
  }

  function close() {
    onClose();
    setOpenMultiSelect(null);
  }

  async function submitClassCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfessorIds.length || !selectedDisciplineIds.length || !selectedSegmentIds.length || !selectedLevelIds.length) {
      toast({ title: "Completá los datos de la clase", description: "Elegí al menos una opción en profesores, disciplina, público y nivel.", tone: "warning" });
      return;
    }
    const form = new FormData(event.currentTarget);
    setClassSaving(true);
    try {
      const danceClass = await apiFetch<DanceClass>("/admin/classes", {
        method: "POST",
        body: JSON.stringify({
          branchId: classBranchId,
          name: form.get("name"),
          professorIds: selectedProfessorIds,
          disciplineIds: selectedDisciplineIds,
          segmentIds: selectedSegmentIds,
          levelIds: selectedLevelIds,
          capacity: Number(form.get("capacity")),
          billingMode,
          pricePerClass: Number(form.get("pricePerClass") || 0),
          monthlyPrice4: form.get("monthlyPrice4") ? Number(form.get("monthlyPrice4")) : undefined,
          monthlyPrice8: form.get("monthlyPrice8") ? Number(form.get("monthlyPrice8")) : undefined,
          freeTrialEnabled,
          schedules,
          defaultSpaceId: classSpaceId || undefined
        })
      });
      onClose();
      setSchedules([DEFAULT_SCHEDULE]);
      setBillingMode("PER_CLASS");
      setSelectedProfessorIds([]);
      setSelectedDisciplineIds([]);
      setSelectedSegmentIds([]);
      setSelectedLevelIds([]);
      setFreeTrialEnabled(false);
      setOpenMultiSelect(null);
      toast({ title: "Clase creada", description: "Ya podés abrirla desde el calendario para gestionarla." });
      await onCreated(danceClass);
    } catch (requestError) {
      toast({ title: "No se pudo crear la clase", description: apiMessage(requestError), tone: "error" });
    } finally {
      setClassSaving(false);
    }
  }

  return (
    <LiveModal
      open={open}
      title="Crear clase"
      description="Definí su grupo, modalidad de cobro y horarios. Luego podés editarla desde cualquier clase del calendario."
      submitting={classSaving}
      submitLabel="Crear clase"
      onClose={close}
      onSubmit={submitClassCreate}
    >
      <Field label="Sede">
        <select name="branchId" required value={classBranchId} onChange={(event) => setClassBranchId(event.target.value)}>
          {options.branches.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="Pista">
        <select name="defaultSpaceId" required value={classSpaceId} onChange={(event) => setClassSpaceId(event.target.value)}>
          {classSpaces.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="Nombre de la clase" wide><input name="name" required minLength={2} placeholder="Ej.: Bachata inicial" /></Field>
      <div className={`${styles.multiField} ${styles.multiFieldWide}`}>
        <span>Profesores</span>
        <MultiSelect options={options.professors} selectedIds={selectedProfessorIds} onChange={setSelectedProfessorIds} placeholder="Seleccionar profesores" open={openMultiSelect === "professors"} onOpenChange={(isOpen) => setOpenMultiSelect(isOpen ? "professors" : null)} />
      </div>
      <div className={styles.multiField}>
        <span>Disciplinas</span>
        <MultiSelect options={options.disciplines} selectedIds={selectedDisciplineIds} onChange={setSelectedDisciplineIds} placeholder="Seleccionar disciplinas" open={openMultiSelect === "disciplines"} onOpenChange={(isOpen) => setOpenMultiSelect(isOpen ? "disciplines" : null)} />
      </div>
      <div className={styles.multiField}>
        <span>Público</span>
        <MultiSelect options={options.segments} selectedIds={selectedSegmentIds} onChange={setSelectedSegmentIds} placeholder="Seleccionar público" open={openMultiSelect === "segments"} onOpenChange={(isOpen) => setOpenMultiSelect(isOpen ? "segments" : null)} />
      </div>
      <div className={styles.multiField}>
        <span>Niveles</span>
        <MultiSelect options={options.levels} selectedIds={selectedLevelIds} onChange={setSelectedLevelIds} placeholder="Seleccionar niveles" open={openMultiSelect === "levels"} onOpenChange={(isOpen) => setOpenMultiSelect(isOpen ? "levels" : null)} />
      </div>
      <Field label="Cupo"><input className={styles.capacityInput} name="capacity" type="number" min={1} defaultValue={50} required /></Field>
      <Field label="Modalidad de cobro">
        <select value={billingMode} onChange={(event) => setBillingMode(event.target.value as BillingMode)}>
          <option value="PER_CLASS">Por clase</option>
          <option value="MONTHLY">Mensual</option>
          <option value="BOTH">Por clase y mensual</option>
        </select>
      </Field>
      {(billingMode === "PER_CLASS" || billingMode === "BOTH") && <Field label="Precio por clase (ARS)"><input name="pricePerClass" type="number" min={1} step="1" required /></Field>}
      {(billingMode === "MONTHLY" || billingMode === "BOTH") && (
        <>
          <Field label="Mensual · 4 clases (ARS)"><input name="monthlyPrice4" type="number" min={1} step="1" placeholder="Opcional" /></Field>
          <Field label="Mensual · 8 clases (ARS)">
            <input name="monthlyPrice8" type="number" min={1} step="1" placeholder="Opcional" />
            <small>Completá al menos uno de los dos planes.</small>
          </Field>
        </>
      )}
      <Field label="Clase de prueba" wide>
        <div className={styles.trialRow}>
          <span>Permití una primera clase sin cargo.</span>
          <WebSwitch label={freeTrialEnabled ? "Habilitada" : "No habilitada"} checked={freeTrialEnabled} onChange={setFreeTrialEnabled} />
        </div>
      </Field>
      <div className={styles.scheduleEditor}>
        <div className={styles.scheduleEditorHeader}>
          <strong>Horarios</strong>
          <button type="button" onClick={addSchedule}><Plus size={14} /> Agregar horario</button>
        </div>
        {schedules.map((schedule, index) => (
          <div className={styles.scheduleEditorRow} key={index}>
            <select value={schedule.day} onChange={(event) => updateSchedule(index, { day: event.target.value })}>{Object.entries(DAY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <input type="time" value={schedule.startTime} onChange={(event) => updateSchedule(index, { startTime: event.target.value })} required />
            <input type="time" value={schedule.endTime} onChange={(event) => updateSchedule(index, { endTime: event.target.value })} required />
            <button type="button" disabled={schedules.length === 1} onClick={() => removeSchedule(index)} aria-label="Eliminar horario"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </LiveModal>
  );
}
