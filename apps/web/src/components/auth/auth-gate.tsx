"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, apiFetch, apiMessage } from "@/lib/api";

export type Role = "SUPER_ADMIN" | "ADMIN" | "PROFESSOR";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  branchIds: string[];
};

type AuthSession = {
  user: AuthUser;
  refreshUser: () => Promise<AuthUser>;
};

const AuthSessionContext = createContext<AuthSession | null>(null);

export function useAuthUser() {
  return useContext(AuthSessionContext)?.user ?? null;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error("useAuthSession must be used inside AuthGate");
  }

  return context;
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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refreshUser = useCallback(async () => {
    const response = await apiFetch<{ user: AuthUser }>("/auth/me");
    setUser(response.user);
    return response.user;
  }, []);

  useEffect(() => {
    let mounted = true;
    const allowedRoles = rolesKey.split("|") as Role[];

    setConnectionError(null);
    apiFetch<{ user: AuthUser }>("/auth/me")
      .then(({ user: currentUser }) => {
        if (!mounted) return;

        if (!allowedRoles.includes(currentUser.role)) {
          router.replace(
            currentUser.role === "SUPER_ADMIN" || currentUser.role === "ADMIN"
              ? "/admin"
              : "/professor"
          );
          return;
        }

        setUser(currentUser);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!mounted) return;

        // Only a confirmed authentication failure should end the session. A
        // temporary API, network, or rate-limit error must not send the user to
        // the login screen and make them think their account was closed.
        if (error instanceof ApiError && error.status === 401) {
          const next = encodeURIComponent(initialPathname.current);
          router.replace(`/login?next=${next}`);
          return;
        }

        setConnectionError(apiMessage(error));
      });

    return () => {
      mounted = false;
    };
  }, [attempt, rolesKey, router]);

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
          {connectionError ? (
            <>
              <span style={{ fontSize: 12, color: "#7c7283", maxWidth: 300 }}>
                No pudimos conectar con el servicio. Tu sesión sigue activa; probá nuevamente.
              </span>
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                style={{ border: 0, background: "transparent", color: "#5b21b6", cursor: "pointer" }}
              >
                Reintentar
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "#7c7283" }}>Cargando tu espacio...</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <AuthSessionContext.Provider value={{ user, refreshUser }}>
      {children}
    </AuthSessionContext.Provider>
  );
}
