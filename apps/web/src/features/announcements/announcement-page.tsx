import { useQuery } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, PageLoader } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { announcementQuery, useDeleteAnnouncement, useUpdateAnnouncement } from './api';
import { AnnouncementForm } from './announcement-form';

export function AnnouncementPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(announcementQuery(churchId, id));
  const update = useUpdateAnnouncement(churchId, id);
  const remove = useDeleteAnnouncement(churchId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/announcements`} title="Announcement" />
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }

  const { announcement, canManage } = query.data;

  return (
    <Page>
      <PageHeader
        backTo={`${base}/announcements`}
        eyebrow={announcement.groupName ?? 'Whole church'}
        title={announcement.title}
        description={`${announcement.authorName} · ${formatDateTime(announcement.publishedAt ?? announcement.createdAt)}`}
        actions={
          canManage ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          ) : null
        }
      />
      {announcement.status === 'draft' ? (
        <Badge variant="warning">Draft — only you and other managers can see this</Badge>
      ) : null}
      <Card>
        <CardContent className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {announcement.body}
        </CardContent>
      </Card>

      {canManage ? (
        <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> Delete announcement
        </Button>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit announcement</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <AnnouncementForm
              announcement={announcement}
              onCancel={() => setEditOpen(false)}
              onSubmit={async (values) => {
                await update.mutateAsync(values);
                setEditOpen(false);
                toast.success(
                  values.status === 'published' ? 'Announcement published' : 'Draft saved',
                );
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${announcement.title}"?`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(announcement.id);
            toast.success('Announcement deleted');
            navigate(`${base}/announcements`, { replace: true });
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </Page>
  );
}
