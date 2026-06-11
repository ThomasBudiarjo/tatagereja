import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../lib/api";
import { loadMe } from "../lib/session";
import { inputCls, btnPrimary, Field, ErrorNote } from "../components/ui";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = createSignal<"login" | "register">("login");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [name, setName] = createSignal("");
  const [churchName, setChurchName] = createSignal("");

  const submit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode() === "login") {
        await api.post("/auth/login", { email: email(), password: password() });
      } else {
        await api.post("/auth/register", {
          church_name: churchName(),
          name: name(),
          email: email(),
          password: password(),
        });
      }
      await loadMe();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md">
        <div class="mb-6 text-center">
          <h1 class="text-3xl font-bold text-slate-900">TataGereja</h1>
          <p class="mt-1 text-sm text-slate-500">Free &amp; simple church management</p>
        </div>
        <form class="space-y-4 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200" onSubmit={submit}>
          <ErrorNote message={error()} />
          <Show when={mode() === "register"}>
            <Field label="Church name">
              <input class={inputCls} value={churchName()} onInput={(e) => setChurchName(e.currentTarget.value)} required placeholder="GKI Anugerah" />
            </Field>
            <Field label="Your name">
              <input class={inputCls} value={name()} onInput={(e) => setName(e.currentTarget.value)} required />
            </Field>
          </Show>
          <Field label="Email">
            <input class={inputCls} type="email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} required />
          </Field>
          <Field label="Password">
            <input class={inputCls} type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} required minLength={mode() === "register" ? 8 : undefined} />
          </Field>
          <button class={`${btnPrimary} w-full justify-center`} type="submit" disabled={busy()}>
            {busy() ? "Please wait…" : mode() === "login" ? "Log in" : "Create church account"}
          </button>
          <p class="text-center text-sm text-slate-500">
            <Show
              when={mode() === "login"}
              fallback={
                <>
                  Already have an account?{" "}
                  <button type="button" class="text-indigo-600 hover:underline" onClick={() => setMode("login")}>
                    Log in
                  </button>
                </>
              }
            >
              New church?{" "}
              <button type="button" class="text-indigo-600 hover:underline" onClick={() => setMode("register")}>
                Register your church
              </button>
            </Show>
          </p>
        </form>
      </div>
    </div>
  );
}
