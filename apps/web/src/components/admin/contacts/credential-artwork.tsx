import { forwardRef } from "react";

export type CredentialPerson = { firstName: string; lastName: string; dni?: string; phone?: string };

function nameSize(value: string) {
  return value.length > 25 ? 25 : value.length > 18 ? 30 : 35;
}

export const CredentialArtwork = forwardRef<SVGSVGElement, { person: CredentialPerson; academic: boolean; qrImage: string }>(
  function CredentialArtwork({ person, academic, qrImage }, ref) {
    const status = academic ? "ALUMNO" : "ASPIRANTE";
    return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 856 540" role="img"
      aria-label={`Credencial de ${academic ? "alumno" : "aspirante"} de ${person.firstName} ${person.lastName}${qrImage ? " con QR de asistencia" : " sin QR visible"}`}>
      <defs>
        <linearGradient id="credential-header" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#211529" /><stop offset=".62" stopColor="#462078" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
        <clipPath id="credential-corners"><rect width="856" height="540" rx="28" /></clipPath>
      </defs>
      <g clipPath="url(#credential-corners)">
        <rect width="856" height="540" fill="#fff" />
        <rect width="856" height="138" fill="url(#credential-header)" />
        <circle cx="71" cy="67" r="35" fill="none" stroke="#c7a8ff" strokeWidth="2" />
        <text x="71" y="75" textAnchor="middle" fill="#fff" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="20">M&amp;M</text>
        <text x="124" y="63" fill="#fff" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="25">M&amp;M Academia</text>
        <text x="124" y="91" fill="#e9dcff" fontFamily="Inter, Arial, sans-serif" fontWeight="600" fontSize="17">de Baile</text>
        <text x="34" y="119" fill="#eadfff" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="14" letterSpacing="2">CREDENCIAL DE ASISTENCIA</text>

        <rect x="34" y="166" width={academic ? "138" : "171"} height="35" rx="17.5" fill="#efe7ff" />
        <text x="53" y="189" fill="#531d99" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="16" letterSpacing="1">{status}</text>
        <text x="34" y="253" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize={nameSize(person.firstName)}>{person.firstName}</text>
        <text x="34" y="294" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize={nameSize(person.lastName)}>{person.lastName}</text>
        <line x1="34" y1="321" x2="514" y2="321" stroke="#e4dced" strokeWidth="2" />
        <text x="34" y="352" fill="#756b80" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="14">DNI</text>
        <text x="34" y="383" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="21">{person.dni || "No informado"}</text>
        <text x="277" y="352" fill="#756b80" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="14">TELÉFONO</text>
        <text x="277" y="383" fill="#211529" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="19">{person.phone || "No informado"}</text>
        <text x="34" y="487" fill="#5c4b6e" fontFamily="Inter, Arial, sans-serif" fontWeight="600" fontSize="16">Presentá esta credencial en recepción</text>

        <rect x="553" y="157" width="269" height="269" rx="18" fill="#fff" stroke="#e4dced" strokeWidth="2" />
        {qrImage ? <image x="566" y="170" width="243" height="243" href={qrImage} /> : <>
          <text x="687" y="274" textAnchor="middle" fill="#531d99" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="19">QR no visible</text>
          <text x="687" y="305" textAnchor="middle" fill="#756b80" fontFamily="Inter, Arial, sans-serif" fontSize="14">Generá o renová la credencial</text>
        </>}
      </g>
    </svg>;
  }
);
