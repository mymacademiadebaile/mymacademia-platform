/**
 * TEMPORARY CONTENT — replace with real data before launch.
 *
 * - Style NAMES are real (confirmed by the academy). Taglines, descriptions and levels are drafts.
 * - Professors are FICTIONAL placeholders (isPlaceholder: true): not indexed, no Person JSON-LD.
 * - The weekly schedule is FICTIONAL (isPlaceholder: true): no Event JSON-LD.
 * - Photos are free Unsplash stock (public/landing/mock). See docs/public-landing.md.
 *
 * Consumers must go through `queries.ts`; never import this file from components.
 */
import type {
  Branch,
  DanceStyle,
  FaqItem,
  PublicClass,
  PublicImage,
  PublicProfessor,
  PublicSchedule
} from "./types";

const MOCK_DIR = "/landing/mock";

export const mockImages = {
  hero: {
    src: `${MOCK_DIR}/hero-couple-smoke.jpg`,
    alt: "Pareja bailando bajo un haz de luz en un salón oscuro con humo",
    width: 1600,
    height: 2399,
    focus: "50% 45%",
    isPlaceholder: true,
    credit: "Graham Mansfield / Unsplash"
  },
  manifesto: {
    src: `${MOCK_DIR}/manifesto-motion-blur.jpg`,
    alt: "Bailarín en movimiento, con la figura desdibujada por la velocidad",
    width: 2400,
    height: 1600,
    focus: "55% 55%",
    isPlaceholder: true,
    credit: "Ahmad Odeh / Unsplash"
  },
  spaceBarre: {
    src: `${MOCK_DIR}/space-studio-barre.jpg`,
    alt: "Salón de baile con barra de madera y ventanales",
    width: 1400,
    height: 2100,
    focus: "40% 50%",
    isPlaceholder: true,
    credit: "Andrey K / Unsplash"
  },
  spaceClass: {
    src: `${MOCK_DIR}/space-class-mirror.jpg`,
    alt: "Grupo de alumnas practicando una coreografía frente al espejo",
    width: 1600,
    height: 1067,
    focus: "50% 50%",
    isPlaceholder: true,
    credit: "Danielle Cerullo / Unsplash"
  },
  spaceGroup: {
    src: `${MOCK_DIR}/space-group-overhead.jpg`,
    alt: "Vista cenital de muchas parejas bailando en una pista",
    width: 1800,
    height: 1200,
    focus: "50% 50%",
    isPlaceholder: true,
    credit: "Ardian Lumi / Unsplash"
  },
  spaceSocial: {
    src: `${MOCK_DIR}/space-social-floor.jpg`,
    alt: "Parejas bailando en una noche social",
    width: 1400,
    height: 934,
    focus: "50% 40%",
    isPlaceholder: true,
    credit: "Preillumination SeTh / Unsplash"
  },
  finalCta: {
    src: `${MOCK_DIR}/cta-purple-light.jpg`,
    alt: "Silueta de una persona bajo luces violetas de escenario",
    width: 2000,
    height: 3000,
    focus: "50% 40%",
    isPlaceholder: true,
    credit: "Unsplash"
  }
} satisfies Record<string, PublicImage>;

export const mockBranch: Branch = {
  id: "sede-calle-3",
  name: "M&M Academia de Baile",
  streetAddress: "Calle 3 N.º 164",
  betweenStreets: "entre 35 y 36",
  locality: "La Plata",
  region: "Buenos Aires",
  country: "Argentina",
  countryCode: "AR",
  // "entre 35 y 36" confuses Google geocoding; the bare address lands on the right block.
  // Verify the pin on site and switch to a Place ID when the business profile exists.
  mapsQuery: "Calle 3 164, La Plata, Buenos Aires, Argentina"
};

