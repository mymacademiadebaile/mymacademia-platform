"use client";

import { Info, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { StudentOverview, StudentsData } from "../professor-types";
import {
  Card,
  EmptyState,
  ErrorState,
  FilterBar,
  PageSkeleton,
  ProfessorPageHeader,
  SearchField,
  SelectFilter,
  uiStyles
} from "../professor-ui";
import { fullName } from "../format";
import { useProfessorData } from "../use-professor-data";
import { StudentRow } from "./student-row";
import styles from "./professor-students.module.css";

const PAYMENT_VALUES = ["PAID", "PENDING", "OVERDUE", "FREE"] as const;
const BILLING_VALUES = ["PER_CLASS", "MONTHLY", "FREE"] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function pick(value: string | null, allowed: readonly string[]) {
  return value && allowed.includes(value) ? value : "";
}

export function ProfessorStudents() {
  const { data, error, loading, refreshing, reload } = useProfessorData<StudentsData>("/students");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [classId, setClassId] = useState(params.get("class") ?? "");
  const [payment, setPayment] = useState(pick(params.get("payment"), PAYMENT_VALUES));
  const [billing, setBilling] = useState(pick(params.get("billing"), BILLING_VALUES));
  const [attendance, setAttendance] = useState(pick(params.get("attendance"), ["ABSENT"]));

  // Keep the URL in sync without reloading or scrolling.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (classId) next.set("class", classId);
    if (payment) next.set("payment", payment);
    if (billing) next.set("billing", billing);
    if (attendance) next.set("attendance", attendance);
    const search = next.toString();
    if (search === params.toString()) return;
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [query, classId, payment, billing, attendance, params, pathname, router]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const text = normalize(query);
    const digits = query.replace(/\D/g, "");
    const result: StudentOverview[] = [];

    for (const student of items) {
      if (text) {
        const haystack = normalize(`${fullName(student)} ${student.lastName} ${student.email ?? ""}`);
        const phoneDigits = (student.phone ?? "").replace(/\D/g, "");
        const matchesText = haystack.includes(text);
        const matchesPhone = digits.length > 0 && phoneDigits.includes(digits);
        if (!matchesText && !matchesPhone) continue;
      }
      if (attendance === "ABSENT" && student.lastAttendance?.status !== "ABSENT") continue;

      const enrollments = student.enrollments.filter(
        (enrollment) =>
          (!classId || enrollment.classId === classId) &&
          (!payment || enrollment.paymentStatus === payment) &&
          (!billing || enrollment.billingType === billing)
      );
      if (enrollments.length === 0) continue;
      result.push({ ...student, enrollments });
    }
    return result;
  }, [data, query, classId, payment, billing, attendance]);

  const hasFilters = Boolean(query || classId || payment || billing || attendance);

  function clearFilters() {
    setQuery("");
    setClassId("");
    setPayment("");
    setBilling("");
    setAttendance("");
  }

  if (loading) return <PageSkeleton blocks={2} />;

  const total = data?.items.length ?? 0;

  return (
    <div>
      <ProfessorPageHeader
        title="Mis alumnos"
        subtitle="Alumnos activos de tus clases"
        refreshing={refreshing}
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      {data && total === 0 && (
        <EmptyState
          icon={<Users size={26} aria-hidden />}
          title="Todavía no tenés alumnos inscriptos."
          description="Cuando alguien se inscriba en tus clases, va a aparecer acá."
        />
      )}

      {data && total > 0 && (
        <>
          <FilterBar>
            <SearchField
              value={query}
              onChange={setQuery}
              label="Buscar alumnos"
              placeholder="Buscar por nombre, apellido, email o teléfono"
            />
            <SelectFilter
              label="Clase"
              value={classId}
              onChange={setClassId}
              options={[
                { value: "", label: "Todas" },
                ...data.classes.map((item) => ({ value: item.id, label: item.name }))
              ]}
            />
            <SelectFilter
              label="Estado de pago"
              value={payment}
              onChange={setPayment}
              options={[
                { value: "", label: "Todos" },
                { value: "PAID", label: "Pagado" },
                { value: "PENDING", label: "Pendiente" },
                { value: "OVERDUE", label: "Vencido" },
                { value: "FREE", label: "Gratis" }
              ]}
            />
            <SelectFilter
              label="Modalidad"
              value={billing}
              onChange={setBilling}
              options={[
                { value: "", label: "Todas" },
                { value: "PER_CLASS", label: "Por clase" },
                { value: "MONTHLY", label: "Mensual" },
                { value: "FREE", label: "Gratis" }
              ]}
            />
            <SelectFilter
              label="Asistencia"
              value={attendance}
              onChange={setAttendance}
              options={[
                { value: "", label: "Todas" },
                { value: "ABSENT", label: "Faltó en su última clase" }
              ]}
            />
          </FilterBar>

          <div className={styles.meta}>
            <span role="status">
              {filtered.length} {filtered.length === 1 ? "alumno" : "alumnos"}
              {hasFilters ? ` de ${total}` : ""}
            </span>
            <span className={styles.note}>
              <Info size={14} aria-hidden /> Sólo se muestran inscripciones activas
            </span>
            {hasFilters && (
              <button type="button" className={uiStyles.ghostButton} onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title={
                payment === "PENDING" || payment === "OVERDUE"
                  ? "No hay alumnos con pagos pendientes."
                  : "No hay alumnos que coincidan con los filtros."
              }
              description="Probá cambiando la búsqueda o quitando algún filtro."
              action={
                <button type="button" className={uiStyles.secondaryButton} onClick={clearFilters}>
                  Limpiar filtros
                </button>
              }
            />
          ) : (
            <Card className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Alumno</th>
                    <th scope="col">Contacto</th>
                    <th scope="col">Clases</th>
                    <th scope="col">Modalidad</th>
                    <th scope="col">Estado financiero</th>
                    <th scope="col">Última asistencia</th>
                    <th scope="col">
                      <span className={styles.srOnly}>Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student) => (
                    <StudentRow key={student.id} student={student} />
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
