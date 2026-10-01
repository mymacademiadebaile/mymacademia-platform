"use client";

import { useEffect, useState } from "react";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { whatsappHref } from "@/lib/public-site/site";
import { WhatsAppIcon } from "./icons";
import s from "./whatsapp-cta.module.css";

/** Persistent, discreet WhatsApp access. It yields to the footer's own contact actions. */
export function WhatsAppFloat() {
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const footer = document.getElementById("public-footer");
    if (!footer) return;

    const observer = new IntersectionObserver(([entry]) => {
      setFooterVisible(entry.isIntersecting);
    });
    observer.observe(footer);

    return () => observer.disconnect();
  }, []);

  return (
    <a
      className={`${s.float} ${footerVisible ? s.floatOverFooter : ""}`}
      href={whatsappHref()}
      target="_blank"
      rel="noopener noreferrer"
      aria-hidden={footerVisible || undefined}
      tabIndex={footerVisible ? -1 : undefined}
      {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "floating")}
    >
      <span className={s.floatIcon}>
        <WhatsAppIcon size={18} />
      </span>
      <span className={s.floatText}>Quiero empezar</span>
    </a>
  );
}
