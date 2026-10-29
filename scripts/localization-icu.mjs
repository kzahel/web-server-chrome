#!/usr/bin/env node
// Offline validator; uses the repository's already pinned FormatJS parser.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parse } = await import(
  pathToFileURL(
    path.join(root, "node_modules/@formatjs/icu-messageformat-parser/index.js"),
  )
);
const request = JSON.parse(fs.readFileSync(0, "utf8"));
function contract(message, locale) {
  if (
    typeof message !== "string" ||
    !message.trim().length ||
    message.length > 65536
  )
    throw new Error("message must be nonempty text <=65536 characters");
  const argumentsByName = new Map();
  const selectors = [];
  const tags = new Set();
  function visit(elements, scope = "") {
    for (const node of elements) {
      if (node.type === 0 || node.type === 7) continue;
      if (node.type === 8) {
        tags.add(node.value);
        visit(node.children, scope);
        continue;
      }
      const role =
        node.type === 6
          ? `plural:${node.pluralType}`
          : [2, 3, 4].includes(node.type)
            ? `${node.type}:${JSON.stringify(node.style ?? null)}`
            : String(node.type);
      const types = argumentsByName.get(node.value) ?? new Set();
      types.add(role);
      argumentsByName.set(node.value, types);
      if (node.type === 5 || node.type === 6) {
        const keys = Object.keys(node.options).sort();
        const allowed =
          node.type === 6
            ? new Set(
                new Intl.PluralRules(locale, {
                  type: node.pluralType,
                }).resolvedOptions().pluralCategories,
              )
            : null;
        if (
          allowed &&
          keys.some((key) => !key.startsWith("=") && !allowed.has(key))
        )
          throw new Error(
            `invalid ${locale} plural category for ${node.value}`,
          );
        selectors.push({
          name: node.value,
          role,
          offset: node.offset ?? 0,
          keys:
            node.type === 5 ? keys : keys.filter((key) => key.startsWith("=")),
        });
        for (const [key, option] of Object.entries(node.options))
          visit(
            option.value,
            `${scope}/${node.value}:${node.type === 5 || key.startsWith("=") ? key : "plural"}`,
          );
      }
    }
  }
  visit(
    parse(message, { requiresOtherClause: true, shouldParseSkeletons: true }),
  );
  return {
    arguments: Object.fromEntries(
      [...argumentsByName]
        .sort()
        .map(([name, types]) => [name, [...types].sort()]),
    ),
    selectors: [
      ...new Set(selectors.map((value) => JSON.stringify(value))),
    ].sort(),
    tags: [...tags].sort(),
  };
}

// This validation is deliberately separate from the exported contract: adding
// semantic checks must not invalidate existing English/source fingerprints.
function scopedAtoms(message, locale) {
  const atoms = new Set();
  const singularIsOne = ["de", "en"].includes(new Intl.Locale(locale).language);
  const add = (scope, value) => atoms.add(JSON.stringify([scope, value]));
  function visit(elements, scope = [], constantPound = false) {
    for (const node of elements) {
      if (node.type === 0) continue;
      if (node.type === 7) {
        if (!constantPound) add(scope, "pound");
        continue;
      }
      if (node.type === 8) {
        add(scope, ["tag", node.value]);
        visit(node.children, [...scope, ["tag", node.value]], constantPound);
        continue;
      }
      const role =
        node.type === 6
          ? `plural:${node.pluralType}`
          : [2, 3, 4].includes(node.type)
            ? `${node.type}:${JSON.stringify(node.style ?? null)}`
            : String(node.type);
      add(scope, ["argument", node.value, role]);
      if (node.type !== 5 && node.type !== 6) continue;
      const selector = [node.value, role, node.offset ?? 0];
      if (node.type === 5) {
        for (const [key, option] of Object.entries(node.options)) {
          visit(option.value, [...scope, [...selector, key]], constantPound);
        }
        continue;
      }
      // Compare branches using the target locale's categories. A missing
      // category takes ICU's `other` fallback, including in the English AST.
      // Exact numeric cases retain their own meaning independently of locale.
      const categories = new Intl.PluralRules(locale, {
        type: node.pluralType,
      }).resolvedOptions().pluralCategories;
      const keys = [
        ...categories,
        ...Object.keys(node.options).filter((key) => key.startsWith("=")),
      ];
      for (const key of keys) {
        const option = node.options[key] ?? node.options.other;
        // In an exact-number branch, or German/English cardinal `one`, the
        // number may naturally be written as a word. The fallback `other`
        // remains dynamic; replacing its # with a literal loses information.
        const literalAllowed =
          key.startsWith("=") ||
          (singularIsOne && node.pluralType === "cardinal" && key === "one");
        visit(option.value, [...scope, [...selector, key]], literalAllowed);
      }
    }
  }
  visit(
    parse(message, { requiresOtherClause: true, shouldParseSkeletons: true }),
  );
  return [...atoms].sort();
}

try {
  const result = {};
  for (const [id, message] of Object.entries(request.messages)) {
    const locale = request.locale ?? "en";
    result[id] = contract(message, locale);
    if (request.sourceMessages) {
      const expected = scopedAtoms(request.sourceMessages[id], locale);
      const actual = scopedAtoms(message, locale);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new Error(
          `${id}: argument, rich-text tag or dynamic # moved across an ICU branch/tag boundary`,
        );
      }
    }
  }
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(String(error.message));
  process.exitCode = 1;
}
