import type { FormEvent } from "react";
import type { Branch, Student } from "./live-types";
import { Field, LiveModal } from "./live-common";

export function StudentEditModal({
  open,
  student,
  branches,
  busy,
  onClose,
  onSubmit
}: {
  open: boolean;
  student: Student;
  branches: Branch[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <LiveModal
      open={open}
      title="Editar alumno"
      description="Actualizá los datos de la ficha."
      submitting={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <Field label="Sede">
        <select name="branchId" required defaultValue={student.branchId}>
          {branches.filter((branch) => branch.isActive).map((branch) => (
            <option value={branch._id} key={branch._id}>{branch.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Nombre"><input name="firstName" defaultValue={student.firstName} required /></Field>
      <Field label="Apellido"><input name="lastName" defaultValue={student.lastName} required /></Field>
      <Field label="DNI"><input name="dni" defaultValue={student.dni ?? ""} inputMode="numeric" maxLength={14} autoComplete="off" /></Field>
      <Field label="Teléfono"><input name="phone" defaultValue={student.phone ?? ""} /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={student.email ?? ""} /></Field>
      <Field label="Fecha de nacimiento">
        <input name="birthDate" type="date" defaultValue={student.birthDate ? student.birthDate.slice(0, 10) : ""} />
      </Field>
      <Field label="Responsable"><input name="guardianName" defaultValue={student.guardianName ?? ""} /></Field>
      <Field label="Teléfono responsable"><input name="guardianPhone" defaultValue={student.guardianPhone ?? ""} /></Field>
      <Field label="Notas" wide><textarea name="notes" rows={4} defaultValue={student.notes ?? ""} /></Field>
    </LiveModal>
  );
}
