import { t, useLocale } from "@ok200/i18n";
import { useCallback } from "react";
import { useServerManager } from "../lib/server-manager-context";

const FEEDBACK_URL = "https://ok200.app/feedback";
const SOURCE_URL = "https://github.com/kzahel/web-server-chrome";

function ExternalArrow() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5M6 9v9h9v-4.5"
      />
    </svg>
  );
}

export function ProductLinks() {
  useLocale();
  const manager = useServerManager();
  const openExternal = useCallback(
    async (url: string) => {
      if (manager.openUrl) {
        await manager.openUrl(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [manager],
  );

  const open = (url: string) => {
    void openExternal(url).catch((error) => {
      console.error(t("desktop.failed.to.open.external.link.29fcf0"), error);
    });
  };

  return (
    <footer className="mx-auto w-full max-w-md px-3 pb-4 pt-1">
      <div className="grid grid-cols-2 gap-2 border-t border-gray-300/80 pt-3 dark:border-[#333]">
        <button
          type="button"
          onClick={() => open(FEEDBACK_URL)}
          title={t("desktop.feedback.suggestions.and.support.d1acad")}
          className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-[12px] font-medium text-gray-700 transition hover:border-[#d4b500] hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] dark:border-[#3b3b3b] dark:bg-[#191919] dark:text-gray-300 dark:hover:border-[#f8d203] dark:hover:text-white"
        >
          {t("desktop.feedback.support.2d5632")}
          <ExternalArrow />
        </button>
        <button
          type="button"
          onClick={() => open(SOURCE_URL)}
          title={t("desktop.view.the.mit.licensed.source.code.017168")}
          className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-[12px] font-medium text-gray-700 transition hover:border-[#d4b500] hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] dark:border-[#3b3b3b] dark:bg-[#191919] dark:text-gray-300 dark:hover:border-[#f8d203] dark:hover:text-white"
        >
          {t("desktop.source.mit.32896a")}
          <ExternalArrow />
        </button>
      </div>
    </footer>
  );
}
