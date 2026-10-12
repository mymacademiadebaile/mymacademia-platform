import { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BillingMode, Branch, CatalogItem, DanceClass, Professor } from "./live-types";
import { Field, LiveModal } from "./live-common";
import type { ScheduleDraft } from "./class-detail-types";
import { dayLabels, monthlyPriceFor, refId } from "./class-detail-helpers";
import styles from "./class-detail.module.css";

type Props = {
  open: boolean;
  danceClass: DanceClass;
  branches: Branch[];
  professors: Professor[];
  catalogs: CatalogItem[];
  busy: boolean;
  editBillingMode: BillingMode;
  editSchedules: ScheduleDraft[];
  onBillingModeChange: (value: BillingMode) => void;
  onSchedulesChange: (updater: (current: ScheduleDraft[]) => ScheduleDraft[]) => void;
  onUpdateSchedule: (index: number, patch: Partial<ScheduleDraft>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ClassEditModal({
  open,
  danceClass,
  branches,
  professors,
  catalogs,
  busy,
  editBillingMode,
  editSchedules,
  onBillingModeChange,
  onSchedulesChange,
  onUpdateSchedule,
  onClose,
  onSubmit
}: Props) {
  const disciplines = catalogs.filter((item) => item.type === "DISCIPLINE");
  const segments = catalogs.filter((item) => item.type === "SEGMENT");
  const levels = catalogs.filter((item) => item.type === "LEVEL");
  const selectedProfessorIds = danceClass.professorIds.map(refId);
  const selectedDisciplineIds = danceClass.disciplineIds.map(refId);
  const selectedSegmentIds = danceClass.segmentIds.map(refId);
  const selectedLevelIds = danceClass.levelIds.map(refId);
  // Inactive items stay selectable only when the class already uses them.
  const selectableProfessors = professors.filter((item) => item.isActive || selectedProfessorIds.includes(item._id));
  const selectableDisciplines = disciplines.filter((item) => item.isActive || selectedDisciplineIds.includes(item._id));
  const selectableSegments = segments.filter((item) => item.isActive || selectedSegmentIds.includes(item._id));
  const selectableLevels = levels.filter((item) => item.isActive || selectedLevelIds.includes(item._id));
  const inactiveSuffix = (item: { isActive: boolean }) => (item.isActive ? "" : " (inactivo)");

  return (
    <LiveModal
      open={open}
      title="Editar clase"
      description="Podés cambiar precios, modalidad, profesores y horarios."
      submitting={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <Field label="Sede">
        <select name="branchId" defaultValue={danceClass.branchId} required>
          {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
        </select>
      </Field>
      <Field label="Nombre"><input name="name" defaultValue={danceClass.name} required /></Field>
      <Field label="Cupo"><input name="capacity" type="number" min={1} defaultValue={danceClass.capacity} required /></Field>
      <Field label="Modalidad de cobro">
        <select value={editBillingMode} onChange={(event) => onBillingModeChange(event.target.value as BillingMode)}>
          <option value="PER_CLASS">Por clase</option>
          <option value="MONTHLY">Mensual</option>
          <option value="BOTH">Por clase o mensual</option>
          <option value="FREE">Sin cargo</option>
        </select>
      </Field>
      {(editBillingMode === "PER_CLASS" || editBillingMode === "BOTH") && (
        <Field label="Precio por clase (ARS)">
          <input name="pricePerClass" type="number" min={1} step="1" defaultValue={danceClass.pricePerClass ?? 0} required />
        </Field>
      )}
      {(editBillingMode === "MONTHLY" || editBillingMode === "BOTH") && (
        <>
          <Field label="Mensual · 4 clases (ARS)">
            <input name="monthlyPrice4" type="number" min={1} step="1" defaultValue={monthlyPriceFor(danceClass, 4)} required />
          </Field>
          <Field label="Mensual · 8 clases (ARS)">
            <input name="monthlyPrice8" type="number" min={1} step="1" defaultValue={monthlyPriceFor(danceClass, 8)} required />
          </Field>
        </>
      )}
      <Field label="Clase de prueba" wide>
        <label className={styles.switchRow}>
          <input name="freeTrialEnabled" type="checkbox" defaultChecked={danceClass.freeTrialEnabled} />
          <span>Permitir una clase gratuita de prueba.</span>
        </label>
      </Field>
      <Field label="Profesores" wide>
        <select name="professorIds" multiple defaultValue={selectedProfessorIds} size={Math.min(5, Math.max(3, selectableProfessors.length))} required>
          {selectableProfessors.map((professor) => <option key={professor._id} value={professor._id}>{professor.displayName}{inactiveSuffix(professor)}</option>)}
        </select>
      </Field>
      <Field label="Disciplinas">
        <select name="disciplineIds" multiple defaultValue={selectedDisciplineIds} size={4} required>
          {selectableDisciplines.map((item) => <option key={item._id} value={item._id}>{item.name}{inactiveSuffix(item)}</option>)}
        </select>
      </Field>
      <Field label="Público">
        <select name="segmentIds" multiple defaultValue={selectedSegmentIds} size={3} required>
          {selectableSegments.map((item) => <option key={item._id} value={item._id}>{item.name}{inactiveSuffix(item)}</option>)}
        </select>
      </Field>
      <Field label="Niveles">
        <select name="levelIds" multiple defaultValue={selectedLevelIds} size={3} required>
          {selectableLevels.map((item) => <option key={item._id} value={item._id}>{item.name}{inactiveSuffix(item)}</option>)}
        </select>
      </Field>

      <div className={styles.scheduleEditor}>
        <div className={styles.scheduleEditorHeader}>
          <strong>Horarios</strong>
          <button type="button" onClick={() => onSchedulesChange((current) => [...current, { day: "MONDAY", startTime: "18:00", endTime: "19:00" }])}>
            <Plus size={14} /> Agregar
          </button>
        </div>
        {editSchedules.map((schedule, index) => (
          <div className={styles.scheduleEditorRow} key={index}>
            <select value={schedule.day} onChange={(event) => onUpdateSchedule(index, { day: event.target.value })}>
              {Object.entries(dayLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="time" value={schedule.startTime} onChange={(event) => onUpdateSchedule(index, { startTime: event.target.value })} />
            <input type="time" value={schedule.endTime} onChange={(event) => onUpdateSchedule(index, { endTime: event.target.value })} />
            <button type="button" disabled={editSchedules.length === 1} onClick={() => onSchedulesChange((current) => current.filter((_, i) => i !== index))}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </LiveModal>
  );
}
