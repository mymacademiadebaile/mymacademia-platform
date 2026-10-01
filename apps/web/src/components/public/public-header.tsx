"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { PUBLIC_NAV, SITE, whatsappHref } from "@/lib/public-site/site";
import { WhatsAppIcon } from "./icons";
import s from "./public-header.module.css";

export function PublicHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => desktop.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      root.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
    };
  }, [open]);

  return (
    <header className={s.header} data-scrolled={scrolled || undefined} data-open={open || undefined}>
      <div className={s.bar}>
        <Link href="/" className={s.brand} aria-label={`${SITE.name}, inicio`} onClick={() => setOpen(false)}>
          <Image src={SITE.logo.src} alt="" width={44} height={44} className={s.logo} priority />
          <span className={s.brandText} aria-hidden="true">
            <span>M&amp;M Academia</span>{" "}
            <span>La Plata</span>
          </span>
        </Link>

        <nav className={s.nav} aria-label="Principal">
          <ul>
            {PUBLIC_NAV.map((item, index) => (
              <li key={item.href}>
                <Link href={item.href} className={s.navLink}>
                  <span className={s.navIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={s.actions}>
          <Link href="/login" className={s.loginLink}>
            Ingresar
          </Link>
          <a
            className={s.cta}
            href={whatsappHref()}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "header")}
          >
            <WhatsAppIcon size={16} />
            Quiero bailar
          </a>
        </div>

        <button
          ref={buttonRef}
          type="button"
          className={s.menuButton}
          aria-expanded={open}
          aria-controls="menu-publico"
          onClick={() => setOpen((value) => !value)}
        >
          <span className={s.menuLabel}>{open ? "Cerrar" : "Menú"}</span>
          <span className={s.menuGlyph} aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </div>

      <div id="menu-publico" ref={panelRef} className={s.panel} hidden={!open}>
        <nav aria-label="Menú móvil">
          <ol className={s.panelList}>
            {PUBLIC_NAV.map((item, index) => (
              <li key={item.href} style={{ "--i": index } as React.CSSProperties}>
                <Link href={item.href} className={s.panelLink} onClick={() => setOpen(false)}>
                  <span className={s.panelIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className={s.panelFoot}>
          <address>
            Calle 3 N.º 164, entre 35 y 36
            <br />
            La Plata, Buenos Aires
          </address>
          <a
            className={s.panelCta}
            href={whatsappHref()}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "mobile-menu")}
          >
            <WhatsAppIcon size={18} />
            Quiero bailar
          </a>
          <Link className={s.panelLogin} href="/login" onClick={() => setOpen(false)}>
            Ingresar al sistema
          </Link>
        </div>
      </div>
    </header>
  );
}
