"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Mail, MessageCircle, Send } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { DanceClass, Paginated, Student } from "./live-types";
import { ErrorBlock } from "./live-common";
import styles from "./live.module.css";

type EmailAudience = "ALL" | "DEBT" | "CLASS";

export function CommunicationsLive() {
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [audience, setAudience] = useState<EmailAudience>("ALL");
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [classList, studentList] = await Promise.all([
        apiFetch<DanceClass[]>("/admin/classes"),
        apiFetch<Paginated<Student>>("/admin/students?limit=100")
      ]);
      setClasses(classList);
      setStudents(studentList.items.filter((item) => item.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError("");
    setNotice("");

    try {
      const result = await apiFetch<{ recipients: number; sent: number; failed: number }>("/admin/communications/email", {
        method: "POST",
        body: JSON.stringify({
          audience,
          classId: audience === "CLASS" ? form.get("classId") : undefined,
          subject: form.get("subject"),
          message: form.get("message")
        })
      });

      setNotice(`Envío terminado: ${result.sent} enviados, ${result.failed} fallidos.`);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSending(false);
    }
  }

  function openWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = String(form.get("studentId") ?? "");
    const student = students.find((item) => item._id === studentId);
    const message = String(form.get("message") ?? "");

    if (!student?.phone) {
      setError("El alumno seleccionado no tiene teléfono cargado.");
      return;
    }

    const phone = student.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <PageHeader
        eyebrow="COMUNICACIÓN"
        title="Mensajes y recordatorios"
        description="Email real con Gmail/Nodemailer y WhatsApp mediante mensaje precargado."
      />

      {error && <ErrorBlock message={error} onRetry={() => setError("")} />}
      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.liveGrid3} style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button
          className={styles.card}
          style={{ cursor: "pointer", textAlign: "left", borderColor: channel === "EMAIL" ? "#a78bfa" : undefined }}
          onClick={() => setChannel("EMAIL")}
        >
          <Mail size={22} color="#5b21b6" />
          <strong style={{ display: "block", marginTop: 10 }}>Email</strong>
          <span className={styles.cardDetail}>Envío desde Gmail con registro de resultado.</span>
        </button>
        <button
          className={styles.card}
          style={{ cursor: "pointer", textAlign: "left", borderColor: channel === "WHATSAPP" ? "#a78bfa" : undefined }}
          onClick={() => setChannel("WHATSAPP")}
        >
          <MessageCircle size={22} color="#5b21b6" />
          <strong style={{ display: "block", marginTop: 10 }}>WhatsApp</strong>
          <span className={styles.cardDetail}>Abre la conversación con texto precargado.</span>
        </button>
      </div>

      {channel === "EMAIL" ? (
        <form className={styles.card} onSubmit={sendEmail}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Destinatarios</span>
              <select value={audience} onChange={(event) => setAudience(event.target.value as EmailAudience)}>
                <option value="ALL">Todos los alumnos con email</option>
                <option value="DEBT">Alumnos con deuda pendiente</option>
                <option value="CLASS">Alumnos de una clase</option>
              </select>
            </label>

            {audience === "CLASS" && (
              <label className={styles.field}>
                <span>Clase</span>
                <select name="classId" required defaultValue="">
                  <option value="" disabled>Seleccionar clase</option>
                  {classes.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
                </select>
              </label>
            )}

            <label className={styles.fieldWide}>
              <span>Asunto</span>
              <input name="subject" required placeholder="Ej. Recordatorio de clase" />
            </label>
            <label className={styles.fieldWide}>
              <span>Mensaje</span>
              <textarea name="message" rows={7} required placeholder="Podés usar {{nombre}} para personalizar el saludo." />
            </label>
          </div>
          <div style={{ marginTop: 15 }}>
            <button className={styles.primary} disabled={sending}>
              <Send size={16} />
              {sending ? "Enviando..." : "Enviar email"}
            </button>
          </div>
        </form>
      ) : (
        <form className={styles.card} onSubmit={openWhatsApp}>
          <div className={styles.formGrid}>
            <label className={styles.fieldWide}>
              <span>Alumno</span>
              <select name="studentId" required defaultValue="">
                <option value="" disabled>Seleccionar alumno</option>
                {students.map((item) => (
                  <option value={item._id} key={item._id}>
                    {item.firstName} {item.lastName}{item.phone ? "" : " · sin teléfono"}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fieldWide}>
              <span>Mensaje</span>
              <textarea name="message" rows={7} required placeholder="Escribí el mensaje..." />
            </label>
          </div>
          <div style={{ marginTop: 15 }}>
            <button className={styles.primary}>
              <MessageCircle size={16} />
              Abrir WhatsApp
            </button>
          </div>
        </form>
      )}
    </>
  );
}
