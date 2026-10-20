"use client";

import type { MidMonthPolicy } from "@mym/shared";
import { FormEvent, useState } from "react";
import { Field, LiveModal } from "../live/live-common";
import { formatMoney } from "../scheduling/scheduling-types";

export type FirstMonthTarget = {
  enrollmentId: string;
  studentName: string;
  className: string;
  /** YYYY-MM of the month that already started. */
  period: string;
  /** Present when the plan (4 or 8 classes) must be chosen too. */
  plans?: { options: Array<{ plan: 4 | 8; price: number }>; current: 4 | 8 };
};

export type FirstMonthChoice = { policy: MidMonthPolicy; customAmount?: number; plan?: 4 | 8 };

const POLICY_LABEL: Record<MidMonthPolicy, string> = {
  FULL: "Cuota completa del mes",
  PRORATED: "Proporcional a las clases que quedan",
  CUSTOM: "Importe personalizado"
};

/**
 * Asks how to bill a monthly student whose month already started (switch to monthly, or a late
 * enrollment that was left undecided). The same three options as when enrolling.
 */
export function FirstMonthModal({
  target,
  busy,
  title = "Cobro del primer mes",
  askPolicy = true,
  submitLabel = "Crear cuota",
  onClose,
  onSubmit
}: {
  target: FirstMonthTarget | null;
  busy: boolean;
  title?: string;
  /** False when the month starts today: nothing to prorate, only the plan is asked. */
  askPolicy?: boolean;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (choice: FirstMonthChoice) => void;
}) {
  const [policy, setPolicy] = useState<MidMonthPolicy>("PRORATED");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      policy,
      customAmount: askPolicy && policy === "CUSTOM" ? Number(form.get("customAmount")) : undefined,
      plan: target?.plans ? (Number(form.get("plan")) as 4 | 8) : undefined
    });
  }

  return (
    <LiveModal
      open={Boolean(target)}
      title={title}
      description={target ? (askPolicy ? `${target.studentName} paga mensual en ${target.className} y el mes ya empezó. Definí cuánto se cobra ahora.` : `${target.studentName} pasa a pagar mensual en ${target.className}.`) : ""}
      submitting={busy}
      submitLabel={submitLabel}
      onClose={onClose}
      onSubmit={submit}
    >
      {target?.plans && (
        <Field label="Plan mensual" wide>
          <select name="plan" defaultValue={target.plans.current}>
            {target.plans.options.map(({ plan, price }) => (
              <option key={plan} value={plan}>{plan} clases · {formatMoney(price)}</option>
            ))}
          </select>
        </Field>
      )}
      {askPolicy && (
      <Field label="Cómo cobrar el primer mes" wide>
        <select value={policy} onChange={(event) => setPolicy(event.target.value as MidMonthPolicy)}>
          {(Object.keys(POLICY_LABEL) as MidMonthPolicy[]).map((item) => (
            <option key={item} value={item}>{POLICY_LABEL[item]}</option>
          ))}
        </select>
      </Field>
      )}
      {askPolicy && policy === "CUSTOM" && (
        <Field label="Importe a cobrar ($)" wide>
          <input name="customAmount" type="number" min="0" step="0.01" required />
        </Field>
      )}
    </LiveModal>
  );
}
