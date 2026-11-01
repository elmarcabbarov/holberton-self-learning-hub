import { useTranslation } from "react-i18next";

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className="text-[32px] font-medium tracking-tight">{t(titleKey)}</h1>
      <p className="mt-4 text-muted">{t("soon")}</p>
    </section>
  );
}
