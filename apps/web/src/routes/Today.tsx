import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

export function Today() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="today-title">
      <h1 id="today-title" className="text-[32px] font-medium tracking-tight">{t("today.title")}</h1>
      <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-8">
        <h2 className="text-[20px] font-medium">{t("today.emptyTitle")}</h2>
        <p className="mt-2 max-w-prose text-muted">{t("today.emptyBody")}</p>
        <Link to="/spaces" className="mt-6 inline-flex h-10 items-center rounded-[var(--radius-control)] bg-brand px-4 font-medium text-white transition-colors hover:bg-brand-dark">
          {t("today.emptyCta")}
        </Link>
      </div>
    </section>
  );
}
