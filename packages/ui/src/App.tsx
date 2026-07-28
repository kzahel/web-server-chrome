import type { ReactNode } from "react";
import { Layout } from "./components/Layout";

interface AppProps {
  notification?: ReactNode;
}

export function App({ notification }: AppProps = {}) {
  return <Layout notification={notification} />;
}
