import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Fonts ship with the app (no Google Fonts request): faster first paint, works on any network.
import "@fontsource-variable/inter-tight/index.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
