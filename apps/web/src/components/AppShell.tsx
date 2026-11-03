import { Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarCheck, FileText, FolderTree, Layers, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { fetchHealth } from "../api.ts";
import { useExamMode } from "../features/examMode.ts";
import { Logo } from "./ui.tsx";

type NavItem = { to: string; key: string; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }> };

const NAV: NavItem[] = [
  { to: "/", key: "nav.today", icon: CalendarCheck },
  { to: "/spaces", key: "nav.spaces", icon: FolderTree },
  { to: "/notes", key: "nav.notes", icon: FileText },
  { to: "/review", key: "nav.review", icon: Layers },
];

/**
 * Wide screens: icon + label, the active item marked by a red bar (holbertonschool.az nav).
 * Narrow screens: an icon rail with a hover/focus tooltip, as before.
 */
function RailLink({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="group relative flex h-11 w-11 items-center justify-center gap-3 rounded-[var(--radius-control)] text-muted transition-colors hover:bg-surface hover:text-fg md:w-full md:justify-start md:px-3 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent"
      activeProps={{ className: "bg-surface !text-fg font-semibold before:!bg-brand" }}
      activeOptions={{ exact: item.to === "/" }}
      aria-label={label}
    >
      <Icon size={19} aria-hidden />
      <span className="hidden text-[15px] md:inline" aria-hidden="true">{label}</span>
      <span className="pointer-events-none absolute left-14 z-10 whitespace-nowrap rounded-[6px] border border-line bg-surface-2 px-2 py-1 text-[13px] text-fg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:hidden">
        {label}
      </span>
    </Link>
  );
}

export function AppShell() {
  const { t, i18n } = useTranslation();
  const exam = useExamMode();
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, refetchInterval: 30_000, retry: 1 });

  return (
    <div className="flex min-h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[4px] focus:bg-brand focus:px-3 focus:py-2 focus:text-white">
        {t("app.skip")}
      </a>
      <nav aria-label={t("nav.primary")} className="sticky top-0 flex h-screen w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-bg py-4 md:w-[236px] md:items-stretch md:px-4 md:py-6">
        <Link to="/" aria-label={t("app.name")} className="mb-5 flex h-11 w-11 items-center justify-center text-brand md:mb-8 md:h-auto md:w-auto md:justify-start md:px-2">
          <img src="/brand/seahorse-red.svg" alt="" className="h-9 w-auto md:hidden" />
          <Logo className="hidden h-[46px] md:inline-block" />
        </Link>
        {NAV.map((item) => <RailLink key={item.to} item={item} label={t(item.key)} />)}
        <div className="mt-auto md:border-t md:border-line md:pt-3">
          <RailLink item={{ to: "/settings", key: "nav.settings", icon: Settings }} label={t("nav.settings")} />
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {exam.data?.until ? <div role="status" className="border-b border-line bg-surface px-6 py-3 text-[14px] text-muted md:px-10">{t("exam.banner", { time: new Date(exam.data.until).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) })}</div> : null}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 md:px-12 md:py-10">
          <Outlet />
        </main>
        <footer className="px-6 pb-4 text-[12px] text-muted md:px-10" role="status">
          {health.isSuccess
            ? health.data.status === "ok"
              ? t("status.serverOk", { version: health.data.version })
              : t("status.degraded")
            : health.isError ? t("status.serverDown") : null}
        </footer>
      </div>
    </div>
  );
}
