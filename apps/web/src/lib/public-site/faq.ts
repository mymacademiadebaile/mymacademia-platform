import type { FaqItem } from "./types";

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

/**
 * General FAQ shown on the home and on /contacto. The style list is real (it comes
 * from the published rhythms); answers flagged `isPlaceholder` are not confirmed by
 * the academy yet, so they are visible but left out of the FAQPage JSON-LD.
 */
export function buildFaq(styleNames: string[]): FaqItem[] {
  return [
    {
      question: "¿Dónde queda M&M Academia de Baile?",
      answer: "En Calle 3 N.º 164, entre 35 y 36, en La Plata, provincia de Buenos Aires."
    },
    ...(styleNames.length
      ? [
          {
            question: "¿Qué estilos de baile se pueden aprender?",
            answer: `${joinNames(styleNames)}. La academia va a ir sumando nuevos estilos.`
          }
        ]
      : []),
    {
      question: "¿Necesito experiencia previa?",
      answer: "Hay clases de nivel inicial para empezar desde cero. Si ya bailás, consultanos y te recomendamos el nivel.",
      isPlaceholder: true
    },
    {
      question: "¿Cómo consulto los horarios?",
      answer:
        "En el horario semanal de esta página. Para confirmar un día y un horario, escribinos por WhatsApp al +54 9 221 596-8108."
    },
    {
      question: "¿Cómo me inscribo?",
      answer: "Escribinos por WhatsApp al +54 9 221 596-8108 contándonos qué estilo te interesa y te explicamos cómo sumarte."
    },
    {
      question: "¿Puedo probar una clase antes de anotarme?",
      answer: "Consultanos por WhatsApp las opciones para tu primera clase.",
      isPlaceholder: true
    }
  ];
}

/** Meta description for pages that talk about every rhythm of the academy. */
export function describeAcademy(styleNames: string[], focus = "Clases"): string {
  const what = styleNames.length ? `${focus} de ${joinNames(styleNames)}` : `${focus} de baile`;
  return `Academia de baile en La Plata. ${what} en Calle 3 N.º 164, entre 35 y 36. Consultá horarios y empezá por WhatsApp.`;
}
