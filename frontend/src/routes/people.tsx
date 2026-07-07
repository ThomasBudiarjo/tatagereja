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
import { Textarea } from "../components/ui/textarea";
import {
  useCreatePerson,
  useDeletePerson,
  usePersons,
  useUpdatePerson,
} from "../lib/people-queries";
import { PersonInputSchema, type Person, type PersonInput } from "../lib/schemas";

const emptyPerson: PersonInput = { name: "", phone: "", notes: "" };

function PersonForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: PersonInput;
  onSubmit: (values: PersonInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PersonInput>({
    resolver: valibotResolver(PersonInputSchema),
    defaultValues: initial,
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      reset(emptyPerson);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="person-name">Nama</Label>
          <Input id="person-name" {...register("name")} />
          {errors.name && (
            <p role="alert" className="text-sm text-red-600">
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="person-phone">Telepon</Label>
          <Input id="person-phone" type="tel" {...register("phone")} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person-notes">Catatan</Label>
        <Textarea id="person-notes" {...register("notes")} />
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

export function PeoplePage() {
  const { data: persons, isPending } = usePersons();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Person | null>(null);

  const filtered = (persons ?? []).filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const onDelete = async (person: Person) => {
    if (!window.confirm("Hapus jemaat ini? Penjadwalannya ikut terhapus.")) {
      return;
    }
    try {
      await deletePerson.mutateAsync(person.id);
      toast.success(`${person.name} dihapus`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? `Ubah: ${editing.name}` : "Tambah Jemaat"}</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <PersonForm
              key={editing.id}
              initial={{ name: editing.name, phone: editing.phone, notes: editing.notes }}
              submitLabel="Simpan"
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await updatePerson.mutateAsync({ id: editing.id, input: values });
                setEditing(null);
                toast.success("Perubahan disimpan");
              }}
            />
          ) : (
            <PersonForm
              initial={emptyPerson}
              submitLabel="Tambah"
              onSubmit={async (values) => {
                await createPerson.mutateAsync(values);
                toast.success(`${values.name} ditambahkan`);
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Jemaat</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            placeholder="Cari nama…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
          {isPending ? (
            <p className="text-sm text-gray-600">Memuat…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-600">Belum ada jemaat.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.phone}</TableCell>
                    <TableCell className="max-w-64 truncate">{p.notes}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                          Ubah
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(p)}
                          disabled={deletePerson.isPending}
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
