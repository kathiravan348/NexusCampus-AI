import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { applyTheme, getStoredTheme } from "@nexus/ui-core";
import { brand } from "@nexus/brand";
import { DATA_MODE } from "@nexus/services";
import { App } from "./App";

async function start(): Promise<void> {
  applyTheme(getStoredTheme());
  document.title = brand.name;

  if (DATA_MODE === "mock") {
    // The mock API must answer before the first request; only mock builds load MSW.
    const { worker } = await import("@nexus/mocks/browser");
    await worker.start({ onUnhandledFrame: "bypass" });
  }

  const rootElement = document.getElementById("root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

void start();
