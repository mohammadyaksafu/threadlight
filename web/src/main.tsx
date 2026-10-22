import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { ROUTES } from "./routes";
import { ThreadLightProvider } from "./store/ThreadLightProvider";
import "./styles/index.css";

// Hash routing (#/findings, #/requirements/R1) works on GitHub Pages and any static host with no
// server rewrites.
const router = createHashRouter(ROUTES);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThreadLightProvider>
      <RouterProvider router={router} />
    </ThreadLightProvider>
  </StrictMode>,
);
