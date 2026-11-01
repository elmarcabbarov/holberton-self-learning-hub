import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "./i18n/index.ts";
import "./styles.css";
import { applyTheme, getTheme } from "./theme.ts";
import { router } from "./router.tsx";
import { captureBootstrapToken } from "./bootstrapToken.ts";

captureBootstrapToken();
applyTheme(getTheme());
// The server is local: one quick retry is enough; longer backoff only delays visible errors.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 300 } } });
const el = document.getElementById("root");
if (!el) throw new Error("#root missing");

createRoot(el).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
