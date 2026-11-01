import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { fetchAuthStatus } from "../api.ts";
import { AppShell } from "./AppShell.tsx";
import { SignInHelp } from "./SignInHelp.tsx";
import { Outlet } from "@tanstack/react-router";

/** Shows the app only with a valid session; /auth is reachable without one. */
export function AuthGate() {
  const { t } = useTranslation();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const auth = useQuery({ queryKey: ["auth"], queryFn: fetchAuthStatus, retry: 1 });

  if (path === "/auth") return <Outlet />;
  if (auth.isPending) return <p className="p-10 text-muted" role="status">{t("auth.checking")}</p>;
  if (auth.isError) return <SignInHelp errorKey="status.serverDown" />;
  if (!auth.data.authenticated) return <SignInHelp />;
  return <AppShell />;
}
