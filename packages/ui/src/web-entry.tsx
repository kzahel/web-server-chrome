import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { HttpServerManager } from "./lib/http-server-manager";
import { ServerManagerProvider } from "./lib/server-manager-context";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const token = params.get("token") ?? undefined;

const manager = new HttpServerManager({ authToken: token });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ServerManagerProvider manager={manager}>
      <App />
    </ServerManagerProvider>
  </React.StrictMode>,
);
