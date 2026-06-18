import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useMe } from "../lib/queries";

// RequireAuth renders its children only for an authenticated user. While the
// session is loading it shows nothing; on failure it redirects to /login.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isPending, isError, data } = useMe();

  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-gray-500">Loading…</div>
    );
  }
  if (isError || !data) {
    return <Navigate to="/login" />;
  }
  return <>{children}</>;
}
