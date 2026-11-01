import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import az from "./az.json";

export const LANGUAGES = ["en", "az"] as const;
export type Language = (typeof LANGUAGES)[number];
const STORAGE_KEY = "hub.lang";

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "az") return saved;
  } catch { /* storage unavailable */ }
  return navigator.language.toLowerCase().startsWith("az") ? "az" : "en";
}

export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
}

void i18n.use(ICU).use(initReactI18next).init({
  resources: { en: { translation: en }, az: { translation: az } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
document.documentElement.lang = i18n.language;

export default i18n;
