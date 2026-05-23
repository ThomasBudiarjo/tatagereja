import { createSignal, Show } from "solid-js";
import { useNavigate, A } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { api, ApiError } from "../api/client";
import { TextField, PrimaryButton, ErrorState } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [formError, setFormError] = createSignal("");

  const login = useMutation(() => ({
    mutationFn: () => api.post("/auth/login", { email: email(), password: password() }),
    onSuccess: () => navigate("/jemaat", { replace: true }),
    onError: (err) => {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else setFormError(err instanceof Error ? err.message : "Gagal masuk");
    },
  }));

  const submit = (e: Event) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    login.mutate();
  };

  return (
    <div class="flex min-h-screen items-center justify-center px-4">
      <div class="w-full max-w-sm">
        <h1 class="mb-1 text-3xl font-bold tracking-tight text-ink">Masuk</h1>
        <p class="mb-6 text-sm text-ink-soft">Kelola data gereja Anda</p>
        <form onSubmit={submit} class="space-y-4 rounded-2xl border border-line bg-surface-raised p-6 shadow-sm">
          <Show when={formError()}>
            <ErrorState message={formError()} />
          </Show>
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
            autocomplete="current-password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            error={errors().Password}
            required
          />
          <PrimaryButton type="submit" loading={login.isPending} class="w-full">
            Masuk
          </PrimaryButton>
        </form>
        <p class="mt-4 text-center text-sm text-ink-soft">
          Belum punya akun?{" "}
          <A href="/signup" class="font-semibold text-sage-700 hover:underline">
            Daftar
          </A>
        </p>
      </div>
    </div>
  );
}
