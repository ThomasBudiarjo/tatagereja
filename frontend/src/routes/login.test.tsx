// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LoginPage } from "./login";

const mutateAsync = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("../lib/queries", () => ({
  useLogin: () => ({ mutateAsync }),
}));

it("shows validation errors on empty submit and does not call the mutation", async () => {
  const user = userEvent.setup();
  render(<LoginPage />);

  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
  expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  expect(mutateAsync).not.toHaveBeenCalled();
});

it("submits valid credentials to the login mutation", async () => {
  mutateAsync.mockResolvedValueOnce({ id: "u1", email: "a@b.com" });
  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText(/email/i), "a@b.com");
  await user.type(screen.getByLabelText(/password/i), "password123");
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(mutateAsync).toHaveBeenCalledWith({ email: "a@b.com", password: "password123" });
});
