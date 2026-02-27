import { type ReactNode, useState } from "react";

interface SettingsSectionProps {
  title: string;
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function SettingsSection({
  title,
  summary,
  children,
  defaultOpen = false,
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-gray-400">{open ? "" : summary}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
