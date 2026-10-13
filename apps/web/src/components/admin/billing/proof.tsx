"use client";

import { apiFetch, apiMessage } from "@/lib/api";
import { Field } from "../live/live-common";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/** Optional transfer proof (photo or PDF) inside any "register collection" form. */
export function ProofField() {
  return (
    <Field label="Comprobante de transferencia (opcional)" wide>
      <input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
    </Field>
  );
}

/** The proof chosen in a form, if any. */
export function proofFileOf(form: FormData): File | null {
  const value = form.get("proof");
  return value instanceof File && value.size > 0 ? value : null;
}

export async function uploadProof(collectionId: string, file: File) {
  if (file.size > MAX_PROOF_BYTES) throw new Error("El comprobante pesa más de 5 MB.");
  const body = new FormData();
  body.append("file", file);
  await apiFetch(`/admin/billing/collections/${collectionId}/proof`, { method: "POST", body });
}

/**
 * Uploads the proof right after the collection was registered. A failed upload never undoes the
 * collection: it returns the reason so the screen can say "collected, but attach the proof later".
 */
export async function tryUploadProof(collectionId: string | undefined, file: File | null): Promise<string | null> {
  if (!file || !collectionId) return null;
  try {
    await uploadProof(collectionId, file);
    return null;
  } catch (error) {
    return apiMessage(error);
  }
}

/** Toast for a registered collection, warning when the proof could not be attached. */
export function collectedToast(proofError: string | null, description?: string) {
  return proofError
    ? { title: "Cobro registrado sin comprobante", description: `${proofError} Adjuntalo desde Pagos › Historial.`, tone: "warning" as const }
    : { title: "Cobro registrado", description, tone: "success" as const };
}

/** Opens the private proof in a new tab (the link lasts a few minutes). */
export async function openProof(collectionId: string) {
  // Opened first so the browser does not treat it as a popup after the request.
  const tab = window.open("", "_blank");
  try {
    const { url } = await apiFetch<{ url: string }>(`/admin/billing/collections/${collectionId}/proof`);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
