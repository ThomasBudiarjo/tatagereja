import { Show } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { useKebaktian, useDeleteKebaktian } from "../../lib/kebaktian";
import { FullSpinner, ErrorState, PrimaryButton } from "../../components/ui";
import { IconArrowLeft, IconPencil, IconTrash, IconCalendar } from "../../components/icons";

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

export default function KebaktianDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const id = () => Number(params.id);
  const query = useKebaktian(id);
  const del = useDeleteKebaktian();

  const remove = () => {
    const k = query.data?.kebaktian;
    if (k && confirm(`Hapus ${k.nama}?`)) {
      del.mutate(k.id, { onSuccess: () => navigate("/kebaktian", { replace: true }) });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A href="/kebaktian" class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>

      <Show when={!query.isError} fallback={<ErrorState message="Data kebaktian tidak ditemukan." />}>
        <Show when={query.data} fallback={<FullSpinner />}>
          {(data) => (
            <div class="rounded-2xl border border-line bg-surface-raised p-6">
              <div class="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h1 class="text-xl font-semibold tracking-tight text-ink">{data().kebaktian.nama}</h1>
                  <p class="mt-0.5 text-sm text-ink-soft font-num">{data().kebaktian.waktu_mulai_text}</p>
                </div>
                <div class="flex gap-2">
                  <A href={`/kebaktian/${id()}/edit`}>
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
                <Row label="Lokasi" value={data().kebaktian.lokasi} />
                <Row label="Tema" value={data().kebaktian.tema} />
                <Row label="Pengkhotbah" value={data().kebaktian.pengkhotbah} />
                <Row label="Catatan" value={data().kebaktian.catatan} />
              </dl>

              <A href={`/kebaktian/${id()}/jadwal`} class="mt-5 block">
                <PrimaryButton type="button" class="w-full">
                  <IconCalendar class="h-4 w-4" />
                  Atur Jadwal Pelayanan
                </PrimaryButton>
              </A>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
