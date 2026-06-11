import { createSignal } from "solid-js";
import { api } from "./api";
import type { Me } from "./types";

// undefined = not loaded yet, null = not authenticated
const [me, setMe] = createSignal<Me | null | undefined>(undefined);

export { me };

export async function loadMe(): Promise<Me | null> {
  try {
    const data = await api.get<Me>("/me");
    setMe(data);
    return data;
  } catch {
    setMe(null);
    return null;
  }
}

export async function logout() {
  await api.post("/auth/logout", {});
  setMe(null);
}

export function setSession(data: Me | null) {
  setMe(data);
}
