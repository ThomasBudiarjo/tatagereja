import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { auditLogs, userTwoFactor } from '../src/db/schema';
import { totpCode } from '../src/modules/admin-security/totp';
import { createTestApp, seedChurch } from './helpers';

type Seed = Awaited<ReturnType<typeof seedChurch>>;
type TestApp = ReturnType<typeof createTestApp>;
type Account = { token: string; password: string; user: { id: string; name: string } };

async function enableTwoFactor(t: TestApp, account: Account) {
  const setup = await t.request('POST', '/api/auth/two-factor/setup', {
    token: account.token,
    body: { password: account.password },
  });
  expect(setup.status).toBe(200);
  t.db
    .update(userTwoFactor)
    .set({ lastUsedStep: null })
    .where(eq(userTwoFactor.userId, account.user.id))
    .run();
  const enable = await t.request('POST', '/api/auth/two-factor/enable', {
    token: account.token,
    body: { code: totpCode(setup.json.secret) },
  });
  expect(enable.status).toBe(200);
  return setup.json.secret as string;
}

describe('admin-security: church administration', () => {
  const t = createTestApp();
  afterAll(() => t.close());

  let s: Seed;
  let base: string;
  /** A member holding a custom role, set per test. */
  let deacon: Account;
  let other: { owner: Account; church: { id: string; name: string } };
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

  /** Gives `deacon` exactly these custom-role permissions (replacing earlier ones). */
  const grantDeacon = async (permissions: string[]) => {
    const role = await t.request('POST', `${base}/roles`, {
      token: s.owner.token,
      body: { name: `Diaken ${Math.random().toString(36).slice(2, 8)}`, permissions },
    });
    expect(role.status).toBe(201);
    const set = await t.request('PUT', `${base}/members/${membershipOf(deacon.user.id)}/roles`, {
      token: s.owner.token,
      body: { roleIds: [role.json.role.id] },
    });
    expect(set.status).toBe(200);
    return role.json.role as { id: string; name: string };
  };

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}`;
    deacon = await t.register('Diaken Markus');
    await t.join(deacon.token, s.invitation.token);
    await refreshMemberships();
    const otherOwner = await t.register('Other owner');
    other = { owner: otherOwner, church: await t.createChurch(otherOwner.token, 'GBI Lain') };
  });

  describe('members', () => {
    it('lists members with filters, sorting, paging and a summary', async () => {
      const all = await t.request('GET', `${base}/members`, { token: s.admin.token });
      expect(all.status).toBe(200);
      expect(all.json.total).toBe(5);
      expect(all.json.summary).toMatchObject({
        total: 5,
        active: 5,
        suspended: 0,
        byRole: { owner: 1, administrator: 1, member: 3 },
      });
      const leader = all.json.items.find(
        (item: { userId: string }) => item.userId === s.leader.user.id,
      );
      expect(leader.isLeader).toBe(true);
      const member = all.json.items.find(
        (item: { userId: string }) => item.userId === s.member.user.id,
      );
      expect(member.personId).toBe(s.memberPerson.id);
      expect(member.manager).toBe(false);
      const admin = all.json.items.find(
        (item: { userId: string }) => item.userId === s.admin.user.id,
      );
      expect(admin.manager).toBe(true);
      expect(admin.twoFactorEnabled).toBe(false);

      const admins = await t.request('GET', `${base}/members?role=administrator`, {
        token: s.admin.token,
      });
      expect(admins.json.items.map((item: { userId: string }) => item.userId)).toEqual([
        s.admin.user.id,
      ]);
      const search = await t.request('GET', `${base}/members?q=leader`, { token: s.admin.token });
      expect(search.json.total).toBe(1);
      const paged = await t.request('GET', `${base}/members?limit=2&page=2&sort=-name`, {
        token: s.admin.token,
      });
      expect(paged.json.items).toHaveLength(2);
      expect(paged.json.total).toBe(5);
      const role = await t.request('GET', `${base}/members?sort=role`, { token: s.admin.token });
      expect(role.json.items[0].role).toBe('owner');
      const withoutTwoFactor = await t.request('GET', `${base}/members?twoFactor=off`, {
        token: s.admin.token,
      });
      expect(withoutTwoFactor.json.items.every((item: { manager: boolean }) => item.manager)).toBe(
        true,
      );

      expect(
        (await t.request('GET', `${base}/members?limit=1000`, { token: s.admin.token })).status,
      ).toBe(422);
      expect(
        (await t.request('GET', `${base}/members?role=bishop`, { token: s.admin.token })).status,
      ).toBe(422);
    });

    it('hides members from plain members and security details without security.view', async () => {
      expect((await t.request('GET', `${base}/members`, { token: s.member.token })).status).toBe(
        403,
      );
      expect((await t.request('GET', `${base}/members`, { token: s.leader.token })).status).toBe(
        403,
      );
      await grantDeacon(['members.view']);
      const list = await t.request('GET', `${base}/members`, { token: deacon.token });
      expect(list.status).toBe(200);
      expect(
        list.json.items.every(
          (item: { twoFactorEnabled: unknown }) => item.twoFactorEnabled === null,
        ),
      ).toBe(true);
      expect(list.json.summary.managersWithoutTwoFactor).toBeNull();
      expect(
        (await t.request('GET', `${base}/members?twoFactor=off`, { token: deacon.token })).status,
      ).toBe(403);
      await grantDeacon(['members.view', 'security.view']);
      const withSecurity = await t.request('GET', `${base}/members`, { token: deacon.token });
      expect(typeof withSecurity.json.items[0].twoFactorEnabled).toBe('boolean');
    });

    it('filters by custom role', async () => {
      const role = await grantDeacon(['members.view']);
      const byRole = await t.request('GET', `${base}/members?roleId=${role.id}`, {
        token: s.admin.token,
      });
      expect(byRole.json.items.map((item: { userId: string }) => item.userId)).toEqual([
        deacon.user.id,
      ]);
    });

    it('shows a member detail with effective permissions to managers and to the member', async () => {
      const detail = await t.request('GET', `${base}/members/${membershipOf(s.leader.user.id)}`, {
        token: s.admin.token,
      });
      expect(detail.status).toBe(200);
      expect(detail.json.leaderGroups.map((group: { name: string }) => group.name)).toEqual([
        'Youth Ministry',
      ]);
      expect(detail.json.permissions.isLeader).toBe(true);
      const own = await t.request('GET', `${base}/members/${membershipOf(s.member.user.id)}`, {
        token: s.member.token,
      });
      expect(own.status).toBe(200);
      expect(own.json.person.name).toBe('Mem Ber');
      expect(
        (
          await t.request('GET', `${base}/members/${membershipOf(s.admin.user.id)}`, {
            token: s.member.token,
          })
        ).status,
      ).toBe(403);
      // A membership of another church is not found here.
      const foreign = await t.request('GET', `/api/churches/${other.church.id}/members`, {
        token: other.owner.token,
      });
      const foreignId = foreign.json.items[0].id;
      expect(
        (await t.request('GET', `${base}/members/${foreignId}`, { token: s.owner.token })).status,
      ).toBe(404);
      expect(
        (
          await t.request('GET', `/api/churches/${other.church.id}/members`, {
            token: s.owner.token,
          })
        ).status,
      ).toBe(403);
    });

    it('asks for the church name when transferring ownership', async () => {
      const wrong = await t.request('POST', `${base}/transfer-ownership`, {
        token: s.owner.token,
        body: {
          userId: s.admin.user.id,
          password: s.owner.password,
          confirmName: 'Another Church',
        },
      });
      expect(wrong.status).toBe(422);
      expect(wrong.json.error.issues[0].path).toBe('confirmName');
      expect(
        (
          await t.request('POST', `${base}/transfer-ownership`, {
            token: s.admin.token,
            body: {
              userId: s.member.user.id,
              password: s.admin.password,
              confirmName: 'Seed Church',
            },
          })
        ).status,
      ).toBe(403);
    });

    it('tells a removed member and records it', async () => {
      const visitor = await t.register('Removed visitor');
      await t.join(visitor.token, s.invitation.token);
      await refreshMemberships();
      const removed = await t.request(
        'DELETE',
        `${base}/members/${membershipOf(visitor.user.id)}`,
        {
          token: s.admin.token,
        },
      );
      expect(removed.status).toBe(200);
      // Notifications come back in the language the app asks for; Indonesian otherwise.
      const inbox = await t.request('GET', '/api/notifications', { token: visitor.token });
      expect(inbox.json.items[0].title).toBe('Anda dikeluarkan dari Seed Church');
      const english = await t.request('GET', '/api/notifications', {
        token: visitor.token,
        headers: { 'accept-language': 'en-GB,en;q=0.9' },
      });
      expect(english.json.items[0].title).toBe('You were removed from Seed Church');
      expect(english.json.items[0].body).toContain('new invitation');
      expect((await t.request('GET', base, { token: visitor.token })).status).toBe(403);
    });

    it('suspends and reactivates a member through a custom role with members.manage', async () => {
      const sexton = await t.register('Koster Timotius');
      await t.join(sexton.token, s.invitation.token);
      await refreshMemberships();
      const target = membershipOf(sexton.user.id);
      const setStatus = (token: string, id: string, status: string, church = base) =>
        t.request('PATCH', `${church}/members/${id}/status`, { token, body: { status } });

      // Without members.manage it is refused; an unknown status is a validation error.
      await grantDeacon(['members.view']);
      expect((await setStatus(deacon.token, target, 'suspended')).status).toBe(403);
      await grantDeacon(['members.view', 'members.manage']);
      expect((await setStatus(deacon.token, target, 'paused')).status).toBe(422);
      // Nobody suspends the owner, an administrator holding more, or themselves.
      for (const userId of [s.owner.user.id, s.admin.user.id, deacon.user.id]) {
        expect((await setStatus(deacon.token, membershipOf(userId), 'suspended')).status).toBe(403);
      }
      // Another church's owner reaches neither this church nor this membership through theirs.
      expect((await setStatus(other.owner.token, target, 'suspended')).status).toBe(403);
      const foreignBase = `/api/churches/${other.church.id}`;
      expect((await setStatus(other.owner.token, target, 'suspended', foreignBase)).status).toBe(
        404,
      );

      const suspended = await setStatus(deacon.token, target, 'suspended');
      expect(suspended.status).toBe(200);
      expect(suspended.json.membership.status).toBe('suspended');
      const blocked = await t.request('GET', base, { token: sexton.token });
      expect(blocked.status).toBe(403);
      expect(blocked.json.error.code).toBe('MEMBERSHIP_SUSPENDED');
      const listed = await t.request('GET', `${base}/members?status=suspended`, {
        token: s.owner.token,
      });
      expect(listed.json.items.map((item: { userId: string }) => item.userId)).toEqual([
        sexton.user.id,
      ]);
      // Repeating the same status changes nothing and records no second entry.
      expect((await setStatus(deacon.token, target, 'suspended')).status).toBe(200);
      const entries = t.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, target))
        .all()
        .filter((row) => row.action === 'member.suspend');
      expect(entries).toHaveLength(1);
      const inbox = await t.request('GET', '/api/notifications', { token: sexton.token });
      expect(inbox.json.items[0].title).toContain('ditangguhkan');

      const restored = await setStatus(deacon.token, target, 'active');
      expect(restored.status).toBe(200);
      expect(restored.json.membership.status).toBe('active');
      expect((await t.request('GET', base, { token: sexton.token })).status).toBe(200);
    });
  });

  describe('roles', () => {
    it('lists the members of a role and enforces anti-escalation', async () => {
      const role = await grantDeacon(['roles.manage', 'members.view']);
      const members = await t.request('GET', `${base}/roles/${role.id}/members`, {
        token: s.admin.token,
      });
      expect(members.status).toBe(200);
      expect(members.json.items.map((item: { user: { id: string } }) => item.user.id)).toEqual([
        deacon.user.id,
      ]);
      expect(
        (await t.request('GET', `${base}/roles/${role.id}/members`, { token: s.member.token }))
          .status,
      ).toBe(403);
      expect(
        (
          await t.request('GET', `/api/churches/${other.church.id}/roles/${role.id}/members`, {
            token: other.owner.token,
          })
        ).status,
      ).toBe(404);

      const escalate = await t.request('POST', `${base}/roles`, {
        token: deacon.token,
        body: { name: 'Bendahara palsu', permissions: ['finance.view'] },
      });
      expect(escalate.status).toBe(403);
      expect(escalate.json.error.code).toBe('ESCALATION_DENIED');
      const allowed = await t.request('POST', `${base}/roles`, {
        token: deacon.token,
        body: { name: 'Penerima tamu', permissions: ['members.view'] },
      });
      expect(allowed.status).toBe(201);
      const ownerOnly = await t.request('POST', `${base}/roles`, {
        token: s.owner.token,
        body: { name: 'Pemilik palsu', permissions: ['security.manage'] },
      });
      expect(ownerOnly.status).toBe(422);
      const lockout = await t.request('DELETE', `${base}/roles/${role.id}`, {
        token: deacon.token,
      });
      expect(lockout.status).toBe(409);
      expect(lockout.json.error.code).toBe('LOCKOUT_PREVENTED');
    });

    it('removes assignments and tells the members when a role in use is deleted', async () => {
      const role = await grantDeacon(['members.view']);
      const deleted = await t.request('DELETE', `${base}/roles/${role.id}`, {
        token: s.owner.token,
      });
      expect(deleted.status).toBe(200);
      const access = await t.request('GET', base, { token: deacon.token });
      expect(access.json.access.roleIds).not.toContain(role.id);
      const inbox = await t.request('GET', '/api/notifications', { token: deacon.token });
      expect(
        inbox.json.items.some((item: { body: string | null }) => item.body?.includes(role.name)),
      ).toBe(true);
      const log = await t.request(
        'GET',
        `${base}/audit-logs?action=role.delete&entityId=${role.id}`,
        {
          token: s.owner.token,
        },
      );
      expect(log.json.items[0].summary).toContain('assigned to 1');
    });
  });

  describe('audit log', () => {
    it('filters by actor, module, action, text and church calendar days', async () => {
      const byActor = await t.request(
        'GET',
        `${base}/audit-logs?actorUserId=${s.owner.user.id}&limit=200`,
        {
          token: s.admin.token,
        },
      );
      expect(byActor.status).toBe(200);
      expect(byActor.json.items.length).toBeGreaterThan(0);
      expect(
        byActor.json.items.every(
          (item: { actorUserId: string }) => item.actorUserId === s.owner.user.id,
        ),
      ).toBe(true);

      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(
        new Date(),
      );
      const days = await t.request('GET', `${base}/audit-logs?fromDate=${today}&toDate=${today}`, {
        token: s.admin.token,
      });
      expect(days.json.total).toBeGreaterThan(0);
      const past = await t.request('GET', `${base}/audit-logs?toDate=2000-01-01`, {
        token: s.admin.token,
      });
      expect(past.json.total).toBe(0);
      const byName = await t.request('GET', `${base}/audit-logs?q=Diaken%20Markus`, {
        token: s.admin.token,
      });
      expect(byName.json.total).toBeGreaterThan(0);
      expect(
        (await t.request('GET', `${base}/audit-logs?fromDate=22-10-2026`, { token: s.admin.token }))
          .status,
      ).toBe(422);
      expect(
        (await t.request('GET', `${base}/audit-logs?module=nope`, { token: s.admin.token })).status,
      ).toBe(422);
    });

    it('offers filter facets and entry details within the church only', async () => {
      const facets = await t.request('GET', `${base}/audit-logs/facets`, { token: s.admin.token });
      expect(facets.status).toBe(200);
      expect(facets.json.modules).toContain('core');
      expect(facets.json.actions).toContain('role.create');
      expect(facets.json.actors.map((actor: { id: string }) => actor.id)).toContain(
        s.owner.user.id,
      );

      const list = await t.request('GET', `${base}/audit-logs?limit=1`, { token: s.admin.token });
      const id = list.json.items[0].id;
      const detail = await t.request('GET', `${base}/audit-logs/${id}`, { token: s.admin.token });
      expect(detail.status).toBe(200);
      expect(detail.json.entry.id).toBe(id);
      expect(
        (
          await t.request('GET', `/api/churches/${other.church.id}/audit-logs/${id}`, {
            token: other.owner.token,
          })
        ).status,
      ).toBe(404);
      expect(
        (await t.request('GET', `${base}/audit-logs/${id}`, { token: s.member.token })).status,
      ).toBe(403);
      expect(
        (await t.request('GET', `${base}/audit-logs/facets`, { token: s.leader.token })).status,
      ).toBe(403);
    });

    it('exports CSV only with both audit permissions, safely, and records the export', async () => {
      // A summary that looks like a formula must not run in a spreadsheet.
      t.db
        .insert(auditLogs)
        .values({
          id: crypto.randomUUID(),
          churchId: s.church.id,
          actorUserId: s.owner.user.id,
          module: 'core',
          action: 'test.formula',
          entityType: 'test',
          summary: '=HYPERLINK("http://evil.example")',
          createdAt: new Date().toISOString(),
        })
        .run();
      const csv = await t.request('GET', `${base}/audit-logs/export?action=test.formula`, {
        token: s.admin.token,
      });
      expect(csv.status).toBe(200);
      const text = String(csv.json);
      expect(text.split('\r\n')[0]).toContain('createdAt,actor,module,action');
      expect(text).toContain(`"'=HYPERLINK(""http://evil.example"")"`);

      await grantDeacon(['audit.view']);
      expect(
        (await t.request('GET', `${base}/audit-logs/export`, { token: deacon.token })).status,
      ).toBe(403);
      await grantDeacon(['audit.export']);
      expect(
        (await t.request('GET', `${base}/audit-logs/export`, { token: deacon.token })).status,
      ).toBe(403);
      await grantDeacon(['audit.view', 'audit.export']);
      expect(
        (await t.request('GET', `${base}/audit-logs/export`, { token: deacon.token })).status,
      ).toBe(200);
      expect(
        (await t.request('GET', `${base}/audit-logs/export`, { token: s.member.token })).status,
      ).toBe(403);

      const recorded = await t.request('GET', `${base}/audit-logs?action=audit.export`, {
        token: s.owner.token,
      });
      expect(recorded.json.total).toBeGreaterThanOrEqual(2);
      expect(recorded.json.items[0].module).toBe('admin-security');
    });
  });

  describe('security overview and backup', () => {
    it('shows the overview by permission', async () => {
      expect(
        (await t.request('GET', `${base}/security/overview`, { token: s.member.token })).status,
      ).toBe(403);
      const admin = await t.request('GET', `${base}/security/overview`, { token: s.admin.token });
      expect(admin.status).toBe(200);
      expect(admin.json.members.total).toBeGreaterThanOrEqual(5);
      expect(admin.json.twoFactor.managers).toBeGreaterThanOrEqual(2);
      expect(admin.json.audit.recent.length).toBeGreaterThan(0);
      expect(admin.json.customRoles).toBeGreaterThanOrEqual(6);
      await grantDeacon(['roles.manage']);
      const limited = await t.request('GET', `${base}/security/overview`, { token: deacon.token });
      expect(limited.status).toBe(200);
      expect(limited.json.twoFactor).toBeNull();
      expect(limited.json.audit).toBeNull();
    });

    it('lets only the owner download a backup, without credentials', async () => {
      expect(
        (
          await t.request('POST', `${base}/security/backup`, {
            token: s.admin.token,
            body: { password: s.admin.password },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await t.request('POST', `${base}/security/backup`, {
            token: other.owner.token,
            body: { password: other.owner.password },
          })
        ).status,
      ).toBe(403);
      const wrong = await t.request('POST', `${base}/security/backup`, {
        token: s.owner.token,
        body: { password: 'wrong' },
      });
      expect(wrong.status).toBe(422);
      const backup = await t.request('POST', `${base}/security/backup`, {
        token: s.owner.token,
        body: { password: s.owner.password },
      });
      expect(backup.status).toBe(200);
      expect(backup.json.format).toBe('tatagereja-backup');
      expect(backup.json.tables.churches[0].name).toBe('Seed Church');
      expect(backup.json.tables.people.length).toBeGreaterThanOrEqual(3);
      expect(backup.json.tables.church_roles.length).toBeGreaterThanOrEqual(6);
      expect(backup.json.tables.users.length).toBeGreaterThanOrEqual(5);
      expect(backup.json.tables.invitations[0].token).toBeUndefined();
      const text = JSON.stringify(backup.json);
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('GBI Lain');
      const log = await t.request('GET', `${base}/audit-logs?action=church.backup_export`, {
        token: s.owner.token,
      });
      expect(log.json.total).toBe(1);
    });
  });

  describe('two-step verification policy', () => {
    it('is changed by the owner only, after turning on their own 2FA', async () => {
      const policy = await t.request('GET', `${base}/security/policy`, { token: s.member.token });
      expect(policy.status).toBe(200);
      expect(policy.json).toMatchObject({
        policy: { requireTwoFactorForManagers: false },
        appliesToYou: false,
      });
      expect(
        (
          await t.request('PUT', `${base}/security/policy`, {
            token: s.admin.token,
            body: { requireTwoFactorForManagers: true },
          })
        ).status,
      ).toBe(403);
      const withoutOwn = await t.request('PUT', `${base}/security/policy`, {
        token: s.owner.token,
        body: { requireTwoFactorForManagers: true },
      });
      expect(withoutOwn.status).toBe(409);
      expect(withoutOwn.json.error.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
      expect(
        (
          await t.request('PUT', `${base}/security/policy`, {
            token: s.owner.token,
            body: { requireTwoFactorForManagers: 'yes' },
          })
        ).status,
      ).toBe(422);
    });

    it('blocks managers without 2FA until they turn it on, and leaves members alone', async () => {
      await grantDeacon(['finance.view']);
      await enableTwoFactor(t, s.owner);
      const on = await t.request('PUT', `${base}/security/policy`, {
        token: s.owner.token,
        body: { requireTwoFactorForManagers: true },
      });
      expect(on.status).toBe(200);
      expect(on.json.policy.requireTwoFactorForManagers).toBe(true);

      const blocked = await t.request('GET', base, { token: s.admin.token });
      expect(blocked.status).toBe(403);
      expect(blocked.json.error.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
      expect(
        (await t.request('GET', `${base}/people`, { token: deacon.token })).json.error.code,
      ).toBe('TWO_FACTOR_SETUP_REQUIRED');
      expect((await t.request('GET', base, { token: s.member.token })).status).toBe(200);
      expect((await t.request('GET', base, { token: s.leader.token })).status).toBe(200);
      expect((await t.request('GET', base, { token: s.owner.token })).status).toBe(200);

      const status = await t.request('GET', '/api/auth/two-factor', { token: s.admin.token });
      expect(status.json.requiredByChurchIds).toEqual([s.church.id]);
      const inbox = await t.request('GET', '/api/notifications', { token: s.admin.token });
      expect(inbox.json.items[0].type).toBe('security.policy_changed');

      await enableTwoFactor(t, s.admin);
      expect((await t.request('GET', base, { token: s.admin.token })).status).toBe(200);

      const log = await t.request('GET', `${base}/audit-logs?action=security.policy_update`, {
        token: s.owner.token,
      });
      expect(log.json.items[0].after).toEqual({ requireTwoFactorForManagers: true });

      const off = await t.request('PUT', `${base}/security/policy`, {
        token: s.owner.token,
        body: { requireTwoFactorForManagers: false },
      });
      expect(off.status).toBe(200);
      expect((await t.request('GET', base, { token: deacon.token })).status).toBe(200);
    });
  });

  describe('modules', () => {
    it('lets a custom role with settings.manage switch optional modules', async () => {
      await grantDeacon(['settings.manage']);
      const off = await t.request('PATCH', `${base}/modules`, {
        token: deacon.token,
        body: { modules: { facilities: false } },
      });
      expect(off.status).toBe(200);
      const status = await t.request('GET', `${base}/facilities/status`, { token: s.owner.token });
      expect(status.json.error.code).toBe('MODULE_DISABLED');
      await grantDeacon(['members.view']);
      expect(
        (
          await t.request('PATCH', `${base}/modules`, {
            token: deacon.token,
            body: { modules: { facilities: true } },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await t.request('PATCH', `${base}/modules`, {
            token: s.owner.token,
            body: { modules: { facilities: true } },
          })
        ).status,
      ).toBe(200);
    });
  });
});
