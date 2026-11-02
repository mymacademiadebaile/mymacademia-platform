"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, apiMessage } from "@/lib/api";
import { todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal, LoadingBlock } from "../live/live-common";
import type { DanceClass } from "../live/live-types";
import { formatMoney } from "../scheduling/scheduling-types";
import styles from "./promotions-tab.module.css";

type Kind = "PERCENT" | "AMOUNT_OFF" | "FINAL_PRICE" | "TWO_FOR_ONE";
type ChargeKind = "MONTHLY_FEE" | "CLASS_FEE";
type PromotionScope = ChargeKind | "BOTH";
type Promotion = {
  _id: string;
  classId: string;
  name: string;
  kind: Kind;
  appliesTo: PromotionScope;
  percentBasisPoints?: number;
  valueCents?: number;
  registrationFrom?: string;
  registrationTo?: string;
  benefitFrom: string;
  benefitTo: string;
  session?: { sessionDate: string; startTime: string; endTime: string } | null;
  status: "ACTIVE" | "INACTIVE";
  pairs: Array<{ _id: string; payerStudentId: string; beneficiaryStudentId: string; payerName: string; beneficiaryName: string; voidedAt?: string }>;
};
type StudentOption = { _id: string; firstName: string; lastName: string };

const KIND_LABEL: Record<Kind, string> = {
  PERCENT: "Porcentaje", AMOUNT_OFF: "Descuento fijo", FINAL_PRICE: "Precio final", TWO_FOR_ONE: "2x1"
};

