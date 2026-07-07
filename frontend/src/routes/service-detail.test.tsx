// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ServiceDetailPage } from "./service-detail";

const assignMutateAsync = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ serviceId: "s1" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("../lib/people-queries", () => ({
  usePersons: () => ({
    data: [{ id: "p1", name: "Budi", phone: "", notes: "" }],
  }),
}));

vi.mock("../lib/schedule-queries", () => ({
  useService: () => ({
    data: {
      id: "s1",
      pelayananTypeCode: "ibadah_umum",
      pelayananTypeName: "Ibadah Umum",
      date: "2026-07-05",
      startTime: "09:00",
      title: "",
      notes: "",
      assignments: [
        {
          id: "a1",
          personId: "p9",
          personName: "Andi",
          roleCode: "worship_leader",
          roleName: "Worship Leader",
        },
      ],
    },
    isPending: false,
    isError: false,
  }),
  usePelayananTypes: () => ({ data: [{ code: "ibadah_umum", name: "Ibadah Umum" }] }),
  useRoles: () => ({
    data: [{ code: "singer", name: "Singer", sortOrder: 20 }],
  }),
  useAssign: () => ({ mutateAsync: assignMutateAsync }),
  useUnassign: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn() }),
  useDeleteService: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

it("renders the service header and roster", () => {
  render(<ServiceDetailPage />);

  expect(screen.getByRole("heading", { name: /ibadah umum/i })).toBeInTheDocument();
  expect(screen.getByText("Andi")).toBeInTheDocument();
  expect(screen.getByText("Worship Leader")).toBeInTheDocument();
});

it("assigns a person and surfaces double-booking warnings as toasts", async () => {
  assignMutateAsync.mockResolvedValueOnce({
    assignment: {
      id: "a2",
      personId: "p1",
      personName: "Budi",
      roleCode: "singer",
      roleName: "Singer",
    },
    warnings: ["Budi sudah terjadwal sebagai Singer di Ibadah Umum 17:00 pada tanggal yang sama"],
  });
  const user = userEvent.setup();
  render(<ServiceDetailPage />);

  await user.selectOptions(screen.getByLabelText(/peran/i), "singer");
  await user.selectOptions(screen.getByLabelText(/jemaat/i), "p1");
  await user.click(screen.getByRole("button", { name: /^tambah$/i }));

  expect(assignMutateAsync).toHaveBeenCalledWith({ personId: "p1", roleCode: "singer" });
  expect(toast.warning).toHaveBeenCalledWith(
    "Budi sudah terjadwal sebagai Singer di Ibadah Umum 17:00 pada tanggal yang sama",
  );
});
