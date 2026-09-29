import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landingCard">
        <Image
          src="/mym-academia-logo.png"
          alt="M&M Academia de Baile"
          width={96}
          height={96}
          priority
          style={{ objectFit: "contain", marginBottom: 18 }}
        />
        <p className="eyebrow">M&M ACADEMIA DE BAILE</p>
        <h1>Gestión de la academia.</h1>
        <p className="landingCopy">
          Acceso seguro para administración y profesores. Cada usuario ingresa únicamente a la información permitida por su rol.
        </p>
        <div className="landingActions">
          <Link className="primaryLink" href="/login">
            Ingresar al sistema
          </Link>
        </div>
      </section>
    </main>
  );
}
