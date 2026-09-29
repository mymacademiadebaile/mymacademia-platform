"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "PROFESSOR";
  branchIds: string[];
};

export function AuthGate({
  children,
  role
}: {
  children: React.ReactNode;
  role: "ADMIN" | "PROFESSOR";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    apiFetch<{ user: AuthUser }>("/auth/me")
      .then(({ user }) => {
        if (!mounted) return;

        if (user.role !== role) {
          router.replace(user.role === "ADMIN" ? "/admin" : "/professor");
          return;
        }

        setReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        const next = encodeURIComponent(pathname || "/admin");
        router.replace(`/login?next=${next}`);
      });

    return () => {
      mounted = false;
    };
  }, [pathname, role, router]);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f6f3f8",
          color: "#5b21b6",
          fontFamily: "system-ui, sans-serif"
        }}
      >
        <div style={{ display: "grid", gap: 8, textAlign: "center" }}>
          <strong>M&M Academia</strong>
          <span style={{ fontSize: 12, color: "#7c7283" }}>Cargando tu espacio...</span>
        </div>
      </div>
    );
  }

  return children;
}
