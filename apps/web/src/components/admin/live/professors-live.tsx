"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, LayoutGrid, List, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, CatalogItem, Paginated, Professor } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock, PaginationControls } from "./live-common";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import styles from "./live.module.css";

function disciplineName(value: CatalogItem | string) {
  return typeof value === "string" ? value : value.name;
}

type ProfessorView = "cards" | "list";

function ProfessorAvatar({ professor }: { professor: Professor }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = professor.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (professor.avatarUrl && !imageFailed) {
    return (
      <img
        className={`${styles.avatar} ${styles.avatarImage}`}
        src={professor.avatarUrl}
        alt={`Foto de ${professor.displayName}`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <span className={styles.avatar} aria-label={`Iniciales de ${professor.displayName}`}>{initials}</span>;
}

export function ProfessorsLive() {
  const router = useRouter();
  const { toast } = useAdminFeedback();
  const [items, setItems] = useState<Professor[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<ProfessorView>("cards");
  const [modal, setModal] = useState(false);
  const [bioShortDraft, setBioShortDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("q", search);
      if (branchId) params.set("branchId", branchId);
      if (disciplineId) params.set("disciplineId", disciplineId);
      if (status !== "all") params.set("isActive", String(status === "active"));

      const [professorList, branchList, catalogList] = await Promise.all([
        apiFetch<Paginated<Professor>>(`/admin/professors?${params.toString()}`),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<CatalogItem[]>("/admin/catalogs")
      ]);
      const lastPage = Math.max(1, Math.ceil(professorList.total / professorList.limit));
      if (page > lastPage) {
        const correctedParams = new URLSearchParams(params);
        correctedParams.set("page", String(lastPage));
        const correctedProfessorList = await apiFetch<Paginated<Professor>>(
          `/admin/professors?${correctedParams.toString()}`
        );

        setItems(correctedProfessorList.items);
        setTotal(correctedProfessorList.total);
        setBranches(branchList.filter((branch) => branch.isActive));
        setCatalogs(catalogList.filter((item) => item.isActive && item.type === "DISCIPLINE"));
        setPage(lastPage);
        return;
      }

      setItems(professorList.items);
      setTotal(professorList.total);
      setBranches(branchList.filter((branch) => branch.isActive));
      setCatalogs(catalogList.filter((item) => item.isActive && item.type === "DISCIPLINE"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [search, branchId, disciplineId, status, page, limit]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const storedView = window.localStorage.getItem("admin-professors-view");
    if (storedView === "cards" || storedView === "list") setView(storedView);
  }, []);

  const selectedDisciplines = useMemo(
    () => new Set(catalogs.map((item) => item._id)),
    [catalogs]
  );

  function closeModal() {
    setBioShortDraft("");
    setFormError("");
    setModal(false);
  }

  function changeView(nextView: ProfessorView) {
    setView(nextView);
    window.localStorage.setItem("admin-professors-view", nextView);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setFormError("");

    try {
      const professor = await apiFetch<Professor>("/admin/professors", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          displayName: form.get("displayName"),
          email: form.get("email"),
          password: form.get("password"),
          phone: form.get("phone") || undefined,
          bioShort: form.get("bioShort") || undefined,
          bio: form.get("bio") || undefined,
          instagram: form.get("instagram") || undefined,
          branchIds: form.getAll("branchIds"),
          disciplineIds: form.getAll("disciplineIds").filter((id) => selectedDisciplines.has(String(id)))
        })
      });

      closeModal();
      toast("Profesor creado correctamente");
      router.push("/admin/professors/" + professor._id);
    } catch (requestError) {
      setFormError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="EQUIPO"
        title="Profesores"
        description="Accesos, disciplinas, sedes, clases y alumnos del equipo."
        actionLabel="Nuevo profesor"
        onAction={() => {
          setBioShortDraft("");
          setFormError("");
          setModal(true);
        }}
      />

      <div className={styles.filterBar}>
        <div className={styles.searchInline}>
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nombre o email..."
          />
        </div>
        <select value={branchId} onChange={(event) => {
          setBranchId(event.target.value);
          setPage(1);
        }}>
          <option value="">Todas las sedes</option>
          {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
        </select>
        <select value={disciplineId} onChange={(event) => {
          setDisciplineId(event.target.value);
          setPage(1);
        }}>
          <option value="">Todas las disciplinas</option>
          {catalogs.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select>
        <select value={status} onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
        <div className={styles.viewToggle} role="group" aria-label="Vista de profesores">
          <button
            type="button"
            className={view === "cards" ? styles.viewToggleActive : ""}
            aria-label="Ver profesores en tarjetas"
            aria-pressed={view === "cards"}
            onClick={() => changeView("cards")}
          >
            <LayoutGrid size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={view === "list" ? styles.viewToggleActive : ""}
            aria-label="Ver profesores en lista"
            aria-pressed={view === "list"}
            onClick={() => changeView("list")}
          >
            <List size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {(items.length > 0 || !loading) && (
        <>
          <div className={view === "cards" ? styles.liveGrid3 : styles.listCard}>
            {items.length === 0 && <div className={styles.stateBlock}>No hay profesores para estos filtros.</div>}
            {view === "cards"
              ? items.map((professor) => (
                  <Link className={styles.cardLink} href={`/admin/professors/${professor._id}`} key={professor._id}>
                    <div className={styles.professorCardHeader}>
                      <ProfessorAvatar professor={professor} />
                      <span className={professor.isActive ? styles.pill : styles.pillOff}>
                        {professor.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <strong className={styles.cardTitle}>{professor.displayName}</strong>
                    <span className={styles.cardDetail}>
                      {professor.userId?.email || professor.phone || "Sin contacto"}
                    </span>
                    <div className={styles.tagRow}>
                      {professor.disciplineIds?.slice(0, 4).map((discipline) => (
                        <span key={typeof discipline === "string" ? discipline : discipline._id}>
                          {disciplineName(discipline)}
                        </span>
                      ))}
                    </div>
                    <div className={styles.cardFooterLink}>Ver perfil <ChevronRight size={15} /></div>
                  </Link>
                ))
              : items.map((professor) => (
                  <Link className={`${styles.listRowLink} ${styles.professorListRow}`} href={`/admin/professors/${professor._id}`} key={professor._id}>
                    <ProfessorAvatar professor={professor} />
                    <div className={styles.rowBody}>
                      <strong>{professor.displayName}</strong>
                      <small>{professor.userId?.email || professor.phone || "Sin contacto"}</small>
                    </div>
                    <span className={styles.listDisciplines}>
                      {professor.disciplineIds?.length
                        ? professor.disciplineIds.slice(0, 3).map(disciplineName).join(" · ")
                        : "Sin disciplinas"}
                    </span>
                    <span className={professor.isActive ? styles.pill : styles.pillOff}>
                      {professor.isActive ? "Activo" : "Inactivo"}
                    </span>
                    <ChevronRight className={styles.listChevron} size={17} aria-hidden="true" />
                  </Link>
                ))}
          </div>
          <PaginationControls
            page={page}
            limit={limit}
            total={total}
            loading={loading}
            onPageChange={setPage}
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
            }}
          />
        </>
      )}

      <LiveModal
        open={modal}
        title="Agregar profesor"
        description="Se crea su perfil, acceso, sedes y disciplinas en un solo paso."
        submitting={submitting}
        onClose={closeModal}
        onSubmit={create}
        error={formError}
      >
        <Field label="Nombre"><input name="firstName" required /></Field>
        <Field label="Apellido"><input name="lastName" required /></Field>
        <Field label="Nombre visible"><input name="displayName" required /></Field>
        <Field label="Teléfono"><input name="phone" /></Field>
        <Field label="Email de acceso"><input name="email" type="email" required /></Field>
        <Field label="Contraseña inicial"><input name="password" type="password" minLength={10} required /></Field>
        <Field label="Sedes" wide>
          <select name="branchIds" multiple size={Math.min(4, Math.max(2, branches.length))} required>
            {branches.map((branch) => <option value={branch._id} key={branch._id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label="Disciplinas" wide>
          <select name="disciplineIds" multiple size={Math.min(6, Math.max(3, catalogs.length))}>
            {catalogs.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Instagram"><input name="instagram" placeholder="@nombre.de.usuario" /></Field>
        <Field label="Descripción corta para la web" wide>
          <input
            name="bioShort"
            value={bioShortDraft}
            maxLength={160}
            placeholder="Ej.: Docente de salsa y bachata, con foco en técnica y disfrute."
            onChange={(event) => setBioShortDraft(event.target.value)}
          />
          <span className={styles.webCounter}>{bioShortDraft.length}/160</span>
        </Field>
        <Field label="Bio" wide><textarea name="bio" rows={4} /></Field>
      </LiveModal>
    </>
  );
}
