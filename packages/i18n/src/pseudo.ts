import type { MessageFormatElement } from "@formatjs/icu-messageformat-parser";

/** Test builds only: vary literal text while retaining all argument/tag structure. */
export function pseudoCatalog(
  source: Record<string, MessageFormatElement[]>,
  rtl: boolean,
): Record<string, MessageFormatElement[]> {
  function visit(elements: MessageFormatElement[]): MessageFormatElement[] {
    return elements.map((element) => {
      if (element.type === 0) {
        const text = element.value;
        return {
          ...element,
          value: rtl
            ? `\u202e${text}\u202c`
            : `[${text.replace(/[aeiouAEIOU]/g, (character) => ({ a: "á", e: "ë", i: "ï", o: "ø", u: "ü", A: "Á", E: "Ë", I: "Ï", O: "Ø", U: "Ü" })[character] || character)}${"~".repeat(Math.ceil(text.length * 0.3))}]`,
        };
      }
      if (element.type === 8)
        return { ...element, children: visit(element.children) };
      if (element.type === 5 || element.type === 6)
        return {
          ...element,
          options: Object.fromEntries(
            Object.entries(element.options).map(([key, option]) => [
              key,
              { ...option, value: visit(option.value) },
            ]),
          ),
        };
      return element;
    });
  }
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, visit(value)]),
  );
}
