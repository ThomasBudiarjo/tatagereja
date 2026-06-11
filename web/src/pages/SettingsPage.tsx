import { createResource, createSignal, Show } from "solid-js";
import { api } from "../lib/api";
import { loadMe, me } from "../lib/session";
import type { Church } from "../lib/types";
import { PageHeader, Card, Field, ErrorNote, inputCls, btnPrimary } from "../components/ui";

export default function SettingsPage() {
  const [church, { refetch }] = createResource(() => api.get<Church>("/church"));
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);

  const save = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await api.patch<Church>("/church", {
        name: fd.get("name"),
        address: fd.get("address"),
      });
      setSaved(true);
      refetch();
      loadMe(); // refresh church name shown in the sidebar
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    }
  };

  return (
    <div>
      <PageHeader title="Church settings" subtitle="Pengaturan Gereja" />

      <Show when={church()} fallback={<p class="text-slate-400">Loading…</p>}>
        {(c) => (
          <Card class="max-w-xl">
            <form class="space-y-3" onSubmit={save}>
              <ErrorNote message={error()} />
              <Show when={saved()}>
                <div class="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-green-200">Settings saved.</div>
              </Show>
              <Field label="Church name *">
                <input class={inputCls} name="name" value={c().name} required />
              </Field>
              <Field label="Address">
                <textarea class={inputCls} name="address" rows={3} value={c().address} />
              </Field>
              <div class="text-sm text-slate-500">
                Slug: <code class="rounded bg-slate-100 px-1">{c().slug}</code>
              </div>
              <button class={btnPrimary} type="submit">
                Save settings
              </button>
            </form>

            <div class="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
              <p>
                Logged in as <span class="font-medium text-slate-700">{me()?.user.email}</span> with role{" "}
                <span class="font-medium text-slate-700">{me()?.user.role}</span>.
              </p>
            </div>
          </Card>
        )}
      </Show>
    </div>
  );
}
