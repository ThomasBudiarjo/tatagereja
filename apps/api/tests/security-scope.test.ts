import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { can, type MemberListItem } from '@tatagereja/shared';
import { memberWithRole, setupFinance } from './finance-helpers';
import { createTestApp, seedChurch } from './helpers';
import { OPTIONAL_MODULES } from './route-world';

/*
 * The scope decisions of the authorization pass: a group leader reads a person's attendance
 * only for the groups they lead and adds members only from the directory or join requests (on
 * the audit log); audit viewers without finance or care access see those entries redacted; and
 * role changes name the members they affect.
 */

describe('data scope', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let church: string;

  const get = (path: string, token: string) => t.request('GET', `${church}${path}`, { token });
  const auditOf = async (token: string, query: string) => {
    const response = await get(`/audit-logs?limit=200&${query}`, token);
    expect(response.status).toBe(200);
    return response.json.items as {
      action: string;
      summary: string;
      params: Record<string, unknown>;
      redacted: string | null;
      before: unknown;
      after: unknown;
    }[];
  };

  beforeAll(async () => {
    s = await seedChurch(t);
    church = `/api/churches/${s.church.id}`;
    const modules = await t.request('PATCH', `${church}/modules`, {
      token: s.owner.token,
      body: { modules: OPTIONAL_MODULES },
    });
    expect(modules.status).toBe(200);
  });

  describe('group leaders', () => {
    const session = async (title: string, groupId: string, personId: string) => {
      const created = await t.request('POST', `${church}/attendance/sessions`, {
        token: s.owner.token,
        body: { title, groupId, sessionAt: '2026-09-06T02:00:00.000Z' },
      });
      expect(created.status).toBe(201);
      const marked = await t.request(
        'PUT',
        `${church}/attendance/sessions/${created.json.session.id}/records`,
        {
          token: s.owner.token,
          body: { records: [{ personId, status: 'present', note: `${title} note` }] },
        },
      );
      expect(marked.status).toBe(200);
    };

    it("reads a person's attendance only for the groups they lead", async () => {
      // Alice is in the leader's group and, from now on, in the choir.
      await t.request('POST', `${church}/groups/${s.otherGroup.id}/members`, {
        token: s.owner.token,
        body: { personIds: [s.alice.id] },
      });
      await session('Persekutuan Pemuda', s.group.id, s.alice.id);
      await session('Latihan Paduan Suara', s.otherGroup.id, s.alice.id);

      const titles = (items: { title: string }[]) => items.map((item) => item.title).sort();
      const leaderView = await get(`/people/${s.alice.id}/attendance`, s.leader.token);
      expect(leaderView.status).toBe(200);
      expect(titles(leaderView.json.items)).toEqual(['Persekutuan Pemuda']);
      const history = await get(`/attendance/people/${s.alice.id}`, s.leader.token);
      expect(titles(history.json.history.items)).toEqual(['Persekutuan Pemuda']);
      expect(history.json.history.counts.present).toBe(1);
      const timeline = await get(`/people/${s.alice.id}/timeline`, s.leader.token);
      expect(timeline.json.attendance.total).toBe(1);

      const ownerView = await get(`/people/${s.alice.id}/attendance`, s.owner.token);
      expect(titles(ownerView.json.items)).toEqual(['Latihan Paduan Suara', 'Persekutuan Pemuda']);
    });

    it('does not widen read access by adding someone to their group', async () => {
      await session('Latihan Paduan Suara 2', s.otherGroup.id, s.bob.id);
      expect((await get(`/attendance/people/${s.bob.id}`, s.leader.token)).status).toBe(403);
      const added = await t.request('POST', `${church}/groups/${s.group.id}/members`, {
        token: s.leader.token,
        body: { personIds: [s.bob.id] },
      });
      expect(added.status).toBe(200);
      const history = await get(`/attendance/people/${s.bob.id}`, s.leader.token);
      expect(history.status).toBe(200);
      expect(history.json.history.items).toEqual([]);
      expect(history.json.history.counts).toEqual({ present: 0, absent: 0, excused: 0 });
      const listed = await get(`/people/${s.bob.id}/attendance`, s.leader.token);
      expect(listed.json.items).toEqual([]);
    });

    it('adds members from the directory or join requests only, on the audit log', async () => {
      const entries = await auditOf(s.owner.token, 'action=group.members_add');
      const byLeader = entries.find((entry) => entry.params.asLeader === true);
      expect(byLeader?.summary).toBe('Added Bob Jones to Youth Ministry');
      expect(byLeader?.params).toMatchObject({ name: 'Youth Ministry', members: 'Bob Jones' });

      // Not in this church's directory, not their group.
      const other = await seedChurch(t);
      const stranger = await t.request('POST', `${church}/groups/${s.group.id}/members`, {
        token: s.leader.token,
        body: { personIds: [other.alice.id] },
      });
      expect(stranger.status).toBe(404);
      const notTheirs = await t.request('POST', `${church}/groups/${s.otherGroup.id}/members`, {
        token: s.leader.token,
        body: { personIds: [s.memberPerson.id] },
      });
      expect(notTheirs.status).toBe(403);

      const removed = await t.request(
        'DELETE',
        `${church}/groups/${s.group.id}/members/${s.bob.id}`,
        { token: s.leader.token },
      );
      expect(removed.status).toBe(200);
      const removal = await auditOf(s.owner.token, 'action=group.member_remove');
      expect(removal[0]?.params).toMatchObject({ person: 'Bob Jones', asLeader: true });
    });
  });

  describe('audit redaction', () => {
    let auditor: Awaited<ReturnType<typeof memberWithRole>>;
    let financeAuditor: Awaited<ReturnType<typeof memberWithRole>>;

    beforeAll(async () => {
      const finance = await setupFinance(t, s);
      const gift = await t.request('POST', `${finance.base}/contributions`, {
        token: s.owner.token,
        body: {
          personId: s.alice.id,
          kind: 'tithe',
          fundId: finance.general,
          accountId: finance.bank,
          method: 'transfer',
          amount: 7_654_321,
          receivedAt: '2026-09-06',
        },
      });
      expect(gift.status).toBe(201);
      const careCase = await t.request('POST', `${church}/care/cases`, {
        token: s.owner.token,
        body: { personId: s.alice.id, category: 'grief', title: 'Pendampingan duka Alice' },
      });
      expect(careCase.status).toBe(201);
      auditor = await memberWithRole(t, s, 'Pemeriksa', ['audit.view', 'audit.export']);
      financeAuditor = await memberWithRole(t, s, 'Pemeriksa Keuangan', [
        'audit.view',
        'finance.view',
      ]);
    });

    it('hides finance and care content from audit viewers without that access', async () => {
      const finance = await auditOf(auditor.token, 'module=finance');
      expect(finance.length).toBeGreaterThan(0);
      for (const entry of finance) {
        expect(entry.redacted).toBe('finance');
        expect(entry.params).toEqual({});
        expect(entry.before).toBeNull();
        expect(entry.after).toBeNull();
      }
      const care = await auditOf(auditor.token, 'module=care');
      expect(care.length).toBeGreaterThan(0);
      expect(care.every((entry) => entry.redacted === 'care')).toBe(true);
      const text = JSON.stringify([...finance, ...care]);
      expect(text).not.toMatch(/7[.,]?654[.,]?321/);
      expect(text).not.toContain('Alice');

      // Searching cannot find what is hidden, and the export matches the screen.
      expect(await auditOf(auditor.token, 'q=Alice')).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ redacted: 'finance' })]),
      );
      expect((await auditOf(auditor.token, 'module=care&q=duka')).length).toBe(0);
      const csv = await get('/audit-logs/export', auditor.token);
      expect(csv.status).toBe(200);
      expect(String(csv.json)).not.toMatch(/7[.,]?654[.,]?321|Pendampingan duka/);

      // Finance access shows finance entries in full; care stays hidden without care access.
      const full = await auditOf(financeAuditor.token, 'module=finance&action=contribution.create');
      expect(full[0]?.redacted).toBeNull();
      expect(JSON.stringify(full[0]?.after)).toContain('7654321');
      expect((await auditOf(financeAuditor.token, 'module=care'))[0]?.redacted).toBe('care');
      expect((await auditOf(s.owner.token, 'module=care'))[0]?.redacted).toBeNull();
    });

    it('redacts the recent entries of the security overview the same way', async () => {
      const security = await memberWithRole(t, s, 'Pengawas', ['audit.view', 'security.view']);
      const overview = await get('/security/overview', security.token);
      expect(overview.status).toBe(200);
      const recent = overview.json.audit.recent as { module: string; redacted: string | null }[];
      for (const entry of recent) {
        if (entry.module === 'finance' || entry.module === 'care')
          expect(entry.redacted).not.toBe(null);
      }
    });
  });

  describe('member row actions', () => {
    it('lists effective permissions, so hidden actions match what the API refuses', async () => {
      const roles = await get('/roles', s.owner.token);
      const pastorRole = roles.json.items.find(
        (role: { templateKey: string | null }) => role.templateKey === 'pastor',
      );
      const pastor = await t.register('Pdt. Yohanes');
      await t.join(pastor.token, s.invitation.token);
      const listed = async () =>
        (await get('/members?limit=100', s.admin.token)).json.items as (MemberListItem & {
          id: string;
        })[];
      const before = (await listed()).find((item) => item.userId === pastor.user.id)!;
      await t.request('POST', `${church}/members/${before.id}/roles`, {
        token: s.owner.token,
        body: { roleId: pastorRole.id },
      });
      const item = (await listed()).find((entry) => entry.userId === pastor.user.id)!;
      expect(item.permissions).toContain('care.confidential');

      const adminAccess = (await get('', s.admin.token)).json.access;
      for (const rule of [can.removeMember, can.suspendMember, can.resetMemberPassword]) {
        expect(rule(adminAccess, item)).toBe(false);
      }
      const removed = await t.request('DELETE', `${church}/members/${item.id}`, {
        token: s.admin.token,
      });
      expect(removed.status).toBe(403);
      expect(removed.json.error.code).toBe('ESCALATION_DENIED');
      const ownerAccess = (await get('', s.owner.token)).json.access;
      expect(can.removeMember(ownerAccess, item)).toBe(true);
    });
  });

  describe('role changes', () => {
    it('names the member a role change affects', async () => {
      const role = await t.request('POST', `${church}/roles`, {
        token: s.owner.token,
        body: { name: 'Diaken', description: null, permissions: ['care.view'] },
      });
      expect(role.status).toBe(201);
      const members = await get('/members?limit=100', s.owner.token);
      const membership = members.json.items.find(
        (item: { userId: string }) => item.userId === s.member.user.id,
      );
      const assigned = await t.request('POST', `${church}/members/${membership.id}/roles`, {
        token: s.owner.token,
        body: { roleId: role.json.role.id },
      });
      expect(assigned.status).toBe(200);
      const [assignment] = await auditOf(s.owner.token, 'action=member.roles_update');
      expect(assignment?.params).toMatchObject({ member: 'Member', added: 'Diaken' });

      const edited = await t.request('PATCH', `${church}/roles/${role.json.role.id}`, {
        token: s.owner.token,
        body: { name: 'Diaken', description: null, permissions: ['care.view', 'care.manage'] },
      });
      expect(edited.status).toBe(200);
      const [update] = await auditOf(s.owner.token, 'action=role.update');
      expect(update?.summary).toBe('Updated the role Diaken, held by Member');
      expect(update?.params).toMatchObject({ name: 'Diaken', members: 'Member', memberCount: 1 });
    });
  });
});
