import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "./components/AppShell.tsx";
import { Today } from "./routes/Today.tsx";
import { Settings } from "./routes/Settings.tsx";
import { Placeholder } from "./routes/Placeholder.tsx";

const root = createRootRoute({ component: AppShell, notFoundComponent: () => <Placeholder titleKey="errors.notFound" /> });

const routes = [
  createRoute({ getParentRoute: () => root, path: "/", component: Today }),
  createRoute({ getParentRoute: () => root, path: "/spaces", component: () => <Placeholder titleKey="nav.spaces" /> }),
  createRoute({ getParentRoute: () => root, path: "/review", component: () => <Placeholder titleKey="nav.review" /> }),
  createRoute({ getParentRoute: () => root, path: "/settings", component: Settings }),
];

export const router = createRouter({ routeTree: root.addChildren(routes) });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
