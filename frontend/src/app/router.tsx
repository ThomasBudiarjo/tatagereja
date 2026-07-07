import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppLayout } from "../components/app-layout";
import { LoginPage } from "../routes/login";
import { PeoplePage } from "../routes/people";
import { RegisterPage } from "../routes/register";
import { RolesPage } from "../routes/roles";
import { SchedulePage } from "../routes/schedule";
import { ServiceDetailPage } from "../routes/service-detail";
import { RequireAuth } from "./guard";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <main className="grid min-h-screen place-items-center">Page not found</main>
  ),
});

// Pathless layout: every child renders inside the authenticated app shell.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: () => (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: SchedulePage,
});

const peopleRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/people",
  component: PeoplePage,
});

const rolesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/roles",
  component: RolesPage,
});

const serviceDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/services/$serviceId",
  component: ServiceDetailPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
});

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([indexRoute, peopleRoute, rolesRoute, serviceDetailRoute]),
  loginRoute,
  registerRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
