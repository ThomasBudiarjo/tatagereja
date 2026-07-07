import { valibotResolver } from "@hookform/resolvers/valibot";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { formatDateID } from "../lib/dates";
import { usePersons } from "../lib/people-queries";
import {
  useAssign,
  useDeleteService,
  usePelayananTypes,
  useRoles,
  useService,
  useUnassign,
  useUpdateService,
} from "../lib/schedule-queries";
import {
  AssignInputSchema,
  ServiceInputSchema,
  type AssignInput,
  type Service,
  type ServiceInput,
} from "../lib/schemas";

function EditServiceForm({ service }: { service: Service }) {
  const { data: types } = usePelayananTypes();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ServiceInput>({
    resolver: valibotResolver(ServiceInputSchema),
    defaultValues: {
      pelayananTypeCode: service.pelayananTypeCode,
      date: service.date,
      startTime: service.startTime,
      title: service.title,
      notes: service.notes,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateService.mutateAsync({ id: service.id, input: values });
      toast.success("Perubahan disimpan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    }
  });

  const onDelete = async () => {
    if (!window.confirm("Hapus ibadah ini beserta seluruh jadwal petugasnya?")) {
      return;
    }
    try {
      await deleteService.mutateAsync(service.id);
      toast.success("Ibadah dihapus");
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-type">Jenis Pelayanan</Label>
          <Select id="edit-type" {...register("pelayananTypeCode")}>
            {(types ?? []).map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-date">Tanggal</Label>
          <Input id="edit-date" type="date" {...register("date")} />
          {errors.date && (
            <p role="alert" className="text-sm text-red-600">
              {errors.date.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-time">Jam Mulai</Label>
          <Input id="edit-time" type="time" {...register("startTime")} />
          {errors.startTime && (
            <p role="alert" className="text-sm text-red-600">
              {errors.startTime.message}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-title">Judul (opsional)</Label>
        <Input id="edit-title" {...register("title")} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDelete}
          disabled={deleteService.isPending}
        >
          Hapus Ibadah
        </Button>
      </div>
    </form>
  );
}

function AssignForm({ serviceId }: { serviceId: string }) {
  const { data: roles } = useRoles();
  const { data: persons } = usePersons();
  const assign = useAssign(serviceId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssignInput>({
    resolver: valibotResolver(AssignInputSchema),
    defaultValues: { personId: "", roleCode: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await assign.mutateAsync(values);
      toast.success(`${result.assignment.personName} ditugaskan sebagai ${result.assignment.roleName}`);
      for (const warning of result.warnings) {
        toast.warning(warning);
      }
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menugaskan");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-40 flex-1 flex-col gap-1.5">
        <Label htmlFor="assign-role">Peran</Label>
        <Select id="assign-role" {...register("roleCode")}>
          <option value="">Pilih peran…</option>
          {(roles ?? []).map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </Select>
        {errors.roleCode && (
          <p role="alert" className="text-sm text-red-600">
            {errors.roleCode.message}
          </p>
        )}
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-1.5">
        <Label htmlFor="assign-person">Jemaat</Label>
        <Select id="assign-person" {...register("personId")}>
          <option value="">Pilih jemaat…</option>
          {(persons ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {errors.personId && (
          <p role="alert" className="text-sm text-red-600">
            {errors.personId.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Menugaskan…" : "Tambah"}
      </Button>
    </form>
  );
}

export function ServiceDetailPage() {
  const params = useParams({ strict: false }) as { serviceId?: string };
  const serviceId = params.serviceId ?? "";
  const { data: service, isPending, isError } = useService(serviceId);
  const unassign = useUnassign(serviceId);

  if (isPending) {
    return <p className="text-sm text-gray-600">Memuat…</p>;
  }
  if (isError || !service) {
    return <p className="text-sm text-gray-600">Ibadah tidak ditemukan.</p>;
  }

  const onUnassign = async (assignmentId: string, personName: string) => {
    try {
      await unassign.mutateAsync(assignmentId);
      toast.success(`${personName} dihapus dari jadwal`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus penugasan");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">
          {service.pelayananTypeName}
          {service.title ? ` — ${service.title}` : ""}
        </h1>
        <p className="text-sm text-gray-600">
          {formatDateID(service.date)} · {service.startTime}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detail Ibadah</CardTitle>
        </CardHeader>
        <CardContent>
          <EditServiceForm key={service.id} service={service} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Petugas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AssignForm serviceId={service.id} />
          {service.assignments.length === 0 ? (
            <p className="text-sm text-gray-600">Belum ada petugas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peran</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {service.assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-gray-600">{a.roleName}</TableCell>
                    <TableCell className="font-medium">{a.personName}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onUnassign(a.id, a.personName)}
                          disabled={unassign.isPending}
                        >
                          Hapus
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
