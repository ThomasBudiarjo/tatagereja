import { JSX, Show, splitProps } from "solid-js";

export function Spinner(props: { class?: string }) {
  return (
    <svg
      class={props.class ?? "h-4 w-4 animate-spin"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
    >
      <circle cx="12" cy="12" r="9" class="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
    </svg>
  );
}

export function FullSpinner() {
  return (
    <div class="flex min-h-[50vh] items-center justify-center text-ink-soft">
      <Spinner class="h-6 w-6 animate-spin" />
    </div>
  );
}

export function PageHeader(props: { title: string; actions?: JSX.Element }) {
  return (
    <div class="mb-5 hidden items-center justify-between md:flex">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">{props.title}</h1>
      <Show when={props.actions}>{props.actions}</Show>
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

export function PrimaryButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean },
) {
  const [local, rest] = splitProps(props, ["loading", "children", "class"]);
  return (
    <button
      {...rest}
      class={`${btnBase} bg-sage-600 text-white hover:bg-sage-700 ${local.class ?? ""}`}
      disabled={rest.disabled || local.loading}
    >
      <Show when={local.loading}>
        <Spinner />
      </Show>
      {local.children}
    </button>
  );
}

const labelCls = "block text-xs font-semibold text-ink-muted mb-1.5";
const inputCls =
  "w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-md text-ink outline-none transition-colors focus:border-sage-600 focus:ring-2 focus:ring-sage-100";

export function FieldError(props: { msg?: string }) {
  return (
    <Show when={props.msg}>
      <p class="mt-1 text-xs text-rose-600">{props.msg}</p>
    </Show>
  );
}

export function TextField(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string },
) {
  const [local, rest] = splitProps(props, ["label", "error", "class"]);
  return (
    <div>
      <label class={labelCls}>{local.label}</label>
      <input {...rest} class={inputCls} />
      <FieldError msg={local.error} />
    </div>
  );
}

export function TextArea(
  props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string },
) {
  const [local, rest] = splitProps(props, ["label", "error", "class"]);
  return (
    <div>
      <label class={labelCls}>{local.label}</label>
      <textarea {...rest} class={`${inputCls} min-h-20`} />
      <FieldError msg={local.error} />
    </div>
  );
}

export function SelectField(
  props: JSX.SelectHTMLAttributes<HTMLSelectElement> & {
    label: string;
    error?: string;
    children: JSX.Element;
  },
) {
  const [local, rest] = splitProps(props, ["label", "error", "class", "children"]);
  return (
    <div>
      <label class={labelCls}>{local.label}</label>
      <select {...rest} class={inputCls}>
        {local.children}
      </select>
      <FieldError msg={local.error} />
    </div>
  );
}

export function EmptyState(props: { message: string }) {
  return (
    <div class="rounded-xl border border-dashed border-line bg-surface-raised/50 p-10 text-center text-sm text-ink-soft">
      {props.message}
    </div>
  );
}

export function ErrorState(props: { message: string }) {
  return (
    <div class="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
      {props.message}
    </div>
  );
}
