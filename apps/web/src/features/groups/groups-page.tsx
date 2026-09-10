import { GROUP_TYPE_LABELS, can } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, SearchInput, Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { groupsQuery, useCreateGroup } from './api';
import { GroupForm } from './group-form';

export function GroupsPage() {
  const { churchId, base, access } = useChurch();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebounced(search);
  const query = useQuery(groupsQuery(churchId, { q: debounced || undefined, includeInactive }));
  const create = useCreateGroup(churchId);
  const canCreate = can.createGroup(access);

  return (
    <Page>
      <PageHeader
        title="Groups"
        description="Ministries, small groups and committees."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> New
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search groups" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
          Show inactive groups
        </label>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={debounced ? 'No matching groups' : 'No groups yet'}
          description={
            debounced
              ? 'Try a different search.'
              : 'Create a group to organise ministries and assign leaders.'
          }
          action={
            canCreate && !debounced ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Create a group
              </Button>
            ) : null
          }
        />
      ) : (
        <ListGroup>
          {query.data.items.map((group) => (
            <ListRow
              key={group.id}
              to={`${base}/groups/${group.id}`}
              title={
                <span className="flex items-center gap-2">
                  {group.name}
                  {!group.isActive ? <Badge variant="muted">Inactive</Badge> : null}
                </span>
              }
              subtitle={[
                GROUP_TYPE_LABELS[group.type],
                `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`,
                group.leaders.length > 0
                  ? `Led by ${group.leaders.map((leader) => leader.name).join(', ')}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </ListGroup>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <GroupForm
              submitLabel="Create group"
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (values) => {
                await create.mutateAsync(values);
                setCreateOpen(false);
                toast.success('Group created');
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
