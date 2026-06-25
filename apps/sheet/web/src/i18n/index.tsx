import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import enMessages from "../../../locales/en/app.json";
import zhCnMessages from "../../../locales/zh-CN/app.json";

const defaultLocale = "en";
const supportedLocales = ["en", "zh-CN"] as const;
const messages = {
  en: enMessages,
  "zh-CN": zhCnMessages,
} satisfies Record<SupportedLocale, Record<string, string>>;

type SupportedLocale = (typeof supportedLocales)[number];
type MessageKey = keyof typeof enMessages;

interface TuttiAppContext {
  locale?: string;
  language?: string;
}

interface TuttiExternalBridge {
  app?: {
    getContext?: () => Promise<TuttiAppContext>;
    subscribe?: (listener: (context: TuttiAppContext) => void) => () => void;
  };
}

declare global {
  interface Window {
    tuttiExternal?: TuttiExternalBridge;
  }
}

const I18nContext = createContext({
  locale: defaultLocale as SupportedLocale,
  t: translate(defaultLocale),
});

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocale] = useState<SupportedLocale>(() => normalizeLocale(document.documentElement.lang || browserLocale()));

  useEffect(() => {
    let mounted = true;
    const applyLocale = (value: string | null | undefined) => {
      if (!mounted) return;
      const nextLocale = normalizeLocale(value || document.documentElement.lang || browserLocale());
      document.documentElement.lang = nextLocale;
      setLocale(nextLocale);
    };

    const external = window.tuttiExternal as TuttiExternalBridge | undefined;
    void external?.app?.getContext?.()
      .then((context) => applyLocale(context?.locale || context?.language))
      .catch(() => applyLocale(null));

    const unsubscribe = external?.app?.subscribe?.((context: TuttiAppContext) => {
      applyLocale(context?.locale || context?.language);
    });

    applyLocale(document.documentElement.lang || browserLocale());
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo(() => ({ locale, t: translate(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

function translate(locale: SupportedLocale) {
  return (key: MessageKey, values: Record<string, string | number> = {}) => {
    const template = messages[locale][key] || messages[defaultLocale][key] || key;
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""));
  };
}

function normalizeLocale(value: string | null | undefined): SupportedLocale {
  const tag = String(value || "").trim().replace(/_/g, "-");
  if (!tag) return defaultLocale;
  const exact = supportedLocales.find((locale) => locale.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const language = tag.split("-")[0]?.toLowerCase();
  return supportedLocales.find((locale) => locale.split("-")[0]?.toLowerCase() === language) || defaultLocale;
}

function browserLocale() {
  return navigator.languages?.[0] || navigator.language || defaultLocale;
}
