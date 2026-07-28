import type { ReactNode } from "react";
import logoUrl from "../../../../images/200ok-256.png";
import { ProductLinks } from "./ProductLinks";
import { ServerPage } from "./ServerPage";

interface LayoutProps {
  notification?: ReactNode;
}

export function Layout({ notification }: LayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-[#f5f5f3] text-gray-900 dark:bg-[#0d0d0d] dark:text-gray-100">
      <header className="border-b border-gray-300/80 bg-white/95 px-3 py-2.5 backdrop-blur dark:border-[#333] dark:bg-[#1a1a1a]/95">
        <div className="mx-auto flex max-w-md items-center gap-2.5">
          <img
            src={logoUrl}
            alt=""
            className="h-9 w-9 rounded-full"
            aria-hidden="true"
          />
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">
              200 OK Web Server
            </h1>
            <p className="mt-0.5 text-[11px] leading-none text-gray-500 dark:text-gray-400">
              Desktop
            </p>
          </div>
        </div>
      </header>
      {notification && (
        <div className="mx-auto w-full max-w-md px-3 pt-3">{notification}</div>
      )}
      <main className="flex-1">
        <ServerPage serverId="default" />
      </main>
      <ProductLinks />
    </div>
  );
}
