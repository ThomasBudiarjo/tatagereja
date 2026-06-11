import { JSX, Show } from "solid-js";

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export const btnPrimary =
  "inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

export const btnDanger =
  "inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700";

export function PageHeader(props: { title: string; subtitle?: string; children?: JSX.Element }) {
  return (
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">{props.title}</h1>
        <Show when={props.subtitle}>
          <p class="mt-1 text-sm text-slate-500">{props.subtitle}</p>
        </Show>
      </div>
      <div class="flex items-center gap-2">{props.children}</div>
    </div>
  );
}

export function Card(props: { title?: string; children: JSX.Element; class?: string }) {
  return (
    <div class={`rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 ${props.class ?? ""}`}>
      <Show when={props.title}>
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{props.title}</h2>
      </Show>
      {props.children}
    </div>
  );
}

export function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class="block">
      <span class="mb-1 block text-sm font-medium text-slate-700">{props.label}</span>
      {props.children}
    </label>
  );
}

export function ErrorNote(props: { message: string }) {
  return (
    <Show when={props.message}>
      <div class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{props.message}</div>
    </Show>
  );
}

export function Modal(props: { open: boolean; title: string; onClose: () => void; children: JSX.Element }) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16" onClick={props.onClose}>
        <div class="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900">{props.title}</h2>
            <button class="text-slate-400 hover:text-slate-600" onClick={props.onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {props.children}
        </div>
      </div>
    </Show>
  );
}

export function StatusBadge(props: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-slate-100 text-slate-600",
    moved: "bg-amber-100 text-amber-800",
    deceased: "bg-slate-200 text-slate-500",
    guest: "bg-blue-100 text-blue-800",
  };
  return (
    <span class={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[props.status] ?? "bg-slate-100 text-slate-600"}`}>
      {props.status}
    </span>
  );
}

export function EmptyState(props: { message: string }) {
  return <p class="py-8 text-center text-sm text-slate-400">{props.message}</p>;
}
