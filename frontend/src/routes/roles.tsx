import { valibotResolver } from "@hookform/resolvers/valibot";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from "../lib/schedule-queries";
import { RoleInputSchema, type Role, type RoleInput } from "../lib/schemas";

function RoleForm({
  initial,
  codeEditable,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: RoleInput;
  codeEditable: boolean;
  submitLabel: string;
  onSubmit: (values: RoleInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RoleInput>({
    resolver: valibotResolver(RoleInputSchema),
    defaultValues: initial,
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      reset({ code: "", name: "", sortOrder: 0 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-36 flex-col gap-1.5">
        <Label htmlFor="role-code">Kode</Label>
        <Input id="role-code" disabled={!codeEditable} {...register("code")} />
        {errors.code && (
          <p role="alert" className="text-sm text-red-600">
            {errors.code.message}
          </p>
        )}
      </div>
      <div className="flex min-w-36 flex-1 flex-col gap-1.5">
        <Label htmlFor="role-name">Nama</Label>
        <Input id="role-name" {...register("name")} />
        {errors.name && (
          <p role="alert" className="text-sm text-red-600">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex w-28 flex-col gap-1.5">
        <Label htmlFor="role-sort">Urutan</Label>
        <Input id="role-sort" type="number" {...register("sortOrder", { valueAsNumber: true })} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
        )}
      </div>
    </form>
  );
}

export function RolesPage() {
  const { data: roles, isPending } = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [editing, setEditing] = useState<Role | null>(null);

  const onDelete = async (role: Role) => {
    if (!window.confirm(`Hapus peran ${role.name}?`)) {
      return;
    }
    try {
      await deleteRole.mutateAsync(role.code);
      toast.success(`Peran ${role.name} dihapus`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? `Ubah Peran: ${editing.name}` : "Tambah Peran"}</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <RoleForm
              key={editing.code}
              initial={{ code: editing.code, name: editing.name, sortOrder: editing.sortOrder }}
              codeEditable={false}
              submitLabel="Simpan"
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await updateRole.mutateAsync({
                  code: editing.code,
                  input: { name: values.name, sortOrder: values.sortOrder },
                });
                setEditing(null);
                toast.success("Perubahan disimpan");
              }}
            />
          ) : (
            <RoleForm
              initial={{ code: "", name: "", sortOrder: 0 }}
              codeEditable
              submitLabel="Tambah"
              onSubmit={async (values) => {
                await createRole.mutateAsync(values);
                toast.success(`Peran ${values.name} ditambahkan`);
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Peran</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-gray-600">Memuat…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Urutan</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roles ?? []).map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.sortOrder}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                          Ubah
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(r)}
                          disabled={deleteRole.isPending}
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
