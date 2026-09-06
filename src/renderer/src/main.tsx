import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PrintHost } from "./print/PrintHost";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");

const isPrint = window.location.hash === "#print";

createRoot(rootEl).render(
  <StrictMode>{isPrint ? <PrintHost /> : <App />}</StrictMode>,
);
