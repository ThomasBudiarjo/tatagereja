import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { useLogout, useMe } from "../lib/queries";

const navItems = [
  { to: "/", label: "Jadwal" },
  { to: "/people", label: "Jemaat" },
  { to: "/roles", label: "Peran" },
] as const;

// AppLayout renders the top navigation shared by all authenticated pages.
export function AppLayout() {
  const { data } = useMe();
  const navigate = useNavigate();
  const logout = useLogout();

  const onLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <span className="text-base font-semibold">tatagereja</span>
          <nav className="flex gap-4">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm text-gray-600 hover:text-gray-900 [&.active]:font-medium [&.active]:text-gray-900"
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-gray-600 sm:inline">{data?.email}</span>
            <Button variant="outline" size="sm" onClick={onLogout} disabled={logout.isPending}>
              Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
