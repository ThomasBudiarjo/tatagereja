import { HandCoins, Mail, Pencil, Trash2, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { AvatarGroup, EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MonthGrid } from '@/components/ui/calendar-grid';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart, DonutChart, LineChart } from '@/components/ui/charts';
import { Combobox } from '@/components/ui/combobox';
import { CopyButton } from '@/components/ui/copy-button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DataList } from '@/components/ui/data-list';
import { DateRangePicker, presetRange } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FilterBar } from '@/components/ui/filter-bar';
import { KanbanBoard, KanbanCard, KanbanColumn } from '@/components/ui/kanban';
import { Pagination } from '@/components/ui/pagination';
import { QrDisplay } from '@/components/ui/qr-code';
import { ResponsiveTable, formatSort, parseSort } from '@/components/ui/responsive-table';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { Stepper } from '@/components/ui/stepper';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';

/*
 * A living gallery of the shared components with sample data, for module authors and visual
 * review. Only routed in development builds or with VITE_UI_GALLERY=1; sample text is not
 * translated on purpose.
 */

const people = [
  { id: '1', name: 'Andreas Wijaya', status: 'member', area: 'Wilayah 1', giving: 1_500_000 },
  { id: '2', name: 'Ester Lumbantobing', status: 'member', area: 'Wilayah 2', giving: 750_000 },
  { id: '3', name: 'Daniel Hutapea', status: 'visitor', area: 'Wilayah 1', giving: 0 },
  { id: '4', name: 'Ruth Siregar', status: 'inactive', area: 'Wilayah 3', giving: 250_000 },
];

