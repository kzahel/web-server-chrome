/** No model calls: validate locale registration, source coverage and checked output. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  fs.readFileSync(path.join(root, "localization/locales.json"), "utf8"),
);
const messages = JSON.parse(
  fs.readFileSync(path.join(root, registry.catalogs.web), "utf8"),
);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
assert(
  registry.sourceLocale === "en" && registry.fallbackLocale === "en",
  "English source/fallback required",
);
for (const [surface, locales] of Object.entries(registry.supportedLocales)) {
  assert(
    new Set(locales).size === locales.length && locales.includes("en"),
    `invalid locale list: ${surface}`,
  );
  for (const locale of locales) {
    assert(
      registry.localeDefinitions[locale],
      `undefined locale: ${surface}/${locale}`,
    );
    assert(
      !registry.testLocales.some((entry) => entry.tag === locale),
      "pseudo-locale advertised for release",
    );
    assert(
      !(registry.previewLocales[surface] || []).includes(locale),
      `preview/release overlap: ${surface}/${locale}`,
    );
    if (surface === "desktop" || surface === "extension")
      assert(
        registry.supportedLocales.web.includes(locale),
        `native/React locale gap: ${surface}/${locale}`,
      );
    if (locale !== "en")
      execFileSync(
        "python3",
        ["scripts/localization.py", "check", surface, locale],
        { cwd: root, stdio: "pipe" },
      );
  }
}
for (const directory of [
  "packages/ui/src",
  "desktop/tauri-app/src",
  "extension/src/ui",
]) {
  for (const entry of fs.readdirSync(path.join(root, directory), {
    recursive: true,
  })) {
    if (!/\.tsx$/.test(entry) || /\.test\.tsx$/.test(entry)) continue;
    const file = path.join(root, directory, entry);
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node) {
      if (ts.isJsxText(node)) {
        const text = node.text.trim();
        assert(
          !/[A-Za-z]{2}/.test(text) ||
            [
              "HTTP",
              "CORS",
              "200 OK",
              "Web Server for Chrome",
              "Wi-Fi",
            ].includes(text),
          `hardcoded JSX copy: ${file}: ${text}`,
        );
      }
      if (
        ts.isCallExpression(node) &&
        ["t", "rich"].includes(node.expression.getText(source)) &&
        ts.isStringLiteral(node.arguments[0])
      )
        assert(
          messages[node.arguments[0].text],
          `unknown message ID: ${file}: ${node.arguments[0].text}`,
        );
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
execFileSync(
  process.execPath,
  ["scripts/generate-localization.mjs", "--check"],
  { cwd: root, stdio: "inherit" },
);
console.log(
  "Locale registration, review ledgers, JSX coverage and generated output passed",
);
