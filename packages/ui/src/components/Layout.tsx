import { ServerPage } from "./ServerPage";

export function Layout() {
  return (
    <div className="h-screen overflow-y-auto bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-gray-200 bg-white/90 px-6 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500 font-bold text-white shadow-sm">
            200
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">200 OK</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Lightweight local web server
            </p>
          </div>
        </div>
      </header>
      <main>
        <ServerPage serverId="default" />
      </main>
    </div>
  );
}
