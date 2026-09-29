import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landingCard">
        <div className="brandMark">M&M</div>
        <p className="eyebrow">ACADEMIA DE BAILE</p>
        <h1>Una plataforma pensada para moverse.</h1>
        <p className="landingCopy">
          Gestión de clases, alumnos, profesores y pagos con una experiencia simple desde cualquier dispositivo.
        </p>
        <div className="landingActions">
          <Link className="primaryLink" href="/professor">
            Ver experiencia profesor
          </Link>
        </div>
      </section>
    </main>
  );
}
