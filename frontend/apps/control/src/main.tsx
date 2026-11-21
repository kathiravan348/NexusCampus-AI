import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { brand } from "@nexus/brand";
import { DATA_MODE } from "@nexus/services";
import { applyTheme, getStoredTheme } from "@nexus/ui-core";
import { App } from "./App";

async function start(): Promise<void> {
  applyTheme(getStoredTheme());
  document.title = brand.products.control.name;

  if (DATA_MODE === "mock") {
    // The mock Control API must answer before the first request; only mock builds load MSW.
    const { controlWorker } = await import("@nexus/mocks/control/browser");
    await controlWorker.start({
      onUnhandledFrame: "bypass",
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  }

  const root = document.getElementById("root");
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

void start();
