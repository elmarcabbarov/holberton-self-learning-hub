import { Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarCheck, FileText, FolderTree, Layers, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { fetchHealth } from "../api.ts";

type NavItem = { to: string; key: string; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }> };

const NAV: NavItem[] = [
  { to: "/", key: "nav.today", icon: CalendarCheck },
  { to: "/spaces", key: "nav.spaces", icon: FolderTree },
  { to: "/notes", key: "nav.notes", icon: FileText },
  { to: "/review", key: "nav.review", icon: Layers },
];

function RailLink({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="group relative flex h-11 w-11 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-surface hover:text-fg"
      activeProps={{ className: "bg-surface !text-fg" }}
      activeOptions={{ exact: item.to === "/" }}
      aria-label={label}
    >
      <Icon size={20} aria-hidden />
      <span className="pointer-events-none absolute left-14 z-10 whitespace-nowrap rounded-[6px] border border-line bg-surface-2 px-2 py-1 text-[13px] text-fg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </Link>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, refetchInterval: 30_000, retry: 1 });

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[4px] focus:bg-brand focus:px-3 focus:py-2 focus:text-white">
        {t("app.skip")}
      </a>
      <nav aria-label={t("nav.primary")} className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-line py-4">
        <Link to="/" aria-label={t("app.name")} className="mb-4 flex h-11 w-11 items-center justify-center">
          <img src="/brand/seahorse-red.svg" alt="" className="h-9 w-auto" />
        </Link>
        {NAV.map((item) => <RailLink key={item.to} item={item} label={t(item.key)} />)}
        <div className="mt-auto">
          <RailLink item={{ to: "/settings", key: "nav.settings", icon: Settings }} label={t("nav.settings")} />
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 md:px-10">
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