function datesForPreset(from: string, preset: "day" | "week" | "month") {
  if (preset === "day") return { from, to: from };
  if (preset === "month") {
    const month = from.slice(0, 7);
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
  }
  const end = new Date(`${from}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from, to: end.toISOString().slice(0, 10) };
}

export function PromotionsTab({ danceClass }: { danceClass: DanceClass }) {
  const { toast } = useAdminFeedback();
  const [items, setItems] = useState<Promotion[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<Kind>("TWO_FOR_ONE");
  const classId = danceClass._id;
  const appliesTo: PromotionScope = danceClass.billingMode === "BOTH" ? "BOTH" : danceClass.billingMode === "PER_CLASS" ? "CLASS_FEE" : "MONTHLY_FEE";
  const [registration, setRegistration] = useState({ from: todayInArgentina(), to: todayInArgentina() });
  const [benefit, setBenefit] = useState(datesForPreset(todayInArgentina(), "month"));
  const [singleSession, setSingleSession] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessionOptions, setSessionOptions] = useState<Array<{ id: string; startTime: string; endTime: string }>>([]);
  const [enrolling, setEnrolling] = useState<Promotion | null>(null);
  const [pairBillingPreference, setPairBillingPreference] = useState<"MONTHLY" | "PER_CLASS">("MONTHLY");
  const [eligible, setEligible] = useState<StudentOption[]>([]);
  const [payerId, setPayerId] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [startDate, setStartDate] = useState(todayInArgentina());
  const [monthlyPlan, setMonthlyPlan] = useState<4 | 8>(4);
  const [joinPolicy, setJoinPolicy] = useState<"FULL" | "PRORATED" | "CUSTOM">("FULL");
  const [joinCustomAmount, setJoinCustomAmount] = useState("");
  const [pairPreview, setPairPreview] = useState<{ kind: ChargeKind; period: string; payer: number; beneficiary: number; discount?: number } | null>(null);
  const [pairPreviewError, setPairPreviewError] = useState("");
  const [voiding, setVoiding] = useState<{ promotionId: string; pairId: string } | null>(null);
  const plans = useMemo(() => ([4, 8] as const).filter((plan) => ((plan === 4 ? danceClass.monthlyPrice4 : danceClass.monthlyPrice8) ?? 0) > 0), [danceClass.monthlyPrice4, danceClass.monthlyPrice8]);

  const load = useCallback(async () => {
    try {
      const promotions = await apiFetch<{ items: Promotion[] }>(`/admin/promotions?classId=${classId}`);
      setItems(promotions.items);
      setError("");
    } catch (requestError) { setError(apiMessage(requestError)); }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!creating || !singleSession || !classId || !benefit.from) return;
    let active = true;
    void apiFetch<{ items: Array<{ id: string; startTime: string; endTime: string; status: string; class: { id: string } }> }>(`/admin/sessions?date=${benefit.from}`)
      .then((data) => {
        if (!active) return;
        const options = data.items.filter((item) => item.class.id === classId && ["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(item.status));
        setSessionOptions(options);
        setSessionId(options.length === 1 ? options[0].id : "");
      })
      .catch(() => { if (active) { setSessionOptions([]); setSessionId(""); } });
    return () => { active = false; };
  }, [creating, singleSession, classId, benefit.from]);
  useEffect(() => {
    setPairPreview(null);
    setPairPreviewError("");
    if (!enrolling || !payerId || !beneficiaryId || payerId === beneficiaryId) return;
    if (joinPolicy === "CUSTOM" && startDate.slice(8) !== "01" && joinCustomAmount === "") return;
    let active = true;
    const timer = setTimeout(() => {
      void apiFetch<{ kind: ChargeKind; period: string; payer: number; beneficiary: number; discount?: number }>(`/admin/promotions/${enrolling._id}/pair-preview`, {
        method: "POST", body: JSON.stringify({
          payerStudentId: payerId, beneficiaryStudentId: beneficiaryId, startDate,
          billingPreference: pairBillingPreference,
          monthlyPlan: pairBillingPreference === "MONTHLY" && plans.length ? monthlyPlan : undefined,
          joinPolicy: pairBillingPreference === "MONTHLY" && startDate.slice(8) !== "01" ? joinPolicy : undefined,
          joinCustomAmount: pairBillingPreference === "MONTHLY" && startDate.slice(8) !== "01" && joinPolicy === "CUSTOM" && joinCustomAmount !== "" ? Number(joinCustomAmount) : undefined
        })
      }).then((result) => { if (active) setPairPreview(result); })
        .catch((error) => { if (active) setPairPreviewError(apiMessage(error)); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [enrolling, payerId, beneficiaryId, startDate, monthlyPlan, pairBillingPreference, joinPolicy, joinCustomAmount, plans.length]);

  function openCreate() {
    setKind("TWO_FOR_ONE");
    setSingleSession(false);
    setSessionId("");
    setCreating(true);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await apiFetch<{ appliedExisting: number }>("/admin/promotions", { method: "POST", body: JSON.stringify({
        classId, name: form.get("name"), kind, appliesTo,
        benefitFrom: benefit.from, benefitTo: benefit.to,
        sessionId: singleSession ? sessionId : undefined,
        registrationFrom: kind === "TWO_FOR_ONE" ? registration.from : undefined,
        registrationTo: kind === "TWO_FOR_ONE" ? registration.to : undefined,
        percent: kind === "PERCENT" ? Number(form.get("percent")) : undefined,
        value: kind === "AMOUNT_OFF" || kind === "FINAL_PRICE" ? Number(form.get("value")) : undefined
      }) });
      setCreating(false);
      toast({ title: "Promoción creada", description: result.appliedExisting ? `Se aplicó a ${result.appliedExisting} cargo${result.appliedExisting === 1 ? "" : "s"} existente${result.appliedExisting === 1 ? "" : "s"}.` : "Se aplicará al generar los cargos de su vigencia.", tone: "success" });
      await load();
    } catch (requestError) { toast({ title: "No se pudo crear la promoción", description: apiMessage(requestError), tone: "error" }); }
    finally { setBusy(false); }
  }

  async function openPair(item: Promotion) {
    setEnrolling(item);
    setStartDate(todayInArgentina() >= (item.registrationFrom ?? "") && todayInArgentina() <= (item.registrationTo ?? "")
      ? todayInArgentina() : item.registrationFrom ?? todayInArgentina());
    setPayerId(""); setBeneficiaryId(""); setEligible([]);
    setPairPreview(null); setJoinCustomAmount("");
    setPairBillingPreference(item.appliesTo === "CLASS_FEE" ? "PER_CLASS" : "MONTHLY");
    setMonthlyPlan(danceClass?.monthlyPrice4 ? 4 : 8);
    try {
      const data = await apiFetch<{ items: StudentOption[] }>(`/admin/promotions/${item._id}/eligible-students`);
      setEligible(data.items);
    } catch (requestError) { toast({ title: "No se pudieron cargar los alumnos", description: apiMessage(requestError), tone: "error" }); }
  }

  async function enrollPair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/promotions/${enrolling._id}/enroll-pair`, { method: "POST", body: JSON.stringify({
        payerStudentId: payerId, beneficiaryStudentId: beneficiaryId, startDate,
        billingPreference: pairBillingPreference,
        monthlyPlan: pairBillingPreference === "MONTHLY" && plans.length ? monthlyPlan : undefined,
        joinPolicy: pairBillingPreference === "MONTHLY" && startDate.slice(8) !== "01" ? joinPolicy : undefined,
        joinCustomAmount: pairBillingPreference === "MONTHLY" && startDate.slice(8) !== "01" && joinPolicy === "CUSTOM" ? Number(joinCustomAmount) : undefined
      }) });
      setEnrolling(null);
      toast({ title: "Pareja inscripta con 2x1", tone: "success" });
      await load();
    } catch (requestError) { toast({ title: "No se pudo inscribir la pareja", description: apiMessage(requestError), tone: "error" }); }
    finally { setBusy(false); }
  }

  async function deactivate(item: Promotion) {
    setBusy(true);
    try {
      await apiFetch(`/admin/promotions/${item._id}/deactivate`, { method: "POST" });
      toast({ title: "Promoción cerrada para nuevas altas", tone: "success" });
      await load();
    } catch (requestError) { toast({ title: "No se pudo cerrar", description: apiMessage(requestError), tone: "error" }); }
    finally { setBusy(false); }
  }

  async function voidPair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!voiding) return;
    const reason = new FormData(event.currentTarget).get("reason");
    setBusy(true);
    try {
      await apiFetch(`/admin/promotions/${voiding.promotionId}/pairs/${voiding.pairId}/void`, {
        method: "POST", body: JSON.stringify({ reason })
      });
      setVoiding(null);
      toast({ title: "Pareja cerrada", description: "Los cargos ya emitidos conservan su historial; no se aplicarán nuevos beneficios.", tone: "success" });
      await load();
    } catch (requestError) { toast({ title: "No se pudo cerrar la pareja", description: apiMessage(requestError), tone: "error" }); }
    finally { setBusy(false); }
  }

  return <div className={styles.page}>
    <div className={styles.intro}>
      <div><h2>Promociones de {danceClass.name}</h2><p>La promoción pertenece a este grupo y cubre todos sus horarios durante las fechas elegidas. Los cobros reflejan el beneficio automáticamente.</p></div>
      {danceClass.billingMode !== "FREE" && ["ACTIVE", "PAUSED"].includes(danceClass.status) && <button type="button" onClick={openCreate}>Crear promoción</button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!items && !error && <LoadingBlock />}
    <div className={styles.list}>
      {items?.map((item) => <article key={item._id} className={styles.card}>
        <div className={styles.cardTop}>
          <div><small>{KIND_LABEL[item.kind]} · {item.appliesTo === "BOTH" ? "Todo el grupo" : item.appliesTo === "MONTHLY_FEE" ? "Mensualidad" : "Por clase"}</small>
            <h3>{item.name}</h3><p>{danceClass.name}</p></div>
          <span className={item.status === "ACTIVE" ? styles.active : styles.inactive}>{item.status === "ACTIVE" ? "Activa" : "Cerrada"}</span>
        </div>
        <p>Beneficio: {item.session ? `clase del ${item.session.sessionDate}, ${item.session.startTime}–${item.session.endTime}` : `${item.benefitFrom} al ${item.benefitTo}`}</p>
        {item.kind === "TWO_FOR_ONE" ? <p>Inscripciones: {item.registrationFrom} al {item.registrationTo} · {item.pairs.filter((pair) => !pair.voidedAt).length} pareja{item.pairs.filter((pair) => !pair.voidedAt).length === 1 ? "" : "s"}</p>
          : <p>{item.kind === "PERCENT" ? `${(item.percentBasisPoints ?? 0) / 100} % de descuento` : item.kind === "AMOUNT_OFF" ? `${formatMoney((item.valueCents ?? 0) / 100)} menos` : `Precio final ${formatMoney((item.valueCents ?? 0) / 100)}`}</p>}
        {item.pairs.length > 0 && <div className={styles.pairs}>
          {item.pairs.map((pair) => <div key={pair._id} className={styles.pair}>
            <span>{pair.payerName} paga · {pair.beneficiaryName} bonificado{pair.voidedAt ? " · cerrada" : ""}</span>
            {!pair.voidedAt && <button type="button" disabled={busy} onClick={() => setVoiding({ promotionId: item._id, pairId: pair._id })}>Corregir pareja</button>}
          </div>)}
        </div>}
        <div className={styles.actions}>
          {item.kind === "TWO_FOR_ONE" && item.status === "ACTIVE" && todayInArgentina() >= (item.registrationFrom ?? "") && todayInArgentina() <= (item.registrationTo ?? "") && <button disabled={busy} onClick={() => void openPair(item)}>Inscribir pareja</button>}
          {item.status === "ACTIVE" && <button className={styles.secondary} disabled={busy} onClick={() => void deactivate(item)}>Cerrar campaña</button>}
        </div>
      </article>)}
      {items?.length === 0 && <p className={styles.empty}>Todavía no hay promociones para este grupo.</p>}
    </div>

    <LiveModal open={creating} title={`Promoción para ${danceClass.name}`} description="Elegí el beneficio y su vigencia. Se aplicará a los horarios del grupo; para un 2x1, después inscribí a la pareja." submitting={busy} submitDisabled={singleSession && !sessionId} submitLabel="Crear promoción" onClose={() => setCreating(false)} onSubmit={create}>
      <Field label="Nombre" wide><input name="name" required minLength={3} maxLength={120} placeholder="Ej.: 2x1 Bachata de diciembre" /></Field>
      <Field label="Beneficio"><select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
        {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Field>
      <p className={styles.note}>Alcance: {danceClass.name} · {singleSession ? "solo el encuentro elegido" : "todos sus horarios durante la vigencia"}{danceClass.billingMode === "BOTH" ? " · mensualidad y clases sueltas" : ""}.</p>
      {danceClass.billingMode === "BOTH" && (kind === "AMOUNT_OFF" || kind === "FINAL_PRICE") && <p className={styles.note}>El importe indicado se aplica a cada cargo según la modalidad del alumno: cuota mensual o clase suelta.</p>}
      {kind === "PERCENT" && <Field label="Descuento (%)"><input name="percent" type="number" min="0.01" max="100" step="0.01" required /></Field>}
      {(kind === "AMOUNT_OFF" || kind === "FINAL_PRICE") && <Field label={kind === "FINAL_PRICE" ? "Precio final ($)" : "Descuento ($)"}><input name="value" type="number" min={kind === "FINAL_PRICE" ? "0" : "0.01"} step="0.01" required /></Field>}
      {kind === "TWO_FOR_ONE" && <>
        <Field label="Se pueden inscribir desde"><input type="date" value={registration.from} onChange={(event) => setRegistration({ ...registration, from: event.target.value })} required /></Field>
        <Field label="Se pueden inscribir hasta"><input type="date" min={registration.from} value={registration.to} onChange={(event) => setRegistration({ ...registration, to: event.target.value })} required /></Field>
      </>}
      <div className={styles.presets}>Duración del beneficio: {(["day", "week", "month"] as const).map((preset) => <button type="button" key={preset} onClick={() => { setBenefit(datesForPreset(benefit.from, preset)); setSingleSession(preset === "day"); }}>{preset === "day" ? "Un encuentro puntual" : preset === "week" ? "Una semana del grupo" : "Un mes del grupo"}</button>)}</div>
      <Field label="Beneficio desde"><input type="date" value={benefit.from} onChange={(event) => setBenefit({ ...benefit, from: event.target.value })} required /></Field>
      <Field label="Beneficio hasta"><input type="date" min={benefit.from} value={benefit.to} onChange={(event) => setBenefit({ ...benefit, to: event.target.value })} required /></Field>
      {singleSession && <Field label="Encuentro del día" wide><select value={sessionId} onChange={(event) => setSessionId(event.target.value)} required>
        <option value="">{sessionOptions.length ? "Elegí el horario" : "No hay clase programada ese día"}</option>
        {sessionOptions.map((item) => <option key={item.id} value={item.id}>{item.startTime}–{item.endTime}</option>)}
      </select></Field>}
    </LiveModal>

    <LiveModal open={Boolean(enrolling)} title="Inscribir pareja 2x1" description={enrolling ? `${enrolling.name}. Elegí dos alumnos sin inscripción activa en ${danceClass.name}; el descuento quedará asignado antes de crear sus cuotas.` : ""} submitting={busy} submitDisabled={!payerId || !beneficiaryId || payerId === beneficiaryId || !pairPreview} submitLabel="Inscribir a los dos" onClose={() => setEnrolling(null)} onSubmit={enrollPair}>
      <Field label="Quién paga"><select value={payerId} onChange={(event) => setPayerId(event.target.value)} required><option value="">Elegir alumno</option>{eligible.map((item) => <option key={item._id} value={item._id}>{item.lastName}, {item.firstName}</option>)}</select></Field>
      <Field label="Quién recibe el beneficio"><select value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} required><option value="">Elegir alumno</option>{eligible.filter((item) => item._id !== payerId).map((item) => <option key={item._id} value={item._id}>{item.lastName}, {item.firstName}</option>)}</select></Field>
      <p className={styles.note}>Aparecen alumnos sin inscripción activa en este grupo, incluso si ya asistieron antes. El 2x1 se asigna al inscribirlos ahora.</p>
      {eligible.length < 2 && <p className={styles.note}>Si faltan personas en el sistema, cargalas primero en <Link href="/admin/students">Alumnos</Link>.</p>}
      <Field label="Fecha de inscripción"><input type="date" min={enrolling?.registrationFrom} max={enrolling?.registrationTo} value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field>
      {enrolling?.appliesTo === "BOTH" && <Field label="Modalidad de ambos"><select value={pairBillingPreference} onChange={(event) => setPairBillingPreference(event.target.value as "MONTHLY" | "PER_CLASS")}><option value="MONTHLY">Mensualidad</option><option value="PER_CLASS">Por clase</option></select></Field>}
      {pairBillingPreference === "MONTHLY" && plans.length > 0 && <Field label="Plan mensual"><select value={monthlyPlan} onChange={(event) => setMonthlyPlan(Number(event.target.value) as 4 | 8)}>{plans.map((plan) => <option key={plan} value={plan}>{plan} clases · {formatMoney(plan === 4 ? danceClass.monthlyPrice4 ?? 0 : danceClass.monthlyPrice8 ?? 0)}</option>)}</select></Field>}
      {pairBillingPreference === "MONTHLY" && startDate.slice(8) !== "01" && <><Field label="Primer mes"><select value={joinPolicy} onChange={(event) => setJoinPolicy(event.target.value as typeof joinPolicy)}><option value="FULL">Cuota completa</option><option value="PRORATED">Proporcional</option><option value="CUSTOM">Importe personalizado</option></select></Field>{joinPolicy === "CUSTOM" && <Field label="Importe del primer mes ($)"><input value={joinCustomAmount} onChange={(event) => setJoinCustomAmount(event.target.value)} type="number" min="0" step="0.01" required /></Field>}</>}
      {pairPreview && <div className={styles.preview}><strong>Vista previa · {pairPreview.kind === "MONTHLY_FEE" ? `primera cuota (${pairPreview.period})` : "por clase comprendida"}</strong><span>Quien paga: {formatMoney(pairPreview.payer)} · Beneficiario: {formatMoney(pairPreview.beneficiary)}</span>{pairPreview.discount ? <small>Bonificación: {formatMoney(pairPreview.discount)}</small> : null}</div>}
      {pairPreviewError && <p className={styles.error} role="alert">{pairPreviewError}</p>}
      {enrolling && startDate.slice(0, 7) < enrolling.benefitFrom.slice(0, 7) && <p className={styles.note}>La primera cuota anterior al beneficio conserva su precio habitual.</p>}
      <p className={styles.note}>El 2x1 estará vigente del {enrolling?.benefitFrom} al {enrolling?.benefitTo}, aunque luego uno se dé de baja.</p>
    </LiveModal>
    <LiveModal open={Boolean(voiding)} title="Corregir pareja" description="Esta acción corta beneficios futuros por una corrección administrativa. Las bajas de alumnos no hacen esto automáticamente y los cargos emitidos conservan su historial." submitting={busy} submitLabel="Cerrar pareja" onClose={() => setVoiding(null)} onSubmit={voidPair}>
      <Field label="Motivo" wide><input name="reason" required minLength={3} maxLength={500} /></Field>
    </LiveModal>
  </div>;
}
