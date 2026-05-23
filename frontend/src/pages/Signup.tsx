import { createSignal, createEffect, Show } from "solid-js";
import { useNavigate, A } from "@solidjs/router";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { api, ApiError } from "../api/client";
import { TextField, PrimaryButton, ErrorState } from "../components/ui";

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
    <div class="flex min-h-screen items-center justify-center px-4 py-10">
      <div class="w-full max-w-sm">
        <h1 class="mb-1 text-3xl font-bold tracking-tight text-ink">Daftar</h1>
        <p class="mb-6 text-sm text-ink-soft">Buat akun gereja baru</p>
        <form onSubmit={submit} class="space-y-4 rounded-2xl border border-line bg-surface-raised p-6 shadow-sm">
          <Show when={formError() || errors()._form}>
            <ErrorState message={formError() || errors()._form} />
          </Show>
          <TextField
            label="Nama Gereja"
            value={churchName()}
            onInput={(e) => setChurchName(e.currentTarget.value)}
            error={errors().ChurchName}
            required
          />
          <TextField
            label="Nama Anda"
            value={displayName()}
            onInput={(e) => setDisplayName(e.currentTarget.value)}
            error={errors().DisplayName}
            required
          />
          <TextField
            label="Email"
            type="email"
            autocomplete="email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            error={errors().Email}
            required
          />
          <TextField
            label="Kata Sandi"
            type="password"
            autocomplete="new-password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            error={errors().Password}
            required
          />
          <TextField
            label="Konfirmasi Kata Sandi"
            type="password"
            autocomplete="new-password"
            value={passwordConfirm()}
            onInput={(e) => setPasswordConfirm(e.currentTarget.value)}
            error={errors().PasswordConfirm}
            required
          />
          <div ref={widgetEl} />
          <PrimaryButton type="submit" loading={signup.isPending} class="w-full">
            Daftar
          </PrimaryButton>
        </form>
        <p class="mt-4 text-center text-sm text-ink-soft">
          Sudah punya akun?{" "}
          <A href="/login" class="font-semibold text-sage-700 hover:underline">
            Masuk
          </A>
        </p>
      </div>
    </div>
  );
}