export const mockDanceStyles: DanceStyle[] = [
  {
    id: "style-bachata-sensual",
    slug: "bachata-sensual",
    seoSlug: "bachata-sensual-la-plata",
    name: "Bachata Sensual",
    tagline: "Conexión, musicalidad y movimiento en pareja.",
    description: [
      "La Bachata Sensual es un estilo de bachata en pareja que trabaja la conexión con el otro, las ondas corporales y la interpretación de la música.",
      "En las clases se practica la marca y el seguimiento, la postura y la musicalidad, para que puedas bailar con cualquier pareja en una pista."
    ],
    image: {
      src: `${MOCK_DIR}/style-bachata-sensual.jpg`,
      alt: "Pareja bailando bachata muy cerca, en un salón con luz cálida",
      width: 1400,
      height: 2143,
      focus: "50% 35%",
      isPlaceholder: true,
      credit: "HamZa NOUASRIA / Unsplash"
    },
    levels: ["Inicial", "Intermedio"],
    professorSlugs: ["lucia-ferreyra", "tomas-acuna"],
    faq: [
      {
        question: "¿Necesito venir con pareja a Bachata Sensual?",
        answer: "Consultanos por WhatsApp: te contamos cómo se organizan las parejas en cada clase.",
        isPlaceholder: true
      }
    ],
    isPlaceholderCopy: true
  },
  {
    id: "style-bachata-zouk",
    slug: "bachata-zouk",
    seoSlug: "bachata-zouk-la-plata",
    name: "Bachata Zouk",
    tagline: "La bachata con la fluidez y los giros de cabeza del zouk.",
    description: [
      "La Bachata Zouk (también escrita Bachata Souk) combina la base de la bachata con recursos del zouk brasileño: movimientos de torso y cabeza, estiramientos y cambios de dinámica.",
      "Es un estilo de pareja que pide control, escucha y mucha comunicación entre quien marca y quien sigue."
    ],
    image: {
      src: `${MOCK_DIR}/style-bachata-zouk.jpg`,
      alt: "Bailarín sosteniendo a su pareja en una inclinación hacia atrás, con luz violeta",
      width: 1400,
      height: 2099,
      focus: "50% 45%",
      isPlaceholder: true,
      credit: "Nihal Demirci / Unsplash"
    },
    levels: ["Inicial", "Intermedio"],
    professorSlugs: ["tomas-acuna"],
    faq: [],
    isPlaceholderCopy: true
  },
  {
    id: "style-estilo-femenino",
    slug: "estilo-femenino",
    seoSlug: "estilo-femenino-la-plata",
    name: "Estilo Femenino",
    tagline: "Brazos, cadera, giros y presencia propia.",
    description: [
      "Estilo Femenino es una clase individual: no necesitás pareja. Se trabaja la técnica de brazos, cadera, giros y desplazamientos, y la manera de interpretar la música con el cuerpo.",
      "Lo que se entrena en esta clase se aplica después al baile en pareja y a la pista."
    ],
    image: {
      src: `${MOCK_DIR}/style-estilo-femenino.jpg`,
      alt: "Bailarina a contraluz con un brazo en alto en un salón oscuro",
      width: 1400,
      height: 2100,
      focus: "50% 30%",
      isPlaceholder: true,
      credit: "Unsplash"
    },
    levels: ["Inicial", "Intermedio"],
    professorSlugs: ["lucia-ferreyra", "carla-benitez"],
    faq: [],
    isPlaceholderCopy: true
  }
];

export const mockProfessors: PublicProfessor[] = [
  {
    id: "prof-1",
    slug: "lucia-ferreyra",
    displayName: "Lucía Ferreyra",
    firstName: "Lucía",
    lastName: "Ferreyra",
    disciplines: ["estilo-femenino", "bachata-sensual"],
    bio: "Perfil de ejemplo. Acá va una bio corta, escrita por la profesora, sobre su recorrido y su forma de dar clase.",
    quote: "Técnica para soltarte, no para quedarte quieta.",
    avatar: {
      src: `${MOCK_DIR}/professor-01.jpg`,
      alt: "Retrato de la profesora (foto temporal)",
      width: 1400,
      height: 2243,
      focus: "50% 25%",
      isPlaceholder: true,
      credit: "Marcin Sajur / Unsplash"
    },
    isPlaceholder: true
  },
  {
    id: "prof-2",
    slug: "tomas-acuna",
    displayName: "Tomás Acuña",
    firstName: "Tomás",
    lastName: "Acuña",
    disciplines: ["bachata-zouk", "bachata-sensual"],
    bio: "Perfil de ejemplo. Acá va una bio corta sobre su formación y los estilos que enseña.",
    quote: "Movimiento, técnica y conexión.",
    avatar: {
      src: `${MOCK_DIR}/professor-02.jpg`,
      alt: "Profesor en pleno salto (foto temporal)",
      width: 1400,
      height: 2100,
      focus: "50% 30%",
      isPlaceholder: true,
      credit: "Karsten Winegeart / Unsplash"
    },
    isPlaceholder: true
  },
  {
    id: "prof-3",
    slug: "carla-benitez",
    displayName: "Carla Benítez",
    firstName: "Carla",
    lastName: "Benítez",
    disciplines: ["estilo-femenino"],
    bio: "Perfil de ejemplo. Acá va una bio corta sobre su recorrido como bailarina y docente.",
    quote: "Cada cuerpo tiene su forma de escuchar la música.",
    avatar: {
      src: `${MOCK_DIR}/professor-03.jpg`,
      alt: "Profesora elevando una pierna en un salón oscuro (foto temporal)",
      width: 1400,
      height: 1698,
      focus: "50% 40%",
      isPlaceholder: true,
      credit: "Alexander Jawfox / Unsplash"
    },
    isPlaceholder: true
  }
];

