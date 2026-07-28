import type { ReactNode } from "react";

interface LockedControlProps {
  locked: boolean;
  children: ReactNode;
  className?: string;
  message?: string;
}

export function LockedControl({
  locked,
  children,
  className = "",
  message = "Stop the server to change this setting",
}: LockedControlProps) {
  return (
    <fieldset
      className={`group relative m-0 min-w-0 border-0 p-0 ${locked ? "cursor-not-allowed" : ""} ${className}`}
      tabIndex={locked ? 0 : undefined}
      aria-label={locked ? message : undefined}
    >
      {children}
      {locked && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-gray-950 px-2 py-1 text-center text-[11px] font-medium leading-4 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100 dark:bg-gray-100 dark:text-gray-950"
        >
          {message}
        </span>
      )}
    </fieldset>
  );
}
