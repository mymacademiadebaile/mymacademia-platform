import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/public-site/site";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={`${SITE.shortName}, inicio`}>
          <Image src={SITE.logo.src} alt="" width={48} height={48} priority />
          <span>
            <strong>M&amp;M Academia</strong>
            <small>La Plata</small>
          </span>
        </Link>
        <Link href="/login" className={styles.loginLink}>Ingresar</Link>
      </header>

      <section className={styles.content} aria-labelledby="not-found-title">
        <p className={styles.countIn} aria-hidden="true"><span>5</span><span>6</span><span>7</span><span>8</span></p>
        <p className={styles.code} aria-hidden="true">404</p>
        <h1 id="not-found-title">Este paso<br /><em>no está</em> en la coreografía.</h1>
        <p className={styles.description}>
          La página que buscás no existe, se movió o cambió de ritmo. Volvamos a encontrar tu próximo paso.
        </p>
        <nav className={styles.actions} aria-label="Opciones de navegación">
          <Link href="/" className={`${styles.button} ${styles.primary}`}>
            Volver al inicio <span aria-hidden="true">→</span>
          </Link>
          <Link href="/horarios" className={styles.button}>
            Ver horarios <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </section>

      <p className={styles.sideNote}>M&amp;M Academia de Baile · La Plata</p>
      <div className={styles.beat} aria-hidden="true"><span /><span /><span /><span /></div>
    </main>
  );
}
