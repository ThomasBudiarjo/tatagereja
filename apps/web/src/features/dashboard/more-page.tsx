import { ROLE_LABELS, can } from '@tatagereja/shared';
import {
  ClipboardCheck,
  LogOut,
  Megaphone,
  Repeat,
  Settings,
  UserCircle,
  UsersRound,
} from 'lucide-react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list';
import { useLogout } from '@/features/auth/api';
import { useAuth } from '@/stores/auth';

export function MorePage() {
  const { church, base, access } = useChurch();
  const { user } = useAuth();
  const logout = useLogout();

  return (
    <Page>
      <PageHeader title="More" />
      <ListGroup>
        <ListRow
          to="/profile"
          leading={<EntityAvatar name={user?.name ?? '?'} src={user?.avatarUrl} />}
          title={user?.name ?? 'Account'}
          subtitle={user?.email}
        />
      </ListGroup>

      <Section title={church.name}>
        <ListGroup>
          <ListRow
            to={`${base}/groups`}
            leading={<UsersRound className="size-5 text-muted-foreground" />}
            title="Groups and ministries"
          />
          <ListRow
            to={`${base}/announcements`}
            leading={<Megaphone className="size-5 text-muted-foreground" />}
            title="Announcements"
          />
          <ListRow
            to={`${base}/attendance`}
            leading={<ClipboardCheck className="size-5 text-muted-foreground" />}
            title={can.viewAttendanceOverview(access) ? 'Attendance' : 'My attendance'}
          />
          <ListRow
            to={`${base}/settings`}
            leading={<Settings className="size-5 text-muted-foreground" />}
            title="Church settings"
            trailing={<Badge variant="muted">{ROLE_LABELS[access.role]}</Badge>}
          />
        </ListGroup>
      </Section>

      <Section title="Account">
        <ListGroup>
          <ListRow
            to="/profile"
            leading={<UserCircle className="size-5 text-muted-foreground" />}
            title="Account settings"
          />
          <ListRow
            to="/churches"
            leading={<Repeat className="size-5 text-muted-foreground" />}
            title="Switch church"
          />
        </ListGroup>
      </Section>

      <Button variant="outline" onClick={() => logout.mutate()} loading={logout.isPending}>
        <LogOut /> Sign out
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        TataGereja · open-source church management
      </p>
    </Page>
  );
}
