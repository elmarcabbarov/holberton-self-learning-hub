import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, type Language } from "../i18n/index.ts";
import { applyTheme, getTheme, type Theme } from "../theme.ts";
import { BackupPanel } from "../components/BackupPanel.tsx";
import { VaultImportPanel } from "../components/VaultImportPanel.tsx";
import { LinkedVaultPanel } from "../components/LinkedVaultPanel.tsx";
import { AIPanel } from "../components/AIPanel.tsx";

const LANG_LABEL: Record<Language, string> = { en: "English", az: "Azərbaycan" };

function Segmented<T extends string>({ legend, value, options, onChange }: {
  legend: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="mt-6">
      <legend className="mb-2 text-[13px] text-muted">{legend}</legend>
      <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface-2 p-1">
        {options.map((o) => (
          <label key={o.value} className={`cursor-pointer rounded-[3px] px-3 py-1.5 text-[14px] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus ${value === o.value ? "bg-brand text-white" : "text-fg"}`}>
            <input type="radio" className="sr-only" name={legend} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getTheme());
  return (
    <section>
      <h1 className="text-[32px] font-medium tracking-tight">{t("settings.title")}</h1>
      <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-8">
        <Segmented<Language>
          legend={t("settings.language")}
          value={i18n.language as Language}
          options={LANGUAGES.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
          onChange={setLanguage}
        />
        <Segmented<Theme>
          legend={t("settings.theme")}
          value={theme}
          options={[
            { value: "system", label: t("settings.themeSystem") },
            { value: "dark", label: t("settings.themeDark") },
            { value: "light", label: t("settings.themeLight") },
          ]}
          onChange={(v) => { setTheme(v); applyTheme(v); }}
        />
      </div>
      <BackupPanel />
      <VaultImportPanel />
      <LinkedVaultPanel />
      <AIPanel />
      <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-8">
        <h2 className="text-[20px] font-medium">{t("anki.title")}</h2>
        <p className="mt-1 max-w-prose text-[14px] text-muted">{t("anki.intro")}</p>
        <a href="/api/cards/export/anki" download className="mt-5 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 text-[14px] font-medium hover:bg-surface">{t("anki.download")}</a>
      </div>
    </section>
  );
}
