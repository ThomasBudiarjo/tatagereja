import { afterEach, expect, it, vi } from "vitest";
import { apiFetch, UnauthorizedError } from "./api";
import { UserSchema } from "./schemas";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("parses a valid success body with the schema", async () => {
  mockFetch(200, { id: "u1", email: "a@b.com" });
  const user = await apiFetch("/api/me", UserSchema);
  expect(user).toEqual({ id: "u1", email: "a@b.com" });
});

it("always sends credentials", async () => {
  const fn = mockFetch(200, { id: "u1", email: "a@b.com" });
  await apiFetch("/api/me", UserSchema);
  expect(fn).toHaveBeenCalledWith("/api/me", expect.objectContaining({ credentials: "include" }));
});

it("serializes a JSON body and sets the content-type", async () => {
  const fn = mockFetch(201, { id: "u1", email: "a@b.com" });
  await apiFetch("/api/auth/register", UserSchema, {
    method: "POST",
    body: { email: "a@b.com", password: "password123" },
  });
  expect(fn).toHaveBeenCalledWith(
    "/api/auth/register",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email: "a@b.com", password: "password123" }),
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
    }),
  );
});

it("throws UnauthorizedError on 401", async () => {
  mockFetch(401, { error: "unauthorized" });
  await expect(apiFetch("/api/me", UserSchema)).rejects.toBeInstanceOf(UnauthorizedError);
});

it("throws ApiError with the server message on 5xx", async () => {
  mockFetch(500, { error: "boom" });
  await expect(apiFetch("/api/me", UserSchema)).rejects.toMatchObject({
    name: "ApiError",
    status: 500,
    message: "boom",
  });
});

it("throws when the success body fails schema validation", async () => {
  mockFetch(200, { id: 123 });
  await expect(apiFetch("/api/me", UserSchema)).rejects.toThrow();
});
