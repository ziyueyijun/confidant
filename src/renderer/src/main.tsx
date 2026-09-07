import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PrintHost } from "./print/PrintHost";
import { PreferencesHost } from "./preferences/PreferencesHost";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");

const hash = window.location.hash;
const isPrint = hash === "#print";
const isPreferences = hash === "#preferences";

createRoot(rootEl).render(
  <StrictMode>
    {isPrint ? <PrintHost /> : isPreferences ? <PreferencesHost /> : <App />}
  </StrictMode>,
);
