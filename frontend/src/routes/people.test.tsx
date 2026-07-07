// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { PeoplePage } from "./people";

const createMutateAsync = vi.fn();

vi.mock("../lib/people-queries", () => ({
  usePersons: () => ({
    data: [
      { id: "p1", name: "Andi", phone: "0811", notes: "" },
      { id: "p2", name: "Budi", phone: "0812", notes: "tenor" },
    ],
    isPending: false,
  }),
  useCreatePerson: () => ({ mutateAsync: createMutateAsync }),
  useUpdatePerson: () => ({ mutateAsync: vi.fn() }),
  useDeletePerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

it("renders the person list", () => {
  render(<PeoplePage />);

  expect(screen.getByText("Andi")).toBeInTheDocument();
  expect(screen.getByText("Budi")).toBeInTheDocument();
  expect(screen.getByText("tenor")).toBeInTheDocument();
});

it("filters the list by name", async () => {
  const user = userEvent.setup();
  render(<PeoplePage />);

  await user.type(screen.getByPlaceholderText(/cari nama/i), "bud");

  expect(screen.queryByText("Andi")).not.toBeInTheDocument();
  expect(screen.getByText("Budi")).toBeInTheDocument();
});

it("rejects an empty name and does not call the mutation", async () => {
  const user = userEvent.setup();
  render(<PeoplePage />);

  await user.click(screen.getByRole("button", { name: /tambah/i }));

  expect(await screen.findByText(/nama wajib diisi/i)).toBeInTheDocument();
  expect(createMutateAsync).not.toHaveBeenCalled();
});

it("submits a new person to the create mutation", async () => {
  createMutateAsync.mockResolvedValueOnce({ id: "p3", name: "Citra", phone: "", notes: "" });
  const user = userEvent.setup();
  render(<PeoplePage />);

  await user.type(screen.getByLabelText(/nama/i), "Citra");
  await user.click(screen.getByRole("button", { name: /tambah/i }));

  expect(createMutateAsync).toHaveBeenCalledWith({ name: "Citra", phone: "", notes: "" });
});
