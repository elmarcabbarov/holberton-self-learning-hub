import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Today } from "./routes/Today.tsx";
import { Settings } from "./routes/Settings.tsx";
import { Placeholder } from "./routes/Placeholder.tsx";
import { Auth } from "./routes/Auth.tsx";
import { Spaces } from "./routes/Spaces.tsx";
import { SpaceDetailPage } from "./routes/SpaceDetail.tsx";
import { Notes } from "./routes/Notes.tsx";
import { NoteEditorPage } from "./routes/NoteEditor.tsx";
import { AuthGate } from "./components/AuthGate.tsx";

const root = createRootRoute({ component: AuthGate, notFoundComponent: () => <Placeholder titleKey="errors.notFound" /> });

const routes = [
  createRoute({ getParentRoute: () => root, path: "/auth", component: Auth }),
  createRoute({ getParentRoute: () => root, path: "/", component: Today }),
  createRoute({ getParentRoute: () => root, path: "/spaces", component: Spaces }),
  createRoute({ getParentRoute: () => root, path: "/spaces/$spaceId", component: SpaceDetailPage }),
  createRoute({ getParentRoute: () => root, path: "/notes", component: Notes }),
  createRoute({ getParentRoute: () => root, path: "/notes/$noteId", component: NoteEditorPage }),
  createRoute({ getParentRoute: () => root, path: "/review", component: () => <Placeholder titleKey="nav.review" /> }),
  createRoute({ getParentRoute: () => root, path: "/settings", component: Settings }),
];

export const router = createRouter({ routeTree: root.addChildren(routes) });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
