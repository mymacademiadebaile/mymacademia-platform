"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export type Role = "ADMIN" | "PROFESSOR";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  branchIds: string[];
};

const AuthUserContext = createContext<AuthUser | null>(null);

export function useAuthUser() {
  return useContext(AuthUserContext);
}

export function AuthGate({
  children,
  roles
}: {
  children: React.ReactNode;
  roles: Role[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const initialPathname = useRef(pathname || "/admin");
  const rolesKey = useMemo(() => roles.join("|"), [roles]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const allowedRoles = rolesKey.split("|") as Role[];

    apiFetch<{ user: AuthUser }>("/auth/me")
      .then(({ user: currentUser }) => {
        if (!mounted) return;

        if (!allowedRoles.includes(currentUser.role)) {
          router.replace(currentUser.role === "ADMIN" ? "/admin" : "/professor");
          return;
        }

        setUser(currentUser);
        setReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        const next = encodeURIComponent(initialPathname.current);
        router.replace(`/login?next=${next}`);
      });

    return () => {
      mounted = false;
    };
  }, [rolesKey, router]);

  if (!ready || !user) {
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

  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
}
