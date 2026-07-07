import { valibotResolver } from "@hookform/resolvers/valibot";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import {
  addDays,
  formatDateID,
  formatMonthID,
  monthRange,
  shiftMonth,
  toISODate,
  weekRange,
  type DateRange,
} from "../lib/dates";
import { useCreateService, usePelayananTypes, useServices } from "../lib/schedule-queries";
import { ServiceInputSchema, type Service, type ServiceInput } from "../lib/schemas";

type ViewMode = "week" | "month";

function rangeFor(mode: ViewMode, anchor: string): DateRange {
  return mode === "week" ? weekRange(anchor) : monthRange(anchor);
}

function shiftAnchor(mode: ViewMode, anchor: string, direction: 1 | -1): string {
  return mode === "week" ? addDays(anchor, 7 * direction) : shiftMonth(anchor, direction);
}

function AddServiceForm({ onDone }: { onDone: () => void }) {
  const { data: types } = usePelayananTypes();
  const createService = useCreateService();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ServiceInput>({
    resolver: valibotResolver(ServiceInputSchema),
    defaultValues: {
      pelayananTypeCode: "",
      date: toISODate(new Date()),
      startTime: "09:00",
      title: "",
      notes: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createService.mutateAsync(values);
      toast.success("Ibadah ditambahkan");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menambahkan ibadah");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-type">Jenis Pelayanan</Label>
          <Select id="service-type" {...register("pelayananTypeCode")}>
            <option value="">Pilih…</option>
            {(types ?? []).map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
          {errors.pelayananTypeCode && (
            <p role="alert" className="text-sm text-red-600">
              {errors.pelayananTypeCode.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-date">Tanggal</Label>
          <Input id="service-date" type="date" {...register("date")} />
          {errors.date && (
            <p role="alert" className="text-sm text-red-600">
              {errors.date.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-time">Jam Mulai</Label>
          <Input id="service-time" type="time" {...register("startTime")} />
          {errors.startTime && (
            <p role="alert" className="text-sm text-red-600">
              {errors.startTime.message}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="service-title">Judul (opsional)</Label>
        <Input id="service-title" placeholder="mis. Ibadah Natal" {...register("title")} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan…" : "Tambah"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
      </div>
    </form>
  );
}

function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      to="/services/$serviceId"
      params={{ serviceId: service.id }}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-400"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {service.pelayananTypeName}
          {service.title ? ` — ${service.title}` : ""}
        </span>
        <span className="text-sm text-gray-600">{service.startTime}</span>
      </div>
      {service.assignments.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">Belum ada petugas.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-0.5 text-sm text-gray-700">
          {service.assignments.map((a) => (
            <li key={a.id}>
              <span className="text-gray-500">{a.roleName}:</span> {a.personName}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}

export function SchedulePage() {
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => toISODate(new Date()));
  const [adding, setAdding] = useState(false);

  const range = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);
  const { data: services, isPending } = useServices(range.from, range.to);

  const byDate = useMemo(() => {
    const groups = new Map<string, Service[]>();
    for (const s of services ?? []) {
      const list = groups.get(s.date) ?? [];
      list.push(s);
      groups.set(s.date, list);
    }
    return [...groups.entries()];
  }, [services]);

  const heading =
    mode === "week"
      ? `${formatDateID(range.from)} – ${formatDateID(range.to)}`
      : formatMonthID(range.from);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Jadwal Pelayanan</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={mode === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("week")}
          >
            Minggu
          </Button>
          <Button
            variant={mode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("month")}
          >
            Bulan
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))}>
            ‹
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(toISODate(new Date()))}>
            Hari ini
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))}>
            ›
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-600">{heading}</p>

      {adding ? (
        <Card>
          <CardHeader>
            <CardTitle>Tambah Ibadah</CardTitle>
          </CardHeader>
          <CardContent>
            <AddServiceForm onDone={() => setAdding(false)} />
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button onClick={() => setAdding(true)}>Tambah Ibadah</Button>
        </div>
      )}

      {isPending ? (
        <p className="text-sm text-gray-600">Memuat…</p>
      ) : byDate.length === 0 ? (
        <p className="text-sm text-gray-600">Tidak ada ibadah pada rentang ini.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {byDate.map(([date, list]) => (
            <section key={date} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-gray-900">{formatDateID(date)}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((s) => (
                  <ServiceCard key={s.id} service={s} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
