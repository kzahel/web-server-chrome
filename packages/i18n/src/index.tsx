import {
  type FormatXMLElementFn,
  IntlMessageFormat,
  type PrimitiveType,
} from "intl-messageformat";
import { type ReactNode, useSyncExternalStore } from "react";
import { catalogs, type MessageId, supportedLocales } from "./generated";

import { pseudoCatalog } from "./pseudo";

const pseudoEnabled =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_OK200_PSEUDO_LOCALES === "1";
const availableLocales = pseudoEnabled
  ? [...supportedLocales, "en-XA", "ar-XB"]
  : supportedLocales;
if (pseudoEnabled) {
  catalogs["en-XA"] = pseudoCatalog(catalogs.en, false);
  catalogs["ar-XB"] = pseudoCatalog(catalogs.en, true);
}

export type LanguagePreference = string;
const listeners = new Set<() => void>();
const preferenceKey = "ok200.language";
function storedPreference(): string {
  try {
    return globalThis.localStorage?.getItem(preferenceKey) || "system";
  } catch {
    return "system";
  }
}
let preference = storedPreference();
let systemLanguages: readonly string[] = globalThis.navigator?.languages || [
  "en",
];
let nativeApply: ((value: string) => Promise<void>) | undefined;

/** Try each requested language before falling back; script wins over region. */
export function matchLocale(
  requested: readonly string[],
  available: readonly string[] = availableLocales,
): string {
  for (const input of requested) {
    let locale: Intl.Locale;
    try {
      locale = new Intl.Locale(input.replace(/_/g, "-"));
    } catch {
      continue;
    }
    const tag = locale.baseName;
    const exact = available.find(
      (candidate) => candidate.toLowerCase() === tag.toLowerCase(),
    );
    if (exact) return exact;
    if (locale.language === "zh") {
      const target =
        locale.script === "Hans"
          ? "zh-CN"
          : locale.script === "Hant"
            ? "zh-TW"
            : !locale.script && ["CN", "SG"].includes(locale.region || "")
              ? "zh-CN"
              : !locale.script &&
                  ["TW", "HK", "MO"].includes(locale.region || "")
                ? "zh-TW"
                : undefined;
      if (target && available.includes(target)) return target;
      continue;
    }
    if (
      locale.language === "pt" &&
      locale.region === "BR" &&
      available.includes("pt-BR")
    )
      return "pt-BR";
    let parent = tag;
    while (parent.includes("-")) {
      parent = parent.slice(0, parent.lastIndexOf("-"));
      const match = available.find(
        (candidate) => candidate.toLowerCase() === parent.toLowerCase(),
      );
      if (match) return match;
    }
  }
  return "en";
}
export function getLocale(): string {
  return matchLocale(preference === "system" ? systemLanguages : [preference]);
}
export function getLanguagePreference(): string {
  return preference;
}
function notify() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = getLocale();
    document.documentElement.dir = getLocale() === "ar-XB" ? "rtl" : "ltr";
  }
  for (const listener of listeners) listener();
}
/** Native desktop owns persistence/menus; browser surfaces use local storage. */
export function configureLanguage(
  value: string,
  languages: readonly string[],
  apply?: (value: string) => Promise<void>,
) {
  preference = value;
  systemLanguages = languages;
  nativeApply = apply;
  notify();
}
let languageWrites: Promise<void> = Promise.resolve();
export async function setLanguagePreference(value: string): Promise<void> {
  if (value !== "system" && !availableLocales.includes(value))
    throw new Error("Unsupported language preference");
  const apply = nativeApply;
  const write = languageWrites
    .catch(() => undefined)
    .then(async () => {
      if (apply) await apply(value);
      else {
        try {
          globalThis.localStorage?.setItem(preferenceKey, value);
        } catch {
          /* Storage may be unavailable. */
        }
      }
      preference = value;
      notify();
    });
  languageWrites = write;
  return write;
}
export function useLocale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => `${preference}:${getLocale()}`,
    () => "system:en",
  );
}
if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (nativeApply) {
      if (preference === "system")
        void nativeApply("system").catch(console.error);
    } else {
      systemLanguages = navigator.languages;
      notify();
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === preferenceKey && !nativeApply) {
      preference = storedPreference();
      notify();
    }
  });
}

notify();

type RichValue = PrimitiveType | FormatXMLElementFn<ReactNode>;
const cache = new Map<string, IntlMessageFormat>();
function formatter(id: MessageId): IntlMessageFormat {
  const locale = getLocale();
  const key = `${locale}:${id}`;
  let result = cache.get(key);
  if (!result) {
    const source = catalogs[locale]?.[id] ?? catalogs.en[id];
    if (!source) throw new Error(`Unknown localization message: ${id}`);
    result = new IntlMessageFormat(source, locale);
    cache.set(key, result);
  }
  return result;
}
export function t(
  id: MessageId,
  values?: Record<string, PrimitiveType>,
): string {
  return String(formatter(id).format(values));
}
export function rich(
  id: MessageId,
  values: Record<string, RichValue>,
): ReactNode {
  return formatter(id).format<ReactNode>(values);
}
/** Only exact known first-party diagnostics are translated; unknown peers survive. */
export function localizeDiagnostic(value: string): string {
  const id = Object.values(catalogs)
    .flatMap((catalog) => Object.entries(catalog))
    .find(
      ([, ast]) =>
        ast.length === 1 && ast[0].type === 0 && ast[0].value === value,
    )?.[0];
  return id ? t(id as MessageId) : value;
}

export function LanguagePicker() {
  useLocale();
  return (
    <label className="block text-xs" style={{ marginTop: 8 }}>
      {t("language.label")}
      <select
        aria-label={t("language.label")}
        value={preference}
        onChange={(event) => {
          void setLanguagePreference(event.target.value).catch(console.error);
        }}
        style={{
          marginInlineStart: 8,
          maxWidth: "100%",
          color: "inherit",
          background: "transparent",
        }}
      >
        {preference !== "system" && !availableLocales.includes(preference) && (
          <option value={preference} disabled>
            {preference}
          </option>
        )}
        <option value="system">{t("language.system")}</option>
        {availableLocales.map((locale) => (
          <option key={locale} value={locale}>
            {new Intl.DisplayNames([locale], { type: "language" }).of(locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
