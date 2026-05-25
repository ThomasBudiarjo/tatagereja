import { createSignal, createEffect, Show } from "solid-js";
import { useNavigate, A } from "@solidjs/router";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { api, ApiError } from "../api/client";
import { Spinner } from "../components/ui";
import { IconShield, IconChevronRight, IconCircleAlert } from "../components/icons";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void },
      ) => string;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile load failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const inputBase =
  "w-full px-3.5 py-2 bg-surface-raised border rounded-lg text-sm transition-all focus:outline-none focus:ring-2";
const inputOk = "border-line-strong focus:border-sage-700 focus:ring-sage-600/15";
const inputErr = "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20";

function fieldClass(hasError: boolean) {
  return `${inputBase} ${hasError ? inputErr : inputOk}`;
}

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [passwordConfirm, setPasswordConfirm] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [churchName, setChurchName] = createSignal("");
  const [token, setToken] = createSignal("");
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [formError, setFormError] = createSignal("");
  let widgetEl: HTMLDivElement | undefined;
  let rendered = false;

  const config = useQuery(() => ({
    queryKey: ["config"],
    queryFn: () => api.get<{ turnstile_site_key: string }>("/config"),
    staleTime: Infinity,
  }));

  createEffect(() => {
    const siteKey = config.data?.turnstile_site_key;
    if (!siteKey || !widgetEl || rendered) return;
    rendered = true;
    void loadTurnstile().then(() => {
      window.turnstile?.render(widgetEl!, { sitekey: siteKey, callback: setToken });
    });
  });

  const signup = useMutation(() => ({
    mutationFn: () =>
      api.post("/auth/signup", {
        email: email(),
        password: password(),
        password_confirm: passwordConfirm(),
        display_name: displayName(),
        church_name: churchName(),
        turnstile_token: token(),
      }),
    onSuccess: () => navigate("/login", { replace: true }),
    onError: (err) => {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else setFormError(err instanceof Error ? err.message : "Gagal mendaftar");
    },
  }));

  const submit = (e: Event) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    signup.mutate();
  };

  return (
    <main class="relative grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      <div class="absolute inset-0 z-0 bg-[radial-gradient(oklch(0.86_0.01_110)_1px,transparent_1px)] [background-size:18px_18px] opacity-50" />
      <div class="absolute left-[-10%] top-[-20%] z-0 h-[500px] w-[500px] rounded-full bg-sage-100/40 blur-[120px]" />
      <div class="absolute bottom-[-20%] right-[-10%] z-0 h-[500px] w-[500px] rounded-full bg-sage-50/60 blur-[120px]" />

      <div class="relative z-10 my-8 w-full max-w-[420px] overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_15px_40px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.03)] transition-shadow duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)]">
        <div class="px-8 pb-7 pt-9">
          <div class="mb-6 flex flex-col items-center">
            <h1 class="text-xl font-semibold tracking-tight text-ink">Daftar akun</h1>
            <p class="mt-1.5 text-center text-sm leading-relaxed text-ink-muted">
              Siapkan data gereja dalam satu ruang kerja.
            </p>
          </div>

          <Show when={formError() || errors()._form}>
            <div class="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-100 bg-rose-50 p-3.5 text-sm text-rose-700">
              <span class="mt-px shrink-0">
                <IconCircleAlert class="h-4 w-4" />
              </span>
              <span class="font-medium leading-snug">{formError() || errors()._form}</span>
            </div>
          </Show>

          <form onSubmit={submit} class="space-y-4">
            <div>
              <label for="email" class="mb-1.5 block text-xs font-semibold text-ink-muted">Email</label>
              <input
                type="email"
                id="email"
                autocomplete="email"
                required
                placeholder="nama@contoh.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class={fieldClass(!!errors().Email)}
              />
              <Show when={errors().Email}>
                <p class="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <IconCircleAlert class="h-3.5 w-3.5 shrink-0" />
                  <span>{errors().Email}</span>
                </p>
              </Show>
            </div>

            <div>
              <label for="display_name" class="mb-1.5 block text-xs font-semibold text-ink-muted">Nama</label>
              <input
                type="text"
                id="display_name"
                autocomplete="name"
                required
                placeholder="Nama Lengkap"
                value={displayName()}
                onInput={(e) => setDisplayName(e.currentTarget.value)}
                class={fieldClass(!!errors().DisplayName)}
              />
              <Show when={errors().DisplayName}>
                <p class="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <IconCircleAlert class="h-3.5 w-3.5 shrink-0" />
                  <span>{errors().DisplayName}</span>
                </p>
              </Show>
            </div>

            <div>
              <label for="church_name" class="mb-1.5 block text-xs font-semibold text-ink-muted">Nama gereja</label>
              <input
                type="text"
                id="church_name"
                autocomplete="organization"
                required
                placeholder="Contoh: GKI Batavia"
                value={churchName()}
                onInput={(e) => setChurchName(e.currentTarget.value)}
                class={fieldClass(!!errors().ChurchName)}
              />
              <Show when={errors().ChurchName}>
                <p class="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <IconCircleAlert class="h-3.5 w-3.5 shrink-0" />
                  <span>{errors().ChurchName}</span>
                </p>
              </Show>
            </div>

            <div>
              <label for="password" class="mb-1.5 block text-xs font-semibold text-ink-muted">Kata sandi</label>
              <input
                type="password"
                id="password"
                autocomplete="new-password"
                required
                minlength="8"
                placeholder="Minimal 8 karakter"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                class={fieldClass(!!errors().Password)}
              />
              <Show
                when={errors().Password}
                fallback={<p class="mt-1 text-2xs text-ink-soft">Minimal 8 karakter.</p>}
              >
                <p class="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <IconCircleAlert class="h-3.5 w-3.5 shrink-0" />
                  <span>{errors().Password}</span>
                </p>
              </Show>
            </div>

            <div>
              <label for="password_confirm" class="mb-1.5 block text-xs font-semibold text-ink-muted">
                Konfirmasi kata sandi
              </label>
              <input
                type="password"
                id="password_confirm"
                autocomplete="new-password"
                required
                placeholder="Ulangi kata sandi"
                value={passwordConfirm()}
                onInput={(e) => setPasswordConfirm(e.currentTarget.value)}
                class={fieldClass(!!errors().PasswordConfirm)}
              />
              <Show when={errors().PasswordConfirm}>
                <p class="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                  <IconCircleAlert class="h-3.5 w-3.5 shrink-0" />
                  <span>{errors().PasswordConfirm}</span>
                </p>
              </Show>
            </div>

            <div class="flex justify-center pt-2">
              <div ref={widgetEl} />
            </div>

            <button
              type="submit"
              disabled={signup.isPending}
              class="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-sage-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sage-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
            >
              <Show when={signup.isPending} fallback={<span>Daftar</span>}>
                <Spinner />
                <span>Daftar</span>
              </Show>
              <Show when={!signup.isPending}>
                <IconChevronRight class="h-4 w-4" />
              </Show>
            </button>
          </form>
        </div>

        <div class="flex justify-center border-t border-line bg-surface-muted/75 px-8 py-4 text-sm text-ink-muted">
          <span>Sudah punya akun?</span>
          <A href="/login" class="ml-1.5 font-semibold text-ink transition-colors hover:text-sage-800 hover:underline">
            Masuk
          </A>
        </div>

        <div class="flex select-none items-center justify-center gap-1.5 border-t border-line bg-surface-muted/75 px-8 py-3.5 text-2xs text-ink-soft">
          <span>Presented to you by</span>
          <span class="flex items-center gap-1 font-bold tracking-tight text-ink-muted">
            <IconShield class="h-3.5 w-3.5" />
            <span>tatagereja</span>
          </span>
        </div>
      </div>
    </main>
  );
}
