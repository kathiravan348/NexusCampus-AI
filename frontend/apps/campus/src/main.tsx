import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { applyTheme, getStoredTheme } from "@nexus/ui-core";
import { brand } from "@nexus/brand";
import { DATA_MODE } from "@nexus/services";
import { App } from "./App";
import { bootMark, reportBoot } from "./bootTiming";

async function start(): Promise<void> {
  bootMark("entry");
  applyTheme(getStoredTheme());
  document.title = brand.name;

  if (DATA_MODE === "mock") {
    // The mock API must answer before the first request; only mock builds load MSW.
    const { worker } = await import("@nexus/mocks/browser");
    await worker.start({ onUnhandledFrame: "bypass" });
    bootMark("msw-ready");
  }

  const rootElement = document.getElementById("root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    // After React's first commit (the next frame), report navigation start → mounted.
    requestAnimationFrame(() => reportBoot());
  }
}

void start();
