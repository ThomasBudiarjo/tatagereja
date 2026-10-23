import { useQuery } from '@tanstack/react-query';
import { Copy, EyeOff, MoreHorizontal, Pencil, Send, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { copyText } from '@/components/ui/copy-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert } from '@/components/ui/misc';
import { PrintButton, PrintSheet } from '@/components/ui/print';
import { SkeletonPage } from '@/components/ui/skeleton';
import { DetailLoadError } from '@/features/comms/load-error';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { bulletinQuery, useDeleteBulletin, useDuplicateBulletin, usePublishBulletin } from './api';
import { BULLETIN_TONE, hasContent } from './bulletin-lib';
import { BulletinSectionView } from './bulletin-sections';

/**
 * A Warta Jemaat issue: a printable A4 sheet (two columns on paper and wide screens) that every
 * member can open and share. Editors publish, withdraw, copy it to next week and delete it here.
 */
export function BulletinPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base, church } = useChurch();
  const { t, formatDate, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(bulletinQuery(churchId, id));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const publish = useMutationToast(usePublishBulletin(churchId), {
    success: (result) =>
      result.bulletin.status === 'published'
        ? t('comms.bulletinPublished')
        : t('comms.bulletinWithdrawn'),
  });
  const duplicate = useMutationToast(useDuplicateBulletin(churchId), {
    success: t('comms.bulletinCopied'),
  });
  const remove = useMutationToast(useDeleteBulletin(churchId), {
    success: t('comms.bulletinDeleted'),
  });

  if (query.isPending) return <SkeletonPage />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('comms.bulletins')} backTo={`${base}/bulletins`} />
        <DetailLoadError
          error={query.error}
          goneTitle={t('comms.bulletinGoneTitle')}
          goneBody={t('comms.bulletinGoneBody')}
          backTo={`${base}/bulletins`}
          backLabel={t('comms.bulletinBackToList')}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Page>
    );
  }

  const { bulletin, rendered, week, churchName, canManage } = query.data;
  const visible = rendered.filter((section) => canManage || hasContent(section));
  const draft = bulletin.status === 'draft';

  const share = async () => {
    const url = window.location.href;
    const text = `${bulletin.title} · ${formatDate(bulletin.issueDate, 'dateLong')}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: bulletin.title, text, url });
        return;
      } catch {
        // Cancelled: copy instead.
      }
    }
    if (await copyText(`${text}\n${url}`)) toast.success(t('comms.bulletinLinkCopied'));
    else toast.error(t('common.copyFailed'));
  };

  return (
    <Page size="wide">
      <div data-print="hide" className="flex flex-col gap-4">
        <PageHeader
          breadcrumbs={[
            { label: t('comms.bulletins'), to: `${base}/bulletins` },
            { label: bulletin.title },
          ]}
          title={bulletin.title}
          documentTitle={`${bulletin.title} · ${bulletin.issueDate}`}
          tone={BULLETIN_TONE}
          eyebrow={formatDate(bulletin.issueDate, 'dateLong')}
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void share()}
                aria-label={t('common.share')}
              >
                <Share2 />
                <span className="hidden sm:inline">{t('common.share')}</span>
              </Button>
              <PrintButton size="sm" />
              {canManage ? (
                <>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to={`${base}/bulletins/${bulletin.id}/edit`}
                      aria-label={t('common.edit')}
                    >
                      <Pencil />
                      <span className="hidden sm:inline">{t('common.edit')}</span>
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="size-9"
                        aria-label={t('common.moreActions')}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!draft ? (
                        <DropdownMenuItem
                          onSelect={() => void publish.run({ id: bulletin.id, publish: false })}
                        >
                          <EyeOff />
                          {t('comms.bulletinWithdraw')}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        onSelect={async () => {
                          const result = await duplicate.run(bulletin.id);
                          if (result) void navigate(`${base}/bulletins/${result.bulletin.id}/edit`);
                        }}
                      >
                        <Copy />
                        {t('comms.bulletinDuplicate')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                        <Trash2 />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
            </>
          }
        />
        {canManage && draft ? (
          <Alert
            variant="warning"
            title={t('comms.bulletinDraftTitle')}
            action={
              <Button size="sm" onClick={() => setPublishOpen(true)}>
                <Send />
                {t('comms.bulletinPublish')}
              </Button>
            }
          >
            {t('comms.bulletinDraftBody')}
          </Alert>
        ) : null}
      </div>

      <PrintSheet className="flex flex-col gap-7 bg-card">
        <header className="flex flex-col items-center gap-2 border-b-2 border-double border-foreground/30 pb-5 text-center">
          {church.logoUrl ? (
            <img src={church.logoUrl} alt="" className="size-14 object-contain" />
          ) : null}
          <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {churchName}
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-[0.18em] uppercase sm:text-4xl">
            {t('comms.bulletinMasthead')}
          </h1>
          <p className="text-sm font-medium">
            {formatDate(bulletin.issueDate, 'dateLong')}
            <span className="text-muted-foreground">
              {' '}
              ·{' '}
              {t('comms.bulletinWeek', {
                from: formatDate(week.from, 'dayMonth'),
                to: formatDate(week.to, 'dateShort'),
              })}
            </span>
          </p>
          {bulletin.theme ? (
            <p className="mt-1 max-w-xl text-lg text-pretty italic">“{bulletin.theme}”</p>
          ) : null}
        </header>
        {bulletin.coverImageUrl ? (
          <img
            src={bulletin.coverImageUrl}
            alt=""
            className="aspect-[21/9] w-full rounded-lg object-cover print:max-h-56"
          />
        ) : null}
        {visible.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t('comms.bulletinNoSections')}</p>
        ) : (
          <div className="columns-1 gap-10 space-y-7 lg:columns-2 print:columns-2">
            {visible.map((section) => (
              <div key={section.id} className="break-inside-avoid">
                <BulletinSectionView section={section} showEmpty={canManage} />
              </div>
            ))}
          </div>
        )}
        <footer className="border-t pt-3 text-center text-xs text-muted-foreground">
          {bulletin.publishedAt
            ? t('comms.bulletinFooter', {
                church: churchName,
                when: formatDateTime(bulletin.publishedAt),
              })
            : churchName}
        </footer>
      </PrintSheet>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t('comms.bulletinPublishTitle', { title: bulletin.title })}
        description={
          bulletin.publishedAt ? t('comms.bulletinRepublishBody') : t('comms.bulletinPublishBody')
        }
        confirmLabel={t('comms.bulletinPublish')}
        variant="default"
        loading={publish.isPending}
        onConfirm={async () => {
          if (await publish.run({ id: bulletin.id, publish: true })) setPublishOpen(false);
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('comms.bulletinDeleteTitle', { title: bulletin.title })}
        description={t('comms.bulletinDeleteBody')}
        confirmLabel={t('common.delete')}
        confirmText={bulletin.status === 'published' ? bulletin.title : undefined}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(bulletin.id)) {
            setDeleteOpen(false);
            void navigate(`${base}/bulletins`, { replace: true });
          }
        }}
      />
    </Page>
  );
}
