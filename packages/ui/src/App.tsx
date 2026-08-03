import type { ReactNode } from "react";
import { Layout } from "./components/Layout";

interface AppProps {
  notification?: ReactNode;
  headerAction?: ReactNode;
}

export function App({ notification, headerAction }: AppProps = {}) {
  return <Layout notification={notification} headerAction={headerAction} />;
}
