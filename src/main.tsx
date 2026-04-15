import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

window.addEventListener("unhandledrejection", (event) => {
  console.error("Erro não tratado:", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
