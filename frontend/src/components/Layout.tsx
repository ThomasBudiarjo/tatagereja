import { JSX } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { api } from "../api/client";
import type { User } from "../api/types";
import {
  IconUsers,
  IconHome,
  IconHandHelping,
  IconLayers,
  IconCalendar,
  IconLogout,
  IconShield,
} from "./icons";
import { Spinner } from "./ui";

// SPA-native sections (ported). Sections not yet migrated link to the legacy
// htmx pages at the site root so the app stays fully usable mid-migration.
const spaNav = [
  { href: "/jemaat", label: "Jemaat", icon: IconUsers },
  { href: "/keluarga", label: "Keluarga", icon: IconHome },
];
const legacyNav = [
  { href: "/pelayan", label: "Pelayan", icon: IconHandHelping },
  { href: "/service-types", label: "Tipe Pelayanan", icon: IconLayers },
  { href: "/kebaktian", label: "Kebaktian", icon: IconCalendar },
];

export default function Layout(props: { user: User; children: JSX.Element }) {
  const location = useLocation();
  const logout = useMutation(() => ({
    mutationFn: () => api.post("/auth/logout", {}),
    onSettled: () => window.location.assign("/app/login"),
  }));

  const active = (href: string) => location.pathname.startsWith(`/app${href}`);

  return (
    <div class="flex min-h-screen">
      <aside class="hidden w-60 shrink-0 flex-col border-r border-line bg-surface-raised md:flex">
        <div class="border-b border-line bg-surface-muted/60 px-5 py-5">
          <div class="mb-3 flex select-none items-center gap-1.5 text-ink-soft">
            <span class="text-2xs">Presented to you by</span>
            <span class="flex items-center gap-1 font-bold tracking-tight text-ink-muted">
              <IconShield class="h-3.5 w-3.5" />
              <span class="text-2xs">tatagereja</span>
            </span>
          </div>
          <p class="truncate text-sm font-semibold text-ink">{props.user.church_name}</p>
          <p class="mt-0.5 truncate text-xs text-ink-soft">{props.user.display_name}</p>
        </div>
        <nav class="flex-1 space-y-0.5 px-3 py-4">
          {spaNav.map((item) => (
            <A
              href={item.href}
              class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              classList={{
                "text-sage-800 bg-sage-50": active(item.href),
                "text-ink-muted hover:text-ink hover:bg-surface-muted": !active(item.href),
              }}
            >
              <item.icon class="h-4 w-4" />
              <span>{item.label}</span>
            </A>
          ))}
          {legacyNav.map((item) => (
            <a
              href={item.href}
              class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <item.icon class="h-4 w-4" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div class="border-t border-line p-3">
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-sage-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-sage-700 active:scale-[0.98]"
          >
            {logout.isPending ? <Spinner /> : <IconLogout class="h-3.5 w-3.5" />}
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">
        <header class="sticky top-0 z-30 border-b border-line bg-surface-raised/85 backdrop-blur-md md:hidden">
          <div class="flex items-center justify-between px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-2xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
                {props.user.church_name}
              </p>
              <p class="mt-0.5 truncate text-xl font-semibold tracking-tight text-ink">Tata Gereja</p>
            </div>
          </div>
        </header>

        <main class="flex-1 px-4 pb-6 pt-4 md:px-8 md:py-8">
          <div class="mx-auto w-full max-w-7xl">{props.children}</div>
        </main>
      </div>

      <nav
        class="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface-raised/92 backdrop-blur-md md:hidden"
        aria-label="Navigasi utama"
      >
        <div class="flex items-stretch justify-around px-1 pt-1">
          {spaNav.map((item) => (
            <A
              href={item.href}
              class="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 pb-2 pt-2 transition-colors"
              classList={{
                "text-sage-700": active(item.href),
                "text-ink-soft hover:text-ink-muted": !active(item.href),
              }}
            >
              <item.icon class="h-[22px] w-[22px]" />
              <span class="text-2xs font-medium tracking-wide">{item.label}</span>
            </A>
          ))}
          {legacyNav.map((item) => (
            <a
              href={item.href}
              class="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 pb-2 pt-2 text-ink-soft transition-colors hover:text-ink-muted"
            >
              <item.icon class="h-[22px] w-[22px]" />
              <span class="text-2xs font-medium tracking-wide">{item.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
