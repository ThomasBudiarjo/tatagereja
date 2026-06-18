// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RequireAuth } from "./guard";
import { useMe } from "../lib/queries";

vi.mock("../lib/queries", () => ({ useMe: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div>redirect:{to}</div>,
}));

const mockedUseMe = vi.mocked(useMe);

it("redirects to /login when not authenticated", () => {
  mockedUseMe.mockReturnValue({ isPending: false, isError: true, data: undefined } as ReturnType<
    typeof useMe
  >);
  render(
    <RequireAuth>
      <div>secret content</div>
    </RequireAuth>,
  );
  expect(screen.getByText("redirect:/login")).toBeInTheDocument();
  expect(screen.queryByText("secret content")).not.toBeInTheDocument();
});

it("renders children when authenticated", () => {
  mockedUseMe.mockReturnValue({
    isPending: false,
    isError: false,
    data: { id: "u1", email: "a@b.com" },
  } as ReturnType<typeof useMe>);
  render(
    <RequireAuth>
      <div>secret content</div>
    </RequireAuth>,
  );
  expect(screen.getByText("secret content")).toBeInTheDocument();
});
