import { useControlText } from "@nexus/i18n/control";
import { lazy, Suspense } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { Home } from "../pages/Home";
import { NotFound } from "../pages/NotFound";
import { SignIn } from "../pages/SignIn";
import { CONTROL_MODULES, type ControlModuleEntry } from "./modules";
import { Shell } from "./Shell";
import { StaffGuard } from "./StaffGuard";

function ScreenLoading() {
  const t = useControlText();
  return (
    <p role="status" className="text-body text-text-secondary">
      {t("common.loading")}
    </p>
  );
}

function moduleRoute(entry: ControlModuleEntry): RouteObject {
  const Screen = lazy(entry.load);
  return {
    path: `${entry.path}/*`,
    element: (
      <StaffGuard module={entry}>
        <Suspense fallback={<ScreenLoading />}>
          <Screen />
        </Suspense>
      </StaffGuard>
    ),
  };
}

/** Sign-in, then the shell with home, one lazy route per Control page, and not found. */
export function controlRoutes(
  modules: readonly ControlModuleEntry[] = CONTROL_MODULES,
): RouteObject[] {
  return [
    { path: "/sign-in", element: <SignIn /> },
    {
      path: "/",
      element: (
        <StaffGuard>
          <Shell modules={modules} />
        </StaffGuard>
      ),
      children: [
        { index: true, element: <Home /> },
        ...modules.map(moduleRoute),
        { path: "*", element: <NotFound /> },
      ],
    },
  ];
}

export function createControlRouter(modules: readonly ControlModuleEntry[] = CONTROL_MODULES) {
  return createBrowserRouter(controlRoutes(modules));
}
