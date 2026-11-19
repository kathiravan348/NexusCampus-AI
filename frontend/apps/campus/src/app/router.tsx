import { useText } from "@nexus/i18n";
import { lazy, Suspense } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { Home } from "../pages/Home";
import { NotFound } from "../pages/NotFound";
import { SignIn } from "../pages/SignIn";
import { MODULES, type ModuleEntry } from "./modules";
import { RouteGuard } from "./RouteGuard";
import { Shell } from "./Shell";

function ScreenLoading() {
  const t = useText();
  return (
    <p role="status" className="text-body text-text-secondary">
      {t("common.loading")}
    </p>
  );
}

function moduleRoute(entry: ModuleEntry): RouteObject {
  const Screen = lazy(entry.load);
  return {
    path: entry.path,
    element: (
      <RouteGuard module={entry}>
        <Suspense fallback={<ScreenLoading />}>
          <Screen />
        </Suspense>
      </RouteGuard>
    ),
  };
}

/** Sign-in, then the shell with home, one lazy route per module, and not found. */
export function appRoutes(modules: readonly ModuleEntry[] = MODULES): RouteObject[] {
  return [
    { path: "/sign-in", element: <SignIn /> },
    {
      path: "/",
      element: (
        <RouteGuard>
          <Shell modules={modules} />
        </RouteGuard>
      ),
      children: [
        { index: true, element: <Home /> },
        ...modules.map(moduleRoute),
        { path: "*", element: <NotFound /> },
      ],
    },
  ];
}

export function createAppRouter(modules: readonly ModuleEntry[] = MODULES) {
  return createBrowserRouter(appRoutes(modules));
}
