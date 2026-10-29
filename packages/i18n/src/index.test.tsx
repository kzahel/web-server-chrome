import { afterEach, describe, expect, it } from "vitest";
import {
  configureLanguage,
  getLanguagePreference,
  getLocale,
  localizeDiagnostic,
  matchLocale,
  rich,
  setLanguagePreference,
  t,
} from "./index";

afterEach(() => configureLanguage("system", ["en"]));

describe("locale negotiation", () => {
  const available = ["en", "de", "fr", "pt-BR", "zh-CN", "zh-TW"];
  it("keeps user preference order and regional parents", () => {
    expect(matchLocale(["xx", "de-AT", "fr"], available)).toBe("de");
    expect(matchLocale(["fr-CA", "de"], available)).toBe("fr");
    expect(matchLocale(["pt-Latn-BR"], available)).toBe("pt-BR");
    expect(matchLocale(["not a locale", "de_DE"], available)).toBe("de");
    expect(matchLocale(["xx"], available)).toBe("en");
  });
  it("preserves Chinese writing systems, including script/region conflicts", () => {
    expect(matchLocale(["zh-Hant-CN"], available)).toBe("zh-TW");
    expect(matchLocale(["zh-Hans-TW"], available)).toBe("zh-CN");
    expect(matchLocale(["zh-HK"], available)).toBe("zh-TW");
    expect(matchLocale(["zh-SG"], available)).toBe("zh-CN");
    expect(matchLocale(["zh-Latn-CN", "de"], available)).toBe("de");
    expect(matchLocale(["zh", "fr"], available)).toBe("fr");
  });
  it("preserves unknown future saved choices and falls back without rewriting them", () => {
    configureLanguage("future-locale", ["de-DE"]);
    expect(getLocale()).toBe("en");
    expect(getLanguagePreference()).toBe("future-locale");
  });
  it("commits locale changes only when native persistence succeeds", async () => {
    configureLanguage("en", ["de"], async () => {
      throw new Error("disk failure");
    });
    await expect(setLanguagePreference("de")).rejects.toThrow("disk failure");
    expect(getLocale()).toBe("en");
  });
});

describe("German production catalogs", () => {
  it("formats complete state sentences and protects untrusted values", async () => {
    configureLanguage("system", ["de-AT"]);
    expect(getLocale()).toBe("de");
    expect(t("language.label")).toBe("Sprache");
    expect(
      t("extension.wait.for.the.server.to.finish.value0.da806d", {
        value0: "starting",
      }),
    ).not.toContain("starting");
    expect(
      t("desktop.could.not.open.value0.value1.fe47fa", {
        value0: "<script>/folder",
        value1: "unknown diagnostic",
      }),
    ).toContain("<script>/folder");
    expect(
      rich(
        "extension.allow.200.ok.to.communicate.with.your.chromebook.s.linu.76c804",
        { tag0: (parts) => parts.join("") },
      ),
    ).toContain("penguin.linux.test");
    await setLanguagePreference("en");
    expect(t("language.label")).toBe("Language");
  });
  it("translates known legacy peer diagnostics and retains unknown future diagnostics", () => {
    configureLanguage("de", ["en"]);
    expect(localizeDiagnostic("Show Icon in System Tray")).not.toBe(
      "Show Icon in System Tray",
    );
    expect(localizeDiagnostic("Future peer: custom error 123")).toBe(
      "Future peer: custom error 123",
    );
    expect(t("desktop.200.ok.web.server.bf6c0d")).toBe("200 OK Web Server");
  });
});

it("pseudo-localization preserves plural branches, arguments and rich-text tags", async () => {
  const { parse } = await import("@formatjs/icu-messageformat-parser");
  const { IntlMessageFormat } = await import("intl-messageformat");
  const { pseudoCatalog } = await import("./pseudo");
  const source = {
    message: parse(
      "{count, plural, one {<link>{name}</link>: # file} other {<link>{name}</link>: # files}}",
    ),
  };
  for (const rtl of [false, true]) {
    const catalog = pseudoCatalog(source, rtl);
    const value = new IntlMessageFormat(catalog.message, "en").format({
      count: 3,
      name: "/untrusted/path",
      link: (parts) => parts.join(""),
    });
    expect(String(value)).toContain("/untrusted/path");
    expect(String(value)).toContain("3");
    expect(String(value)).not.toContain("#");
  }
  expect(source.message).toEqual(
    parse(
      "{count, plural, one {<link>{name}</link>: # file} other {<link>{name}</link>: # files}}",
    ),
  );
});

it("rapid language choices persist in selection order", async () => {
  const calls: string[] = [];
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  configureLanguage("en", ["en"], async (value) => {
    calls.push(value);
    if (value === "de") await pending;
  });
  const first = setLanguagePreference("de");
  const second = setLanguagePreference("en");
  release();
  await Promise.all([first, second]);
  expect(calls).toEqual(["de", "en"]);
  expect(getLanguagePreference()).toBe("en");
});
