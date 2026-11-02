import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Today } from "./routes/Today.tsx";
import { Settings } from "./routes/Settings.tsx";
import { Placeholder } from "./routes/Placeholder.tsx";
import { Auth } from "./routes/Auth.tsx";
import { Spaces } from "./routes/Spaces.tsx";
import { SpaceDetailPage } from "./routes/SpaceDetail.tsx";
import { Notes } from "./routes/Notes.tsx";
import { NoteEditorPage } from "./routes/NoteEditor.tsx";
import { Review } from "./routes/Review.tsx";
import { ImportProject } from "./routes/ImportProject.tsx";
import { QuizPage } from "./routes/QuizPage.tsx";
import { AttemptPage } from "./routes/AttemptPage.tsx";
import { AuthGate } from "./components/AuthGate.tsx";

const root = createRootRoute({ component: AuthGate, notFoundComponent: () => <Placeholder titleKey="errors.notFound" /> });

const routes = [
  createRoute({ getParentRoute: () => root, path: "/auth", component: Auth }),
  createRoute({ getParentRoute: () => root, path: "/", component: Today }),
  createRoute({ getParentRoute: () => root, path: "/spaces", component: Spaces }),
  createRoute({ getParentRoute: () => root, path: "/spaces/$spaceId", component: SpaceDetailPage }),
  createRoute({ getParentRoute: () => root, path: "/import", component: ImportProject }),
  createRoute({ getParentRoute: () => root, path: "/notes", component: Notes }),
  createRoute({ getParentRoute: () => root, path: "/notes/$noteId", component: NoteEditorPage }),
  createRoute({
    getParentRoute: () => root, path: "/review", component: Review,
    validateSearch: (s: Record<string, unknown>): { space?: string } => (typeof s.space === "string" && /^[0-9a-f-]{36}$/.test(s.space) ? { space: s.space } : {}),
  }),
  createRoute({ getParentRoute: () => root, path: "/quizzes/$quizId", component: QuizPage }),
  createRoute({ getParentRoute: () => root, path: "/attempts/$attemptId", component: AttemptPage }),
  createRoute({ getParentRoute: () => root, path: "/settings", component: Settings }),
];

export const router = createRouter({ routeTree: root.addChildren(routes) });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
