import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeWorkbench } from "./app/RuntimeWorkbench";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RuntimeWorkbench />
  </StrictMode>,
);
