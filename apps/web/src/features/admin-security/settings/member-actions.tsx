import { can, type ChurchRole, type MembershipStatus, type Permission } from '@tatagereja/shared';
import { Eye, PauseCircle, PlayCircle, ShieldCheck, UserMinus, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import type { RowAction } from '@/components/ui/row-actions';
import { useI18n } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useChangeBaseRole, useRemoveMember, useSetMemberStatus } from '../api';

/** What the member actions need to know about a member. */
export type MemberTarget = {
  id: string;
  userId: string;
  role: ChurchRole;
  status: MembershipStatus;
  user: { name: string };
  /** Effective permissions, when known: hides actions the API would refuse as escalation. */
  permissions?: readonly Permission[];
};

type Pending =
  | { kind: 'suspend' | 'reactivate' | 'remove'; member: MemberTarget }
  | { kind: 'role'; member: MemberTarget; role: ChurchRole }
  | null;

/**
 * The actions people may take on a member (change base role, suspend, reactivate, remove),
 * with their confirmations. Rules come from the shared `can.*` functions, so hidden actions
 * match what the API refuses.
 */
export function useMemberActions({ onRemoved }: { onRemoved?: () => void } = {}) {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending>(null);
  const changeRole = useMutationToast(useChangeBaseRole(churchId), {
    success: (_data, variables) =>
      t('admin-security.roleChanged', { role: t(ROLE_KEYS[variables.role]) }),
  });
  const setStatus = useMutationToast(useSetMemberStatus(churchId), {
    success: (_data, variables) =>
      t(
        variables.status === 'suspended'
          ? 'admin-security.memberSuspended'
          : 'admin-security.memberReactivated',
      ),
  });
  const remove = useMutationToast(useRemoveMember(churchId), {
    success: t('admin-security.memberRemoved'),
  });

  const actionsFor = (member: MemberTarget, { includeOpen = true } = {}): RowAction[] => {
    const isSelf = member.userId === access.userId;
    const target = { role: member.role, userId: member.userId, permissions: member.permissions };
    return [
      {
        id: 'open',
        label: t('admin-security.openMember'),
        icon: Eye,
        onSelect: () => navigate(`${base}/settings/members/${member.id}`),
        hidden: !includeOpen,
      },
      {
        id: 'admin',
        label: t('admin-security.makeAdministrator'),
        icon: ShieldCheck,
        onSelect: () => setPending({ kind: 'role', member, role: 'administrator' }),
        hidden: member.role !== 'member' || !can.changeMemberRole(access, target, 'administrator'),
      },
      {
        id: 'member',
        label: t('admin-security.makeMember'),
        icon: UserRound,
        onSelect: () => setPending({ kind: 'role', member, role: 'member' }),
        hidden: member.role !== 'administrator' || !can.changeMemberRole(access, target, 'member'),
      },
      {
        id: 'suspend',
        label: t('admin-security.suspend'),
        icon: PauseCircle,
        onSelect: () => setPending({ kind: 'suspend', member }),
        hidden: isSelf || member.status !== 'active' || !can.suspendMember(access, target),
      },
      {
        id: 'reactivate',
        label: t('admin-security.reactivate'),
        icon: PlayCircle,
        onSelect: () => setPending({ kind: 'reactivate', member }),
        hidden: member.status !== 'suspended' || !can.suspendMember(access, target),
      },
      {
        id: 'remove',
        label: t('admin-security.removeMember'),
        icon: UserMinus,
        destructive: true,
        onSelect: () => setPending({ kind: 'remove', member }),
        hidden: isSelf || !can.removeMember(access, target),
      },
    ];
  };

  const close = () => setPending(null);
  const name = pending?.member.user.name ?? '';
  let dialog: ReactNode = null;
  if (pending?.kind === 'role') {
    dialog = (
      <ConfirmDialog
        open
        onOpenChange={(open) => !open && close()}
        variant="default"
        title={t('admin-security.changeRoleTitle', {
          name,
          role: t(ROLE_KEYS[pending.role]),
        })}
        description={t(
          pending.role === 'administrator'
            ? 'admin-security.makeAdministratorBody'
            : 'admin-security.makeMemberBody',
        )}
        confirmLabel={t('admin-security.changeRoleConfirm')}
        loading={changeRole.isPending}
        onConfirm={async () => {
          if (await changeRole.run({ membershipId: pending.member.id, role: pending.role }))
            close();
        }}
      />
    );
  } else if (pending?.kind === 'suspend' || pending?.kind === 'reactivate') {
    const suspending = pending.kind === 'suspend';
    dialog = (
      <ConfirmDialog
        open
        onOpenChange={(open) => !open && close()}
        variant={suspending ? 'destructive' : 'default'}
        title={t(suspending ? 'admin-security.suspendTitle' : 'admin-security.reactivateTitle', {
          name,
        })}
        description={t(suspending ? 'admin-security.suspendBody' : 'admin-security.reactivateBody')}
        confirmLabel={t(suspending ? 'admin-security.suspend' : 'admin-security.reactivate')}
        loading={setStatus.isPending}
        onConfirm={async () => {
          const done = await setStatus.run({
            membershipId: pending.member.id,
            status: suspending ? 'suspended' : 'active',
          });
          if (done) close();
        }}
      />
    );
  } else if (pending?.kind === 'remove') {
    dialog = (
      <ConfirmDialog
        open
        onOpenChange={(open) => !open && close()}
        title={t('admin-security.removeTitle', { name })}
        description={t('admin-security.removeBody')}
        confirmLabel={t('admin-security.removeMember')}
        loading={remove.isPending}
        onConfirm={async () => {
          if ((await remove.run(pending.member.id)) !== undefined) {
            close();
            onRemoved?.();
          }
        }}
      />
    );
  }

  return { actionsFor, dialog };
}
