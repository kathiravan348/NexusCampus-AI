import React from "react";
import ReactDOM from "react-dom/client";
import "@nexus/ui-core/styles.css";
import { applyTheme, getStoredTheme } from "@nexus/ui-core";
import { brand } from "@nexus/brand";
import { App } from "./App";

applyTheme(getStoredTheme());
document.title = brand.name;

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
