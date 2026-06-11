import { JSX, Show, For, onMount } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { me, loadMe, logout } from "../lib/session";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/members", label: "Members (Jemaat)", icon: "👤" },
  { href: "/families", label: "Families (Keluarga)", icon: "👨‍👩‍👧" },
  { href: "/services", label: "Services (Ibadah)", icon: "⛪" },
  { href: "/attendance", label: "Attendance (Kehadiran)", icon: "✅" },
  { href: "/reports", label: "Reports (Laporan)", icon: "📈" },
  { href: "/settings", label: "Settings (Pengaturan)", icon: "⚙️" },
];

export default function AppLayout(props: { children?: JSX.Element }) {
  const navigate = useNavigate();

  onMount(async () => {
    if (me() === undefined) {
      const session = await loadMe();
      if (!session) navigate("/login", { replace: true });
    } else if (me() === null) {
      navigate("/login", { replace: true });
    }
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <Show when={me()} fallback={<div class="flex h-screen items-center justify-center text-slate-400">Loading…</div>}>
      <div class="flex min-h-screen">
        <aside class="hidden w-64 shrink-0 flex-col bg-slate-900 text-slate-200 md:flex">
          <div class="px-5 py-5">
            <div class="text-lg font-bold text-white">TataGereja</div>
            <div class="mt-0.5 truncate text-xs text-slate-400">{me()?.church.name}</div>
          </div>
          <nav class="flex-1 space-y-1 px-3">
            <For each={NAV}>
              {(item) => (
                <A
                  href={item.href}
                  end={item.href === "/"}
                  class="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-slate-800"
                  activeClass="bg-slate-800 font-medium text-white"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </A>
              )}
            </For>
          </nav>
          <div class="border-t border-slate-800 p-4 text-xs text-slate-400">
            Free &amp; simple church management
          </div>
        </aside>

        <div class="flex min-w-0 flex-1 flex-col">
          <header class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
            <div class="font-semibold text-slate-700 md:hidden">TataGereja</div>
            <nav class="flex gap-3 overflow-x-auto text-sm md:hidden">
              <For each={NAV}>{(item) => <A href={item.href} class="whitespace-nowrap text-slate-600">{item.label.split(" ")[0]}</A>}</For>
            </nav>
            <div class="ml-auto flex items-center gap-4">
              <span class="text-sm text-slate-600">
                {me()?.user.name} <span class="text-xs text-slate-400">({me()?.user.role})</span>
              </span>
              <button class="text-sm text-indigo-600 hover:underline" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </header>
          <main class="flex-1 p-6">{props.children}</main>
        </div>
      </div>
    </Show>
  );
}