export function UiGalleryPage() {
  const { formatCurrency } = useI18n();
  const [state, setState, reset] = useUrlState({
    q: '',
    status: '',
    areas: [] as string[],
    sort: 'name',
    page: 1,
  });
  const [person, setPerson] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(1_250_000);
  const [range, setRange] = useState(presetRange('thisMonth'));
  const [month, setMonth] = useState(new Date());
  const [day, setDay] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const today = new Date();
  const dayOf = (offset: number) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const visible = people
    .filter((item) => !state.q || item.name.toLowerCase().includes(state.q.toLowerCase()))
    .filter((item) => !state.status || item.status === state.status)
    .filter((item) => state.areas.length === 0 || state.areas.includes(item.area));
  const sort = parseSort(state.sort);
  visible.sort((a, b) => {
    const order = sort.key === 'giving' ? a.giving - b.giving : a.name.localeCompare(b.name, 'id');
    return sort.direction === 'asc' ? order : -order;
  });
  const statusTone = (status: string) =>
    status === 'member' ? 'success' : status === 'visitor' ? 'info' : 'neutral';

  return (
    <Page size="wide">
      <PageHeader
        title="Komponen antarmuka"
        description="Shared components with sample data."
        breadcrumbs={[{ label: 'Beranda', to: '..' }, { label: 'Komponen' }]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jemaat" value="1.284" icon={Users} tone="sky" trend={{ value: 0.042 }} />
        <StatCard
          label="Persembahan"
          value={formatCurrency(48_750_000, { compact: true })}
          icon={HandCoins}
          tone="emerald"
          trend={{ value: -0.08 }}
          hint="vs bulan lalu"
        />
        <StatCard label="Kas" value={formatCurrency(12_500_000)} icon={Wallet} tone="emerald" />
        <StatCard label="Loading" value="" loading icon={Mail} tone="amber" />
      </div>

      <Section title="FilterBar + ResponsiveTable (URL state)">
        <FilterBar
          search={{ value: state.q, onChange: (q) => setState({ q }), placeholder: 'Cari jemaat' }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: state.status,
              onChange: (status) => setState({ status }),
              options: [
                { value: 'member', label: 'Anggota', count: 2 },
                { value: 'visitor', label: 'Tamu', count: 1 },
                { value: 'inactive', label: 'Tidak aktif', count: 1 },
              ],
            },
            {
              id: 'areas',
              label: 'Wilayah',
              multiple: true,
              value: state.areas,
              onChange: (areas) => setState({ areas }),
              options: ['Wilayah 1', 'Wilayah 2', 'Wilayah 3'].map((value) => ({
                value,
                label: value,
              })),
            },
          ]}
          sort={{
            value: state.sort,
            onChange: (value) => setState({ sort: value }),
            options: [
              { value: 'name', label: 'Nama A–Z' },
              { value: '-name', label: 'Nama Z–A' },
              { value: '-giving', label: 'Persembahan terbesar' },
            ],
          }}
          onReset={() => reset()}
        />
        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            tone="sky"
            title="Tidak ada hasil"
            description="Coba filter lain."
          />
        ) : (
          <ResponsiveTable
            items={visible}
            getKey={(item) => item.id}
            caption="Jemaat"
            sort={sort}
            onSortChange={(next) => setState({ sort: formatSort(next) })}
            href={() => '#'}
            actions={(item) => [
              { id: 'edit', label: 'Ubah', icon: Pencil, onSelect: () => toast(item.name) },
              {
                id: 'delete',
                label: 'Hapus',
                icon: Trash2,
                destructive: true,
                onSelect: () => setConfirm(true),
              },
            ]}
            columns={[
              {
                id: 'name',
                header: 'Nama',
                primary: true,
                sortKey: 'name',
                cell: (item) => (
                  <span className="flex items-center gap-2.5">
                    <EntityAvatar name={item.name} size="sm" />
                    {item.name}
                  </span>
                ),
              },
              { id: 'area', header: 'Wilayah', cell: (item) => item.area },
              {
                id: 'status',
                header: 'Status',
                cell: (item) => (
                  <StatusBadge tone={statusTone(item.status)} dot>
                    {item.status}
                  </StatusBadge>
                ),
              },
              {
                id: 'giving',
                header: 'Persembahan',
                align: 'right',
                sortKey: 'giving',
                cell: (item) => formatCurrency(item.giving),
              },
            ]}
          />
        )}
        <Pagination
          page={state.page}
          pageSize={50}
          total={230}
          onPageChange={(page) => setState({ page })}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Forms">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <Field label="Jemaat" htmlFor="gallery-person">
                <Combobox
                  id="gallery-person"
                  value={person}
                  onChange={setPerson}
                  clearable
                  placeholder="Pilih jemaat"
                  options={people.map((item) => ({
                    value: item.id,
                    label: item.name,
                    description: item.area,
                    leading: <EntityAvatar name={item.name} size="xs" />,
                  }))}
                />
              </Field>
              <Field label="Jumlah" htmlFor="gallery-amount" description={String(amount ?? '')}>
                <CurrencyInput id="gallery-amount" value={amount} onChange={setAmount} />
              </Field>
              <DateRangePicker value={range} onChange={setRange} />
              <div className="flex flex-wrap gap-2">
                <CopyButton value="https://tatagereja.example/join/abc" />
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      Sheet
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Detail jemaat</SheetTitle>
                      <SheetDescription>
                        Bottom sheet on phones, side panel on desktop.
                      </SheetDescription>
                    </SheetHeader>
                    <SheetBody>
                      <SkeletonList rows={4} />
                    </SheetBody>
                  </SheetContent>
                </Sheet>
                <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
                  Hapus gereja
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Tabs, stepper, timeline">
          <UrlTabs defaultValue="steps" values={['steps', 'timeline']}>
            <TabsList variant="underline">
              <TabsTrigger value="steps">Stepper</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="steps">
              <Stepper
                current={1}
                steps={[
                  { id: 'count', label: 'Hitung' },
                  { id: 'verify', label: 'Verifikasi' },
                  { id: 'post', label: 'Bukukan' },
                ]}
              />
            </TabsContent>
            <TabsContent value="timeline">
              <Timeline>
                <TimelineItem
                  icon={Mail}
                  tone="sky"
                  title="Perkunjungan dijadwalkan"
                  time="2 hari lalu"
                />
                <TimelineItem tone="success" title="Didoakan tim doa" time="kemarin" last />
              </Timeline>
            </TabsContent>
          </UrlTabs>
          <AvatarGroup people={people.map((item) => ({ name: item.name }))} max={3} />
        </Section>
      </div>

      <Section title="Charts">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardContent>
              <LineChart
                title="Kehadiran ibadah"
                labels={['Sep 1', 'Sep 8', 'Sep 15', 'Sep 22', 'Sep 29', 'Okt 6', 'Okt 13']}
                series={[
                  { id: 'pagi', label: 'Ibadah Pagi', values: [312, 298, 330, 341, 325, 352, 360] },
                  { id: 'sore', label: 'Ibadah Sore', values: [140, 152, 149, 160, 171, 165, 178] },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <BarChart
                title="Persembahan per minggu"
                format={(value) => formatCurrency(value, { compact: true })}
                data={[
                  { label: 'M1', value: 12_400_000 },
                  { label: 'M2', value: 9_800_000 },
                  { label: 'M3', value: 14_100_000 },
                  { label: 'M4', value: 11_250_000 },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <DonutChart
                title="Jemaat per status"
                data={[
                  { label: 'Anggota', value: 812 },
                  { label: 'Simpatisan', value: 230 },
                  { label: 'Tamu', value: 96 },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Calendar and board">
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          selected={day}
          onSelectDay={setDay}
          items={[
            { id: 'a', date: dayOf(0), title: 'Ibadah Minggu', time: '09:00', tone: 'violet' },
            { id: 'b', date: dayOf(2), title: 'Persekutuan Pemuda', time: '18:00', tone: 'amber' },
            { id: 'c', date: dayOf(2), title: 'Latihan Paduan Suara', tone: 'sky' },
          ]}
        />
        <KanbanBoard>
          {['Baru', 'Dihubungi', 'Bergabung'].map((title, index) => (
            <KanbanColumn
              key={title}
              title={title}
              count={2 - (index % 2)}
              tone={index === 2 ? 'success' : 'info'}
              onDropCard={(id) => toast(`${id} → ${title}`)}
            >
              <KanbanCard id={`card-${index}`}>
                <p className="text-sm font-medium">Daniel Hutapea</p>
                <p className="text-xs text-muted-foreground">Tamu pertama · Minggu lalu</p>
              </KanbanCard>
            </KanbanColumn>
          ))}
        </KanbanBoard>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="States">
          <ErrorState onRetry={() => toast('retry')} compact />
          <DataList
            items={people.slice(0, 2)}
            getKey={(item) => item.id}
            title={(item) => item.name}
            subtitle={(item) => item.area}
            leading={(item) => <EntityAvatar name={item.name} />}
            actions={(item) => [
              { id: 'mail', label: 'Kirim pesan', icon: Mail, onSelect: () => toast(item.name) },
            ]}
          />
        </Section>
        <Section title="QR">
          <QrDisplay
            value="https://tatagereja.example/join/abc"
            caption="Pindai untuk bergabung"
            downloadName="undangan"
          />
        </Section>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Hapus GKI Kebon Jati?"
        description="Semua data jemaat, kegiatan, dan keuangan gereja ini akan dihapus permanen."
        confirmLabel="Hapus permanen"
        confirmText="GKI Kebon Jati"
        onConfirm={() => {
          setConfirm(false);
          toast.success('Dihapus');
        }}
      />
    </Page>
  );
}
