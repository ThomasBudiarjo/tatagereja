import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { auditLogs, churches, churchRoles } from '../src/db/schema';
import { HttpError } from '../src/lib/errors';
import { authPlugin, type ChurchGuard } from '../src/plugins/auth';
import { seedRoleTemplates } from '../src/services/access';
import { notify } from '../src/services/notifications';
import { createTestApp, seedChurch } from './helpers';

type Seed = Awaited<ReturnType<typeof seedChurch>>;
type Role = { id: string; name: string; permissions: string[]; templateKey: string | null };

describe('custom roles, audit log, notifications and modules', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  let s: Seed;
  let base: string;
  const membershipIds = new Map<string, string>();

  const membershipOf = (userId: string) => {
    const id = membershipIds.get(userId);
    if (!id) throw new Error(`No membership for ${userId}`);
    return id;
  };

  const refreshMemberships = async () => {
    const list = await t.request('GET', `${base}/members`, { token: s.owner.token });
    expect(list.status).toBe(200);
    for (const item of list.json.items) membershipIds.set(item.userId, item.id);
  };

  const createRole = async (token: string, body: Record<string, unknown>) =>
    t.request('POST', `${base}/roles`, { token, body: { description: null, ...body } });

  const assign = (token: string, userId: string, roleId: string) =>
    t.request('POST', `${base}/members/${membershipOf(userId)}/roles`, {
      token,
      body: { roleId },
    });

  const accessOf = async (token: string) => {
    const response = await t.request('GET', base, { token });
    expect(response.status).toBe(200);
    return response.json.access as { permissions: string[]; roleIds: string[]; role: string };
  };

  const auditActions = async (query = '') => {
    const response = await t.request('GET', `${base}/audit-logs${query}`, { token: s.owner.token });
    expect(response.status).toBe(200);
    return response.json.items as { action: string; before: any; after: any; summary: string }[];
  };

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}`;
    await refreshMemberships();
  });

  describe('built-in roles', () => {
    it('returns effective permissions in the access object', async () => {
      const owner = await accessOf(s.owner.token);
      expect(owner.permissions).toContain('church.delete');
      expect(owner.permissions).toContain('care.confidential');
      const admin = await accessOf(s.admin.token);
      expect(admin.permissions).toContain('members.manage');
      expect(admin.permissions).not.toContain('church.delete');
      expect(admin.permissions).not.toContain('care.confidential');
      const member = await accessOf(s.member.token);
      expect(member.permissions).toContain('people.view');
      expect(member.permissions).toContain('prayer.submit');
      expect(member.permissions).not.toContain('people.create');
      expect(member.roleIds).toEqual([]);
    });

    it('seeds the suggested role templates once per church', async () => {
      const roles = await t.request('GET', `${base}/roles`, { token: s.admin.token });
      expect(roles.status).toBe(200);
      const keys = roles.json.items.map((role: Role) => role.templateKey).sort();
      expect(keys).toEqual(
        [
          'elder',
          'kids_teacher',
          'ministry_coordinator',
          'pastor',
          'secretary',
          'treasurer',
        ].sort(),
      );
      const names = roles.json.items.map((role: Role) => role.name);
      expect(names).toEqual(
        expect.arrayContaining(['Pendeta', 'Bendahara', 'Guru Sekolah Minggu']),
      );
      expect(roles.json.baseRoles.map((role: { role: string }) => role.role)).toEqual([
        'owner',
        'administrator',
        'member',
      ]);
      expect(seedRoleTemplates(t.db, s.church.id)).toBe(false);
      const count = t.db
        .select()
        .from(churchRoles)
        .where(eq(churchRoles.churchId, s.church.id))
        .all().length;
      expect(count).toBe(6);
    });

    it('seeds templates lazily for churches created before custom roles', async () => {
      const owner = await t.register('Legacy Owner');
      const church = await t.createChurch(owner.token, 'Legacy Church');
      t.db.delete(churchRoles).where(eq(churchRoles.churchId, church.id)).run();
      t.db
        .update(churches)
        .set({ roleTemplatesSeededAt: null })
        .where(eq(churches.id, church.id))
        .run();
      await t.request('GET', `/api/churches/${church.id}`, { token: owner.token });
      await t.request('GET', `/api/churches/${church.id}`, { token: owner.token });
      const roles = await t.request('GET', `/api/churches/${church.id}/roles`, {
        token: owner.token,
      });
      expect(roles.json.items).toHaveLength(6);
    });

    it('hides the roles list from plain members', async () => {
      const denied = await t.request('GET', `${base}/roles`, { token: s.member.token });
      expect(denied.status).toBe(403);
    });
  });

  describe('custom roles', () => {
    it('grants and revokes permissions through assignment', async () => {
      const created = await createRole(s.admin.token, {
        name: 'Data entry',
        permissions: ['people.create', 'people.create', 'attendance.record'],
      });
      expect(created.status).toBe(201);
      expect(created.json.role.permissions).toEqual(['people.create', 'attendance.record']);
      const roleId = created.json.role.id;

      const before = await t.request('POST', `${base}/people`, {
        token: s.member.token,
        body: { firstName: 'Nope' },
      });
      expect(before.status).toBe(403);

      const assigned = await assign(s.admin.token, s.member.user.id, roleId);
      expect(assigned.status).toBe(200);
      expect(assigned.json.roleIds).toEqual([roleId]);
      expect(assigned.json.permissions.permissions).toContain('people.create');

      const access = await accessOf(s.member.token);
      expect(access.roleIds).toEqual([roleId]);
      const allowed = await t.request('POST', `${base}/people`, {
        token: s.member.token,
        body: { firstName: 'Created', lastName: 'By Role' },
      });
      expect(allowed.status).toBe(201);
      const sessions = await t.request('GET', `${base}/attendance/sessions`, {
        token: s.member.token,
      });
      expect(sessions.status).toBe(200);

      const list = await t.request('GET', `${base}/roles`, { token: s.admin.token });
      expect(list.json.items.find((role: Role) => role.id === roleId).memberCount).toBe(1);

      const unassigned = await t.request(
        'DELETE',
        `${base}/members/${membershipOf(s.member.user.id)}/roles/${roleId}`,
        { token: s.admin.token },
      );
      expect(unassigned.status).toBe(200);
      expect(unassigned.json.roleIds).toEqual([]);
      const after = await t.request('POST', `${base}/people`, {
        token: s.member.token,
        body: { firstName: 'Again' },
      });
      expect(after.status).toBe(403);
    });

    it('validates role input and rejects duplicate names', async () => {
      const invalid = await createRole(s.admin.token, { name: '', permissions: ['bogus.key'] });
      expect(invalid.status).toBe(422);
      const ownerOnly = await createRole(s.owner.token, {
        name: 'Destroyer',
        permissions: ['church.delete'],
      });
      expect(ownerOnly.status).toBe(422);
      const duplicate = await createRole(s.admin.token, { name: 'pendeta', permissions: [] });
      expect(duplicate.status).toBe(409);
    });

    it('updates and deletes roles, removing assignments', async () => {
      const created = await createRole(s.admin.token, {
        name: 'Temp',
        permissions: ['groups.create'],
      });
      const roleId = created.json.role.id;
      await assign(s.admin.token, s.leader.user.id, roleId);
      const updated = await t.request('PATCH', `${base}/roles/${roleId}`, {
        token: s.admin.token,
        body: { name: 'Temporary', description: 'For a season', permissions: ['events.manage'] },
      });
      expect(updated.status).toBe(200);
      expect(updated.json.role.permissions).toEqual(['events.manage']);
      const leaderAccess = await accessOf(s.leader.token);
      expect(leaderAccess.permissions).toContain('events.manage');
      expect(leaderAccess.permissions).not.toContain('groups.create');

      const removed = await t.request('DELETE', `${base}/roles/${roleId}`, {
        token: s.admin.token,
      });
      expect(removed.status).toBe(200);
      const leaderAfter = await accessOf(s.leader.token);
      expect(leaderAfter.roleIds).toEqual([]);
      expect(leaderAfter.permissions).not.toContain('events.manage');
      const missing = await t.request('GET', `${base}/roles/${roleId}`, { token: s.admin.token });
      expect(missing.status).toBe(404);
    });

    it('shows a member their own effective permissions only', async () => {
      const own = await t.request(
        'GET',
        `${base}/members/${membershipOf(s.member.user.id)}/permissions`,
        { token: s.member.token },
      );
      expect(own.status).toBe(200);
      expect(own.json.role).toBe('member');
      const other = await t.request(
        'GET',
        `${base}/members/${membershipOf(s.admin.user.id)}/permissions`,
        { token: s.member.token },
      );
      expect(other.status).toBe(403);
      const leader = await t.request(
        'GET',
        `${base}/members/${membershipOf(s.leader.user.id)}/permissions`,
        { token: s.owner.token },
      );
      expect(leader.json.isLeader).toBe(true);
    });
  });

  describe('anti-escalation', () => {
    let delegateToken: string;
    let delegateUserId: string;
    let delegateRoleId: string;

    beforeAll(async () => {
      const delegate = await t.register('Delegate');
      await t.join(delegate.token, s.invitation.token);
      await refreshMemberships();
      delegateToken = delegate.token;
      delegateUserId = delegate.user.id;
      const role = await createRole(s.owner.token, {
        name: 'Role steward',
        permissions: [
          'roles.manage',
          'members.view',
          'members.manage',
          'invitations.manage',
          'finance.view',
        ],
      });
      expect(role.status).toBe(201);
      delegateRoleId = role.json.role.id;
      expect((await assign(s.owner.token, delegateUserId, delegateRoleId)).status).toBe(200);
    });

    it('stops administrators from granting confidential care, but not the owner', async () => {
      const denied = await createRole(s.admin.token, {
        name: 'Counsellor',
        permissions: ['care.view', 'care.confidential'],
      });
      expect(denied.status).toBe(403);
      expect(denied.json.error.code).toBe('ESCALATION_DENIED');
      const allowed = await createRole(s.owner.token, {
        name: 'Counsellor',
        permissions: ['care.view', 'care.confidential'],
      });
      expect(allowed.status).toBe(201);

      const roles = await t.request('GET', `${base}/roles`, { token: s.admin.token });
      const pastor = roles.json.items.find((role: Role) => role.templateKey === 'pastor');
      const assignPastor = await assign(s.admin.token, s.member.user.id, pastor.id);
      expect(assignPastor.status).toBe(403);
      expect(assignPastor.json.error.code).toBe('ESCALATION_DENIED');
    });

    it('stops administrators from acting on members who hold more than they do', async () => {
      const counsellor = await t.register('Counsellor');
      await t.join(counsellor.token, s.invitation.token);
      await refreshMemberships();
      const roles = await t.request('GET', `${base}/roles`, { token: s.owner.token });
      const role = roles.json.items.find((item: Role) => item.name === 'Counsellor');
      expect((await assign(s.owner.token, counsellor.user.id, role.id)).status).toBe(200);
      const membershipId = membershipOf(counsellor.user.id);

      const suspend = await t.request('PATCH', `${base}/members/${membershipId}/status`, {
        token: s.admin.token,
        body: { status: 'suspended' },
      });
      expect(suspend.status).toBe(403);
      expect(suspend.json.error.code).toBe('ESCALATION_DENIED');
      const remove = await t.request('DELETE', `${base}/members/${membershipId}`, {
        token: s.admin.token,
      });
      expect(remove.json.error.code).toBe('ESCALATION_DENIED');
      const unassign = await t.request(
        'DELETE',
        `${base}/members/${membershipId}/roles/${role.id}`,
        { token: s.admin.token },
      );
      expect(unassign.json.error.code).toBe('ESCALATION_DENIED');

      const byOwner = await t.request('DELETE', `${base}/members/${membershipId}`, {
        token: s.owner.token,
      });
      expect(byOwner.status).toBe(200);
    });

    it('limits a delegated role manager to the permissions they hold', async () => {
      const ok = await createRole(delegateToken, { name: 'Viewer', permissions: ['finance.view'] });
      expect(ok.status).toBe(201);
      const tooMuch = await createRole(delegateToken, {
        name: 'Deleter',
        permissions: ['finance.view', 'people.delete'],
      });
      expect(tooMuch.status).toBe(403);
      expect(tooMuch.json.error.code).toBe('ESCALATION_DENIED');

      const roles = await t.request('GET', `${base}/roles`, { token: delegateToken });
      const treasurer = roles.json.items.find((role: Role) => role.templateKey === 'treasurer');
      const editTemplate = await t.request('PATCH', `${base}/roles/${treasurer.id}`, {
        token: delegateToken,
        body: { name: treasurer.name, description: null, permissions: ['finance.view'] },
      });
      expect(editTemplate.status).toBe(403);
      const assignTemplate = await assign(delegateToken, s.member.user.id, treasurer.id);
      expect(assignTemplate.status).toBe(403);

      const assignViewer = await assign(delegateToken, s.member.user.id, ok.json.role.id);
      expect(assignViewer.status).toBe(200);
    });

    it('never edits the owner and stops non-admins from creating administrators', async () => {
      const toOwner = await assign(s.admin.token, s.owner.user.id, delegateRoleId);
      expect(toOwner.status).toBe(403);

      const promote = await t.request(
        'PATCH',
        `${base}/members/${membershipOf(s.member.user.id)}`,
        {
          token: delegateToken,
          body: { role: 'administrator' },
        },
      );
      expect(promote.status).toBe(403);
      expect(promote.json.error.code).toBe('ESCALATION_DENIED');
      const demoteAdmin = await t.request(
        'PATCH',
        `${base}/members/${membershipOf(s.admin.user.id)}`,
        { token: delegateToken, body: { role: 'member' } },
      );
      expect(demoteAdmin.status).toBe(403);

      const inviteAdmin = await t.request('POST', `${base}/invitations`, {
        token: delegateToken,
        body: { role: 'administrator' },
      });
      expect(inviteAdmin.status).toBe(403);
      expect(inviteAdmin.json.error.code).toBe('ESCALATION_DENIED');
      const inviteMember = await t.request('POST', `${base}/invitations`, {
        token: delegateToken,
        body: { role: 'member' },
      });
      expect(inviteMember.status).toBe(201);
    });

    it('prevents locking yourself out of role management', async () => {
      const unassignSelf = await t.request(
        'DELETE',
        `${base}/members/${membershipOf(delegateUserId)}/roles/${delegateRoleId}`,
        { token: delegateToken },
      );
      expect(unassignSelf.status).toBe(409);
      expect(unassignSelf.json.error.code).toBe('LOCKOUT_PREVENTED');

      const stripSelf = await t.request('PATCH', `${base}/roles/${delegateRoleId}`, {
        token: delegateToken,
        body: { name: 'Role steward', description: null, permissions: ['members.view'] },
      });
      expect(stripSelf.status).toBe(409);
      const deleteOwn = await t.request('DELETE', `${base}/roles/${delegateRoleId}`, {
        token: delegateToken,
      });
      expect(deleteOwn.status).toBe(409);

      const stillThere = await accessOf(delegateToken);
      expect(stillThere.permissions).toContain('roles.manage');
    });

    it('scopes roles and memberships to their church', async () => {
      const otherOwner = await t.register('Other Owner');
      const other = await t.createChurch(otherOwner.token, 'Other Church');
      const otherRoles = await t.request('GET', `/api/churches/${other.id}/roles`, {
        token: otherOwner.token,
      });
      const foreignRole = otherRoles.json.items[0].id;
      const crossAssign = await assign(s.owner.token, s.member.user.id, foreignRole);
      expect(crossAssign.status).toBe(404);
      const crossRead = await t.request('GET', `${base}/roles/${foreignRole}`, {
        token: s.owner.token,
      });
      expect(crossRead.status).toBe(404);
      const crossMember = await t.request(
        'POST',
        `/api/churches/${other.id}/members/${membershipOf(s.member.user.id)}/roles`,
        { token: otherOwner.token, body: { roleId: foreignRole } },
      );
      expect(crossMember.status).toBe(404);
    });
  });

  describe('suspended members', () => {
    it('blocks a suspended member until they are reactivated', async () => {
      const target = await t.register('Suspendable');
      await t.join(target.token, s.invitation.token);
      await refreshMemberships();
      const membershipId = membershipOf(target.user.id);

      const bySelf = await t.request(
        'PATCH',
        `${base}/members/${membershipOf(s.admin.user.id)}/status`,
        {
          token: s.admin.token,
          body: { status: 'suspended' },
        },
      );
      expect(bySelf.status).toBe(403);
      const ownerTarget = await t.request(
        'PATCH',
        `${base}/members/${membershipOf(s.owner.user.id)}/status`,
        { token: s.admin.token, body: { status: 'suspended' } },
      );
      expect(ownerTarget.status).toBe(403);
      const byMember = await t.request('PATCH', `${base}/members/${membershipId}/status`, {
        token: s.member.token,
        body: { status: 'suspended' },
      });
      expect(byMember.status).toBe(403);

      const suspended = await t.request('PATCH', `${base}/members/${membershipId}/status`, {
        token: s.admin.token,
        body: { status: 'suspended' },
      });
      expect(suspended.status).toBe(200);
      expect(suspended.json.membership.status).toBe('suspended');

      const blocked = await t.request('GET', base, { token: target.token });
      expect(blocked.status).toBe(403);
      expect(blocked.json.error.code).toBe('MEMBERSHIP_SUSPENDED');
      const blockedPeople = await t.request('GET', `${base}/people`, { token: target.token });
      expect(blockedPeople.status).toBe(403);
      const rejoin = await t.join(target.token, s.invitation.token);
      expect(rejoin.alreadyMember).toBe(true);
      expect((await t.request('GET', base, { token: target.token })).status).toBe(403);

      const mine = await t.request('GET', '/api/churches', { token: target.token });
      expect(mine.json.items[0].status).toBe('suspended');
      const notices = await t.request('GET', '/api/notifications', { token: target.token });
      expect(notices.json.items[0].type).toBe('membership.status_changed');
      expect(notices.json.items[0].churchId).toBeNull();

      const restored = await t.request('PATCH', `${base}/members/${membershipId}/status`, {
        token: s.admin.token,
        body: { status: 'active' },
      });
      expect(restored.status).toBe(200);
      expect((await t.request('GET', base, { token: target.token })).status).toBe(200);
    });

    it('will not hand ownership to a suspended member', async () => {
      const target = await t.register('Suspended Heir');
      await t.join(target.token, s.invitation.token);
      await refreshMemberships();
      await t.request('PATCH', `${base}/members/${membershipOf(target.user.id)}/status`, {
        token: s.owner.token,
        body: { status: 'suspended' },
      });
      const transfer = await t.request('POST', `${base}/transfer-ownership`, {
        token: s.owner.token,
        body: { userId: target.user.id, password: s.owner.password },
      });
      expect(transfer.status).toBe(409);
    });
  });

  describe('audit log', () => {
    it('records sensitive changes with redacted private values', async () => {
      const edit = await t.request('PATCH', base, {
        token: s.admin.token,
        body: { name: 'Seed Church', city: 'Bandung', currency: 'IDR', timezone: 'Asia/Makassar' },
      });
      expect(edit.status).toBe(200);
      expect(edit.json.church.timezone).toBe('Asia/Makassar');
      expect(edit.json.church.currency).toBe('IDR');

      const privateDetails = await t.request('PUT', `${base}/people/${s.bob.id}/private`, {
        token: s.admin.token,
        body: { nationalId: '3201000000000001', medicalNotes: 'Asthma', maritalStatus: 'married' },
      });
      expect(privateDetails.status).toBe(200);
      const deleted = await t.request('DELETE', `${base}/people/${s.bob.id}`, {
        token: s.admin.token,
      });
      expect(deleted.status).toBe(200);

      const entries = await auditActions();
      const actions = entries.map((entry) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'church.create',
          'church.update',
          'invitation.create',
          'invitation.accept',
          'member.role_change',
          'member.roles_update',
          'member.suspend',
          'member.reactivate',
          'role.create',
          'role.update',
          'role.delete',
          'group.leader_assign',
          'person.link_user',
          'person.private_update',
          'person.delete',
        ]),
      );
      const update = entries.find((entry) => entry.action === 'church.update');
      expect(update?.before).toEqual({ city: null, timezone: 'Asia/Jakarta' });
      expect(update?.after).toEqual({ city: 'Bandung', timezone: 'Asia/Makassar' });
      const privateEntry = entries.find((entry) => entry.action === 'person.private_update');
      expect(privateEntry?.after.nationalId).toBe('[redacted]');
      expect(privateEntry?.after.medicalNotes).toBe('[redacted]');
      expect(privateEntry?.after.maritalStatus).toBe('married');
      expect(JSON.stringify(entries)).not.toContain('Asthma');
      expect(JSON.stringify(entries)).not.toContain('3201000000000001');
    });

    it('filters and paginates entries', async () => {
      const roleEntries = await auditActions('?action=role.create');
      expect(roleEntries.length).toBeGreaterThan(0);
      expect(roleEntries.every((entry) => entry.action === 'role.create')).toBe(true);
      const people = await auditActions('?module=people');
      expect(
        people.every((entry) => ['person', 'group'].some((p) => entry.action.startsWith(p))),
      ).toBe(true);
      const page = await t.request('GET', `${base}/audit-logs?limit=2&page=1`, {
        token: s.owner.token,
      });
      expect(page.json.items).toHaveLength(2);
      expect(page.json.total).toBeGreaterThan(2);
      const byActor = await auditActions(`?actorUserId=${s.admin.user.id}`);
      expect(byActor.length).toBeGreaterThan(0);
      const future = await auditActions(`?from=${encodeURIComponent('2999-01-01T00:00:00Z')}`);
      expect(future).toEqual([]);
    });

    it('is visible only with audit.view', async () => {
      expect((await t.request('GET', `${base}/audit-logs`, { token: s.member.token })).status).toBe(
        403,
      );
      expect((await t.request('GET', `${base}/audit-logs`, { token: s.admin.token })).status).toBe(
        200,
      );
    });

    it('keeps an account-level entry when a church is deleted', async () => {
      const owner = await t.register('Deleting Owner');
      const church = await t.createChurch(owner.token, 'Short Lived');
      const removed = await t.request('DELETE', `/api/churches/${church.id}`, {
        token: owner.token,
        body: { password: owner.password },
      });
      expect(removed.status).toBe(200);
      const rows = t.db.select().from(auditLogs).where(eq(auditLogs.entityId, church.id)).all();
      expect(rows.map((row) => row.action)).toEqual(['church.delete']);
      expect(rows[0]?.churchId).toBeNull();
    });
  });

  describe('notifications', () => {
    it('lists, counts and marks notifications as read', async () => {
      const inbox = await t.request('GET', '/api/notifications', { token: s.member.token });
      expect(inbox.status).toBe(200);
      const types = inbox.json.items.map((item: { type: string }) => item.type);
      expect(types).toContain('membership.roles_changed');
      expect(inbox.json.unreadCount).toBe(inbox.json.items.length);

      const count = await t.request(
        'GET',
        `/api/notifications/unread-count?churchId=${s.church.id}`,
        {
          token: s.member.token,
        },
      );
      expect(count.json.count).toBeGreaterThan(0);

      const first = inbox.json.items[0];
      const read = await t.request('PATCH', `/api/notifications/${first.id}`, {
        token: s.member.token,
        body: { read: true },
      });
      expect(read.status).toBe(200);
      expect(read.json.notification.readAt).not.toBeNull();
      const unreadOnly = await t.request('GET', '/api/notifications?unread=true', {
        token: s.member.token,
      });
      expect(unreadOnly.json.items.some((item: { id: string }) => item.id === first.id)).toBe(
        false,
      );

      const foreign = await t.request('PATCH', `/api/notifications/${first.id}`, {
        token: s.admin.token,
        body: { read: false },
      });
      expect(foreign.status).toBe(404);

      const all = await t.request('PATCH', '/api/notifications', {
        token: s.member.token,
        body: { read: true },
      });
      expect(all.json.count).toBe(0);
    });

    it('respects preferences, except for mandatory notices', async () => {
      const prefs = await t.request('GET', '/api/notifications/preferences', {
        token: s.owner.token,
      });
      const accepted = prefs.json.items.find(
        (item: { type: string }) => item.type === 'invitation.accepted',
      );
      expect(accepted).toEqual({
        type: 'invitation.accepted',
        inApp: true,
        email: false,
        mandatory: false,
      });

      const saved = await t.request('PUT', '/api/notifications/preferences', {
        token: s.owner.token,
        body: {
          items: [
            { type: 'invitation.accepted', inApp: false, email: false },
            { type: 'membership.role_changed', inApp: false, email: false },
          ],
        },
      });
      expect(saved.status).toBe(200);
      const unknown = await t.request('PUT', '/api/notifications/preferences', {
        token: s.owner.token,
        body: { items: [{ type: 'made.up', inApp: false, email: false }] },
      });
      expect(unknown.status).toBe(422);

      const before = (
        await t.request('GET', '/api/notifications/unread-count', { token: s.owner.token })
      ).json.count;
      const guest = await t.register('Quiet Guest');
      await t.join(guest.token, s.invitation.token);
      const after = (
        await t.request('GET', '/api/notifications/unread-count', { token: s.owner.token })
      ).json.count;
      expect(after).toBe(before);

      const mandatory = notify(t.db, {
        churchId: s.church.id,
        userIds: [s.owner.user.id],
        type: 'membership.role_changed',
        title: 'Mandatory notice',
      });
      expect(mandatory).toBe(1);
      const prefsAfter = await t.request('GET', '/api/notifications/preferences', {
        token: s.owner.token,
      });
      const roleChanged = prefsAfter.json.items.find(
        (item: { type: string }) => item.type === 'membership.role_changed',
      );
      expect(roleChanged.inApp).toBe(true);
    });

    it('delivers audience notifications to active members only', async () => {
      const toAdmins = notify(t.db, {
        churchId: s.church.id,
        audience: { kind: 'permission', permission: 'audit.view' },
        excludeUserIds: [s.owner.user.id],
        type: 'invitation.accepted',
        title: 'For auditors',
        link: 'https://evil.example/phish',
      });
      expect(toAdmins).toBe(1);
      const adminInbox = await t.request('GET', '/api/notifications', { token: s.admin.token });
      const notice = adminInbox.json.items.find(
        (item: { title: string }) => item.title === 'For auditors',
      );
      expect(notice.link).toBeNull();

      const toGroup = notify(t.db, {
        churchId: s.church.id,
        audience: { kind: 'group', groupId: s.group.id },
        type: 'invitation.accepted',
        title: 'For the youth',
      });
      expect(toGroup).toBe(1);
      const stranger = await t.register('Not A Member');
      const outsider = notify(t.db, {
        churchId: s.church.id,
        userIds: [stranger.user.id],
        type: 'invitation.accepted',
        title: 'Should not arrive',
      });
      expect(outsider).toBe(0);
    });
  });

  describe('module toggles', () => {
    const probe = (guard: ChurchGuard) =>
      new Elysia()
        .onError(({ error, set }) => {
          if (error instanceof HttpError) {
            set.status = error.statusCode;
            return error.toBody();
          }
        })
        .use(authPlugin(t.deps))
        .get('/api/churches/:churchId/probe', ({ access }) => ({ role: access.role }), {
          church: guard,
        });

    const callProbe = async (guard: ChurchGuard, token: string) => {
      const response = await probe(guard).handle(
        new Request(`http://localhost${base}/probe`, {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      return { status: response.status, json: (await response.json()) as any };
    };

    it('lists module states and lets only settings managers change them', async () => {
      const states = await t.request('GET', `${base}/modules`, { token: s.member.token });
      expect(states.status).toBe(200);
      const finance = states.json.items.find((item: { id: string }) => item.id === 'finance');
      expect(finance).toEqual({ id: 'finance', optional: true, enabled: true });
      const core = states.json.items.find((item: { id: string }) => item.id === 'core');
      expect(core).toEqual({ id: 'core', optional: false, enabled: true });

      const denied = await t.request('PATCH', `${base}/modules`, {
        token: s.member.token,
        body: { modules: { finance: false } },
      });
      expect(denied.status).toBe(403);
      const required = await t.request('PATCH', `${base}/modules`, {
        token: s.admin.token,
        body: { modules: { core: false } },
      });
      expect(required.status).toBe(422);
    });

    it('answers MODULE_DISABLED for a switched-off module', async () => {
      expect((await callProbe('finance', s.member.token)).status).toBe(200);
      const off = await t.request('PATCH', `${base}/modules`, {
        token: s.admin.token,
        body: { modules: { finance: false, care: false } },
      });
      expect(off.status).toBe(200);
      expect(off.json.items.find((item: { id: string }) => item.id === 'finance').enabled).toBe(
        false,
      );
      const church = await t.request('GET', base, { token: s.member.token });
      expect(church.json.church.enabledModules).not.toContain('finance');

      const blocked = await callProbe('finance', s.member.token);
      expect(blocked.status).toBe(403);
      expect(blocked.json.error.code).toBe('MODULE_DISABLED');
      expect((await callProbe('people', s.member.token)).status).toBe(200);

      await t.request('PATCH', `${base}/modules`, {
        token: s.admin.token,
        body: { modules: { finance: true } },
      });
      expect((await callProbe('finance', s.member.token)).status).toBe(200);
      const entries = await auditActions('?action=church.modules_update');
      expect(entries).toHaveLength(2);
    });

    it('checks permissions declared on the route', async () => {
      const guard: ChurchGuard = { module: 'finance', permission: 'finance.view' };
      expect((await callProbe(guard, s.leader.token)).status).toBe(403);
      expect((await callProbe(guard, s.admin.token)).status).toBe(200);
      const anyOf: ChurchGuard = { permission: ['finance.view', 'people.view'] };
      expect((await callProbe(anyOf, s.leader.token)).status).toBe(200);
    });
  });

  describe('security hardening', () => {
    it('sends security headers on API responses', async () => {
      const response = await t.app.handle(new Request('http://localhost/api/meta'));
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(response.headers.get('strict-transport-security')).toBeNull();
      const https = await t.app.handle(
        new Request('http://localhost/api/meta', { headers: { 'x-forwarded-proto': 'https' } }),
      );
      expect(https.headers.get('strict-transport-security')).toContain('max-age=');
    });

    it('refuses oversized request bodies', async () => {
      const body = JSON.stringify({ name: 'x'.repeat(3 * 1024 * 1024) });
      const response = await t.app.handle(
        new Request('http://localhost/api/churches', {
          method: 'POST',
          body,
          headers: {
            'content-type': 'application/json',
            'content-length': String(body.length),
            authorization: `Bearer ${s.owner.token}`,
          },
        }),
      );
      expect(response.status).toBe(413);
      expect(((await response.json()) as any).error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('never returns password hashes or session token hashes', async () => {
      const responses = await Promise.all([
        t.request('GET', '/api/auth/me', { token: s.owner.token }),
        t.request('GET', `${base}/members`, { token: s.owner.token }),
        t.request('GET', '/api/auth/sessions', { token: s.owner.token }),
        t.request('GET', `${base}/audit-logs?limit=200`, { token: s.owner.token }),
        t.request('GET', `${base}/groups/${s.group.id}`, { token: s.owner.token }),
      ]);
      for (const response of responses) {
        const text = JSON.stringify(response.json);
        expect(text).not.toContain('passwordHash');
        expect(text).not.toContain('tokenHash');
        expect(text).not.toContain('$argon2');
      }
    });
  });
});
