import { forwardRef } from "react";

export type CredentialPerson = { firstName: string; lastName: string; dni?: string; phone?: string };

function nameSize(value: string) {
  return value.length > 25 ? 29 : value.length > 18 ? 34 : 40;
}

export const CredentialArtwork = forwardRef<SVGSVGElement, { person: CredentialPerson; academic: boolean; qrImage: string }>(
  function CredentialArtwork({ person, academic, qrImage }, ref) {
    const status = academic ? "ALUMNO" : "ASPIRANTE";
    return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 900" role="img"
      aria-label={`Credencial de ${academic ? "alumno" : "aspirante"} de ${person.firstName} ${person.lastName}${qrImage ? " con QR de asistencia" : " sin QR visible"}`}>
      <defs>
        <linearGradient id="credential-header" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#211529" /><stop offset=".62" stopColor="#462078" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
        <clipPath id="credential-corners"><rect width="640" height="900" rx="24" /></clipPath>
      </defs>
      <g clipPath="url(#credential-corners)">
        <rect width="640" height="900" fill="#fff" />
        <rect width="640" height="184" fill="url(#credential-header)" />
        <circle cx="78" cy="76" r="37" fill="none" stroke="#c7a8ff" strokeWidth="2" />
        <text x="78" y="84" textAnchor="middle" fill="#fff" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="22">M&amp;M</text>
        <text x="136" y="70" fill="#fff" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="25">M&amp;M Academia</text>
        <text x="136" y="99" fill="#e9dcff" fontFamily="Inter, Arial, sans-serif" fontWeight="600" fontSize="17">de Baile</text>
        <text x="42" y="150" fill="#eadfff" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="15" letterSpacing="2">CREDENCIAL DE ASISTENCIA</text>

        <rect x="42" y="213" width={academic ? "150" : "188"} height="39" rx="19.5" fill="#efe7ff" />
        <text x="64" y="239" fill="#531d99" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="18" letterSpacing="1">{status}</text>
        <text x="42" y="303" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize={nameSize(person.firstName)}>{person.firstName}</text>
        <text x="42" y="349" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize={nameSize(person.lastName)}>{person.lastName}</text>
        <line x1="42" y1="380" x2="598" y2="380" stroke="#e4dced" strokeWidth="2" />
        <text x="42" y="413" fill="#756b80" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="15">DNI</text>
        <text x="42" y="447" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="23">{person.dni || "No informado"}</text>
        <text x="318" y="413" fill="#756b80" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="15">TELÉFONO</text>
        <text x="318" y="447" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="21">{person.phone || "No informado"}</text>

        <rect x="145" y="481" width="350" height="350" rx="18" fill="#fff" stroke="#e4dced" strokeWidth="2" />
        {qrImage ? <image x="159" y="495" width="322" height="322" href={qrImage} /> : <>
          <text x="320" y="632" textAnchor="middle" fill="#531d99" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="22">QR no visible</text>
          <text x="320" y="669" textAnchor="middle" fill="#756b80" fontFamily="Inter, Arial, sans-serif" fontSize="17">Generá o renová la credencial</text>
        </>}
        <text x="320" y="865" textAnchor="middle" fill="#5c4b6e" fontFamily="Inter, Arial, sans-serif" fontWeight="600" fontSize="18">Presentá esta credencial en recepción</text>
      </g>
    </svg>;
  }
);
