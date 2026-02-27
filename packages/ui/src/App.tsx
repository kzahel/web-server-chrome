import { useState } from "react";
import { Layout } from "./components/Layout";

export function App() {
  const [_settingsOpen, setSettingsOpen] = useState(false);

  return <Layout onOpenSettings={() => setSettingsOpen(true)} />;
}
