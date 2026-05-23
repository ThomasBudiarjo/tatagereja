import { Show } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { useJemaat, useDeleteJemaat } from "../../lib/jemaat";
import { FullSpinner, ErrorState, PrimaryButton } from "../../components/ui";
import { IconArrowLeft, IconPencil, IconTrash } from "../../components/icons";

const GENDER: Record<string, string> = { L: "Laki-laki", P: "Perempuan" };
const STATUS: Record<string, string> = {
  belum_menikah: "Belum menikah",
  menikah: "Menikah",
  cerai: "Cerai",
  duda: "Duda",
  janda: "Janda",
};

function Row(props: { label: string; value?: string | null }) {
  return (
    <Show when={props.value}>
      <div class="flex justify-between gap-4 border-b border-line py-2.5 last:border-0">
        <dt class="shrink-0 text-xs font-medium text-ink-soft">{props.label}</dt>
        <dd class="text-right text-sm text-ink">{props.value}</dd>
      </div>
    </Show>
  );
}

export default function JemaatDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const id = () => Number(params.id);
  const query = useJemaat(id);
  const del = useDeleteJemaat();

  const remove = () => {
    const j = query.data?.jemaat;
    if (j && confirm(`Hapus ${j.nama_lengkap}?`)) {
      del.mutate(j.id, { onSuccess: () => navigate("/jemaat", { replace: true }) });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A href="/jemaat" class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>

      <Show when={!query.isError} fallback={<ErrorState message="Data jemaat tidak ditemukan." />}>
        <Show when={query.data} fallback={<FullSpinner />}>
          {(data) => (
            <div class="rounded-2xl border border-line bg-surface-raised p-6">
              <div class="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h1 class="text-xl font-semibold tracking-tight text-ink">
                    {data().jemaat.nama_lengkap}
                  </h1>
                  <Show when={data().jemaat.nama_panggilan}>
                    <p class="text-sm text-ink-soft">{data().jemaat.nama_panggilan}</p>
                  </Show>
                </div>
                <div class="flex gap-2">
                  <A href={`/jemaat/${id()}/edit`}>
                    <PrimaryButton type="button">
                      <IconPencil class="h-3.5 w-3.5" />
                      Edit
                    </PrimaryButton>
                  </A>
                  <button
                    type="button"
                    onClick={remove}
                    class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <IconTrash class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <dl>
                <Row label="Jenis Kelamin" value={data().jemaat.jenis_kelamin ? GENDER[data().jemaat.jenis_kelamin!] : ""} />
                <Row label="Tanggal Lahir" value={data().jemaat.tanggal_lahir} />
                <Row label="Tempat Lahir" value={data().jemaat.tempat_lahir} />
                <Row label="Status" value={data().jemaat.status_pernikahan ? STATUS[data().jemaat.status_pernikahan!] : ""} />
                <Row label="Telepon" value={data().jemaat.nomor_telepon} />
                <Row label="Email" value={data().jemaat.email} />
                <Row label="Alamat" value={data().jemaat.alamat} />
                <Row label="Tanggal Baptis" value={data().jemaat.tanggal_baptis} />
                <Row label="Tanggal Sidi" value={data().jemaat.tanggal_sidi} />
                <Row label="Catatan" value={data().jemaat.catatan} />
              </dl>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