export const mockClasses: PublicClass[] = [
  { id: "c-bs-1", name: "Bachata Sensual", styleSlug: "bachata-sensual", professorSlugs: ["lucia-ferreyra", "tomas-acuna"], levels: ["Inicial"], branchId: "sede-calle-3" },
  { id: "c-bs-2", name: "Bachata Sensual", styleSlug: "bachata-sensual", professorSlugs: ["lucia-ferreyra", "tomas-acuna"], levels: ["Intermedio"], branchId: "sede-calle-3" },
  { id: "c-bz-1", name: "Bachata Zouk", styleSlug: "bachata-zouk", professorSlugs: ["tomas-acuna"], levels: ["Inicial"], branchId: "sede-calle-3" },
  { id: "c-bz-2", name: "Bachata Zouk", styleSlug: "bachata-zouk", professorSlugs: ["tomas-acuna"], levels: ["Intermedio"], branchId: "sede-calle-3" },
  { id: "c-ef-1", name: "Estilo Femenino", styleSlug: "estilo-femenino", professorSlugs: ["carla-benitez"], levels: ["Inicial"], branchId: "sede-calle-3" },
  { id: "c-ef-2", name: "Estilo Femenino", styleSlug: "estilo-femenino", professorSlugs: ["lucia-ferreyra"], levels: ["Intermedio"], branchId: "sede-calle-3" }
];

export const mockSchedule: PublicSchedule = {
  isPlaceholder: true,
  slots: [
    { id: "s1", classId: "c-bs-1", day: "MONDAY", startTime: "19:00", endTime: "20:00" },
    { id: "s2", classId: "c-bs-2", day: "MONDAY", startTime: "20:00", endTime: "21:30" },
    { id: "s3", classId: "c-bz-1", day: "TUESDAY", startTime: "19:30", endTime: "20:30" },
    { id: "s4", classId: "c-bz-2", day: "TUESDAY", startTime: "20:30", endTime: "22:00" },
    { id: "s5", classId: "c-ef-1", day: "WEDNESDAY", startTime: "18:00", endTime: "19:00" },
    { id: "s6", classId: "c-bs-1", day: "WEDNESDAY", startTime: "19:00", endTime: "20:00" },
    { id: "s7", classId: "c-ef-2", day: "THURSDAY", startTime: "18:30", endTime: "19:30" },
    { id: "s8", classId: "c-bs-2", day: "THURSDAY", startTime: "20:00", endTime: "21:30" },
    { id: "s9", classId: "c-bz-1", day: "FRIDAY", startTime: "19:30", endTime: "20:30" },
    { id: "s10", classId: "c-ef-1", day: "SATURDAY", startTime: "16:00", endTime: "17:30" },
    { id: "s11", classId: "c-bs-1", day: "SATURDAY", startTime: "17:30", endTime: "19:00" }
  ]
};

/** General FAQ. Items flagged isPlaceholder are shown but excluded from FAQPage JSON-LD. */
export const mockFaq: FaqItem[] = [
  {
    question: "¿Dónde queda M&M Academia de Baile?",
    answer: "En Calle 3 N.º 164, entre 35 y 36, en La Plata, provincia de Buenos Aires."
  },
  {
    question: "¿Qué estilos de baile se pueden aprender?",
    answer: "Bachata Sensual, Bachata Zouk y Estilo Femenino. La academia va a ir sumando nuevos estilos."
  },
  {
    question: "¿Necesito experiencia previa?",
    answer: "Hay clases de nivel inicial para empezar desde cero. Si ya bailás, consultanos y te recomendamos el nivel.",
    isPlaceholder: true
  },
  {
    question: "¿Cómo consulto los horarios?",
    answer: "En el horario semanal de esta página. Para confirmar un día y un horario, escribinos por WhatsApp al +54 9 221 596-8108."
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
