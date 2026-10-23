import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  BASE_ROLE_PERMISSIONS,
  OWNER_ONLY_PERMISSIONS,
  ROLE_TEMPLATE_KEYS,
  hasAny,
  type Access,
  type Permission,
  type RoleTemplateKey,
} from '@tatagereja/shared';
import { insertHousehold, bornYearsAgo } from './checkin-fixtures';
import { createTestApp, seedChurch } from './helpers';
import { PUBLIC_READS, guardOf, keyOf, routeWorld, type Route, type World } from './route-world';

/*
 * The permission and data-scope matrix, generated from the router. Every route is called as
 * nobody, as the owner of another church, as a suspended member, as a plain member, as a
 * group leader, as a member holding each suggested role, as the administrator and owner, and
 * as a member holding a custom role with exactly the route's permission. The test checks the
 * status codes, and that no answer carries data the caller may not see: the church plants
 * canaries (a hidden phone number and birthday, private details, confidential pastoral notes,
 * a large gift, attendance in a group the leader does not lead, a check-in security code) and
 * every response body is searched for them.
 */

/** Values planted in the church, each visible only to the callers its rule allows. */
const CANARY = {
  phone: '0811-7000-1111',
  email: 'hana.canary@example.com',
  address: 'Jl. Kenari Rahasia 77',
  birthday: '1951-08-17',
  nationalId: '3273999900001111',
  medical: 'CANARY-MEDICAL-NOTE',
  privateNotes: 'CANARY-PRIVATE-NOTE',
  confidentialCase: 'CANARY-CONFIDENTIAL-CASE',
  confidentialNote: 'CANARY-CONFIDENTIAL-NOTE',
  careCase: 'CANARY-CARE-CASE',
  careNote: 'CANARY-CARE-NOTE',
  choirSession: 'CANARY-CHOIR-SESSION',
  gift: 7_654_321,
} as const;

/** Field names that never leave the server, in any answer to anyone. */
const SECRET_KEYS =
  /"(\w*(Hash|Encrypted)|passwordHash|totpSecret|recoveryCodes?|refreshToken|tokenHash)"\s*:/;

type Caller = {
  name: string;
  /** `null` sends no session. */
  token: string | null;
  kind: 'anonymous' | 'outsider' | 'suspended' | 'member';
  permissions: readonly Permission[];
  userId: string | null;
  /** Holds exactly one permission through a custom role made for the matrix. */
  exact?: Permission;
};

const FINANCE: Permission[] = [
  'finance.view',
  'finance.record',
  'finance.approve',
  'finance.manage',
  'finance.reports',
];

/**
 * Who may see each canary. Hidden contact fields and private details need
 * `people.private.view`; pastoral care text the care team (confidential: `care.confidential`);
 * a gift the people who work with finance; attendance in a group the session list's readers.
 */
const RULES: { name: string; found: (text: string) => boolean; allowed: (c: Caller) => boolean }[] =
  [
    ...(['phone', 'email', 'address', 'birthday'] as const).map((field) => ({
      name: `hidden ${field}`,
      found: (text: string) => text.includes(CANARY[field]),
      allowed: (c: Caller) => c.permissions.includes('people.private.view'),
    })),
    ...(['nationalId', 'medical', 'privateNotes'] as const).map((field) => ({
      name: `private ${field}`,
      found: (text: string) => text.includes(CANARY[field]),
      allowed: (c: Caller) => c.permissions.includes('people.private.view'),
    })),
    ...(['confidentialCase', 'confidentialNote'] as const).map((field) => ({
      name: field,
      found: (text: string) => text.includes(CANARY[field]),
      allowed: (c: Caller) => c.permissions.includes('care.confidential'),
    })),
    ...(['careCase', 'careNote'] as const).map((field) => ({
      name: field,
      found: (text: string) => text.includes(CANARY[field]),
      allowed: (c: Caller) => hasAny(c, ['care.view', 'care.manage', 'care.confidential']),
    })),
    {
      name: 'gift amount',
      found: (text) => /7[.,]?654[.,]?321/.test(text),
      allowed: (c) => hasAny(c, FINANCE),
    },
    {
      name: 'attendance outside the led group',
      found: (text) => text.includes(CANARY.choirSession),
      allowed: (c) => hasAny(c, ['attendance.view', 'attendance.record']),
    },
    {
      name: 'secret field',
      found: (text) => SECRET_KEYS.test(text),
      allowed: () => false,
    },
  ];

/** Routes whose row rules refuse even a holder of the guard permission, with the reason. */
const EXACT_REFUSALS = new Map<string, string>([
  ['GET /api/churches/:churchId/audit-logs/export', 'exporting the log also needs audit.view'],
  [
    'PATCH /api/churches/:churchId/finance/contributions/:id',
    'only whoever recorded a gift (or finance.manage) corrects it',
  ],
]);

/** Every member holds these; a role made of one of them adds nothing to test. */
const MEMBER_DEFAULTS = new Set<Permission>(BASE_ROLE_PERMISSIONS.member);

describe('permission and data-scope matrix', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  const world = routeWorld(t);
  let home: World;
  let other: World;
  const callers: Caller[] = [];
  const exactCallers = new Map<Permission, Caller>();
  let guardianUserId = '';

  const church = () => `/api/churches/${home.seed.church.id}`;
  const as = (token: string) => ({ token });

  const ok = async (method: string, path: string, token: string, body?: unknown) => {
    const response = await t.request(method, `${church()}${path}`, { token, body });
    if (response.status >= 300) {
      throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(response.json)}`);
    }
    return response.json;
  };

  const membershipOf = async (userId: string) => {
    const members = await ok('GET', '/members?limit=100', home.seed.owner.token);
    return (members.items as { id: string; userId: string }[]).find(
      (item) => item.userId === userId,
    )!.id;
  };

  const accessOf = async (token: string) =>
    (await ok('GET', '', token)).access as Access & { permissions: Permission[] };

  const joinWithRole = async (name: string, roleId: string | null) => {
    const account = await t.register(name);
    await t.join(account.token, home.seed.invitation.token);
    if (roleId) {
      await ok(
        'POST',
        `/members/${await membershipOf(account.user.id)}/roles`,
        home.seed.owner.token,
        {
          roleId,
        },
      );
    }
    return account;
  };

  const callerFor = async (
    name: string,
    account: { token: string; user: { id: string } },
    exact?: Permission,
  ): Promise<Caller> => ({
    name,
    token: account.token,
    kind: 'member',
    permissions: (await accessOf(account.token)).permissions,
    userId: account.user.id,
    exact,
  });

  /**
   * A member holding a custom role with exactly `permission`, made on first use. Owner-only
   * permissions cannot be in a custom role (the owner covers them), and a member already holds
   * the member defaults.
   */
  const exactCaller = async (permission: Permission): Promise<Caller | null> => {
    if (OWNER_ONLY_PERMISSIONS.includes(permission) || MEMBER_DEFAULTS.has(permission)) return null;
    const known = exactCallers.get(permission);
    if (known) return known;
    const role = await ok('POST', '/roles', home.seed.owner.token, {
      name: `Matrix ${permission}`,
      description: null,
      permissions: [permission],
    });
    const account = await joinWithRole(`Exact ${permission}`, role.role.id);
    const caller = await callerFor(`exact ${permission}`, account, permission);
    exactCallers.set(permission, caller);
    return caller;
  };

  /** Plants every canary in the home church, through the API as its owner. */
  const plantCanaries = async () => {
    const owner = home.seed.owner.token;
    const { seed } = home;
    const hana = await ok('POST', '/people', owner, {
      firstName: 'Hana',
      lastName: 'Rahasia',
      phone: CANARY.phone,
      email: CANARY.email,
      address: CANARY.address,
      birthDate: CANARY.birthday,
      membershipStatus: 'member',
    });
    const hanaId = hana.person.id as string;
    await ok('PUT', `/people/${hanaId}/privacy`, owner, {
      showPhone: false,
      showEmail: false,
      showAddress: false,
      showBirthday: false,
    });
    await ok('PUT', `/people/${hanaId}/private`, owner, {
      nationalId: CANARY.nationalId,
      maritalStatus: 'widowed',
      medicalNotes: CANARY.medical,
      privateNotes: CANARY.privateNotes,
    });
    // Hana is in the leader's group and in the choir; the choir's attendance is not theirs.
    await ok('POST', `/groups/${seed.group.id}/members`, owner, { personIds: [hanaId] });
    await ok('POST', `/groups/${seed.otherGroup.id}/members`, owner, { personIds: [hanaId] });
    const choir = await ok('POST', '/attendance/sessions', owner, {
      title: CANARY.choirSession,
      groupId: seed.otherGroup.id,
      sessionAt: '2026-09-06T02:00:00.000Z',
      notes: CANARY.choirSession,
    });
    await ok('PUT', `/attendance/sessions/${choir.session.id}/records`, owner, {
      records: [{ personId: hanaId, status: 'present', note: CANARY.choirSession }],
    });

    const confidential = await ok('POST', '/care/cases', owner, {
      personId: hanaId,
      category: 'counseling',
      confidentiality: 'confidential',
      title: 'Konseling keluarga',
      description: CANARY.confidentialCase,
    });
    await ok('POST', `/care/cases/${confidential.case.id}/notes`, owner, {
      body: CANARY.confidentialNote,
    });
    const normal = await ok('POST', '/care/cases', owner, {
      personId: hanaId,
      category: 'hospital',
      title: 'Rawat inap',
      description: CANARY.careCase,
    });
    await ok('POST', `/care/cases/${normal.case.id}/notes`, owner, { body: CANARY.careNote });

    const setup = await ok('POST', '/finance/setup/defaults', owner, {
      openingDate: '2026-01-01',
      cashOpeningBalance: 1_000,
    });
    const funds = (setup.setup?.funds ?? (await ok('GET', '/finance/setup', owner)).funds) as {
      id: string;
    }[];
    const accounts = (await ok('GET', '/finance/setup', owner)).accounts as { id: string }[];
    const gift = await ok('POST', '/finance/contributions', owner, {
      personId: hanaId,
      kind: 'tithe',
      fundId: funds[0]!.id,
      accountId: accounts[0]!.id,
      method: 'transfer',
      amount: CANARY.gift,
      receivedAt: '2026-09-06',
    });
    // A second gift, so church totals never equal the canary.
    await ok('POST', '/finance/contributions', owner, {
      personId: seed.bob.id,
      kind: 'thanksgiving',
      fundId: funds[0]!.id,
      accountId: accounts[0]!.id,
      method: 'cash',
      amount: 50_000,
      receivedAt: '2026-09-06',
    });

    // The member is the guardian of a Sekolah Minggu child who is checked in.
    const child = await ok('POST', '/people', owner, {
      firstName: 'Kiki',
      lastName: 'Ber',
      birthDate: bornYearsAgo(6),
    });
    insertHousehold(t, seed.church.id, 'Keluarga Ber', [
      { personId: seed.memberPerson.id, relationship: 'head' },
      { personId: child.person.id, relationship: 'child' },
    ]);
    guardianUserId = seed.member.user.id;
    await ok('POST', '/checkin/classes/defaults', owner);
    const session = await ok('POST', '/checkin/sessions', owner, {
      name: 'Sekolah Minggu',
      date: new Date().toISOString().slice(0, 10),
    });
    const checked = await ok('POST', `/checkin/sessions/${session.session.id}/checkins`, owner, {
      children: [{ personId: child.person.id }],
      guardianPersonId: seed.memberPerson.id,
    });

    // Detail routes open the canary rows.
    const at = (path: string, id: string) => home.created.set(`/api/churches/:churchId${path}`, id);
    home.created.set(':personId', hanaId);
    at('/people', hanaId);
    at('/care/cases', confidential.case.id);
    at('/finance/contributions', gift.contribution.id);
    at('/attendance/sessions', choir.session.id);
    at('/checkin/sessions', session.session.id);
    at('/checkin/checkins', checked.items[0].id);
  };

  beforeAll(async () => {
    home = { seed: await seedChurch(t), created: new Map() };
    other = { seed: await seedChurch(t), created: new Map() };
    await world.enableModules(home.seed);
    await world.enableModules(other.seed);
    await world.createRows(home);
    await plantCanaries();

    const { seed } = home;
    callers.push(
      { name: 'anonymous', token: null, kind: 'anonymous', permissions: [], userId: null },
      {
        name: "another church's owner",
        token: other.seed.owner.token,
        kind: 'outsider',
        permissions: [],
        userId: other.seed.owner.user.id,
      },
    );
    callers.push(await callerFor('owner', seed.owner));
    callers.push(await callerFor('administrator', seed.admin));
    callers.push(await callerFor('member', seed.member));
    callers.push(await callerFor('leader', seed.leader));
    const roles = (await ok('GET', '/roles', seed.owner.token)).items as {
      id: string;
      templateKey: RoleTemplateKey | null;
    }[];
    for (const key of ROLE_TEMPLATE_KEYS) {
      const role = roles.find((item) => item.templateKey === key);
      expect(role).toBeDefined();
      callers.push(await callerFor(`role ${key}`, await joinWithRole(`Template ${key}`, role!.id)));
    }
    // A pastor who was suspended keeps their roles but reaches nothing.
    const pastor = roles.find((item) => item.templateKey === 'pastor')!;
    const suspended = await joinWithRole('Suspended Pastor', pastor.id);
    const suspendedPermissions = (await accessOf(suspended.token)).permissions;
    await ok(
      'PATCH',
      `/members/${await membershipOf(suspended.user.id)}/status`,
      seed.owner.token,
      {
        status: 'suspended',
      },
    );
    callers.push({
      name: 'suspended pastor',
      token: suspended.token,
      kind: 'suspended',
      permissions: suspendedPermissions,
      userId: suspended.user.id,
    });
  });

  const isChurchRoute = (route: Route) => route.path.startsWith('/api/churches/:churchId');
  const guardPermissions = (route: Route): Permission[] => {
    const guard = guardOf(route);
    if (!guard || guard === true || typeof guard === 'string' || !guard.permission) return [];
    return typeof guard.permission === 'string' ? [guard.permission] : [...guard.permission];
  };

  /** What `caller` may receive from `route`: a status check and the canary scan. */
  const check = (
    route: Route,
    caller: Caller,
    response: { status: number; json: unknown },
  ): string[] => {
    const key = keyOf(route);
    const problems: string[] = [];
    const status = response.status;
    const say = (problem: string) =>
      problems.push(`${key} as ${caller.name} → ${status}: ${problem}`);
    if (status >= 500) say('server error');
    if (caller.kind === 'anonymous') {
      if (status !== 401) say('expected 401');
      return problems;
    }
    if (isChurchRoute(route)) {
      if (caller.kind === 'outsider' && ![403, 404].includes(status)) say('expected 403 or 404');
      if (caller.kind === 'suspended') {
        const code = (response.json as { error?: { code?: string } } | null)?.error?.code;
        if (status !== 403 || code !== 'MEMBERSHIP_SUSPENDED') say('expected 403 SUSPENDED');
      }
      const wanted = guardPermissions(route);
      if (caller.kind === 'member' && wanted.length > 0) {
        const holds = hasAny(caller, wanted);
        if (!holds && status !== 403) say(`expected 403 without ${wanted.join(' or ')}`);
        if (caller.exact && wanted.includes(caller.exact) && (status === 401 || status === 403)) {
          if (!EXACT_REFUSALS.has(key)) say(`refused although it holds ${caller.exact}`);
        }
      }
    }
    if (status >= 200 && status < 300) {
      const text =
        typeof response.json === 'string' ? response.json : JSON.stringify(response.json);
      for (const rule of RULES) {
        if (rule.found(text) && !rule.allowed(caller)) say(`leaks ${rule.name}`);
      }
      // Check-in security codes reach only the guardian and the coordinators.
      const code = /"securityCode"\s*:\s*"[^"]+"/.test(text);
      if (
        code &&
        caller.userId !== guardianUserId &&
        !caller.permissions.includes('checkin.manage')
      ) {
        say('leaks a check-in security code');
      }
    }
    return problems;
  };

  it('knows the guard of every church route', () => {
    const unguarded = world.routes.filter((route) => isChurchRoute(route) && !guardOf(route));
    expect(unguarded.map(keyOf)).toEqual([]);
  });

  it('answers every read with the right status and nothing the caller may not see', async () => {
    const problems: string[] = [];
    const reads = world.reads.filter((route) => !PUBLIC_READS.has(route.path));
    for (const route of reads) {
      const path = world.pathOf(home, route, home);
      const wanted = guardPermissions(route);
      const extra = await Promise.all(wanted.map((permission) => exactCaller(permission)));
      for (const caller of [...callers, ...extra.filter((item) => item !== null)]) {
        const response = await t.request('GET', path, caller.token ? as(caller.token) : {});
        problems.push(...check(route, caller, response));
      }
    }
    expect(problems).toEqual([]);
  });

  /**
   * Searches, filters and downloads the plain route calls do not exercise: searching by a
   * hidden phone number finds nobody, and a birthday list, calendar or export never shows a
   * hidden birthday. `{choir}` and `{hana}` are filled in.
   */
  const VARIANTS: { path: string; oracle?: { text: string; allowed: Permission[] } }[] = [
    { path: '/people?q=Hana' },
    { path: '/people?q=7000-1111', oracle: { text: 'Rahasia', allowed: ['people.private.view'] } },
    {
      path: '/people?q=hana.canary',
      oracle: { text: 'Rahasia', allowed: ['people.private.view'] },
    },
    { path: '/people?celebration=birthday&withinDays=366' },
    { path: '/people/export' },
    { path: '/people/export?q=Hana' },
    {
      path: '/calendar?from=2026-08-01T00:00:00.000Z&to=2026-08-31T00:00:00.000Z&sources=birthdays',
    },
    {
      path: '/care/follow-ups?q=7000',
      oracle: { text: 'Rahasia', allowed: ['people.private.view'] },
    },
    {
      path: '/checkin/households?q=1111',
      oracle: { text: 'Rahasia', allowed: ['people.private.view'] },
    },
    { path: '/audit-logs?q=Hana' },
    {
      path: '/audit-logs?q=7654321',
      oracle: { text: 'contribution', allowed: ['finance.view', 'finance.manage'] },
    },
    { path: '/attendance/sessions?groupId={choir}' },
    { path: '/finance/contributions?personId={hana}' },
    { path: '/records/people?q=Hana' },
    { path: '/worship/people?q=Hana' },
  ];

  it('keeps searches, filters and downloads within what the caller may see', async () => {
    const problems: string[] = [];
    for (const variant of VARIANTS) {
      const path = `${church()}${variant.path}`
        .replace('{choir}', home.seed.otherGroup.id)
        .replace('{hana}', home.created.get(':personId') ?? '');
      const route: Route = { method: 'GET', path: `/api/churches/:churchId${variant.path}` };
      for (const caller of callers) {
        const response = await t.request('GET', path, caller.token ? as(caller.token) : {});
        if (caller.kind !== 'member') continue;
        problems.push(...check(route, caller, response));
        const text = JSON.stringify(response.json);
        const { oracle } = variant;
        if (
          oracle &&
          response.status === 200 &&
          text.includes(oracle.text) &&
          !hasAny(caller, oracle.allowed)
        ) {
          problems.push(`${variant.path} as ${caller.name}: a hidden value finds its owner`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('refuses every church write to outsiders and suspended members', async () => {
    const problems: string[] = [];
    const writes = world.writes.filter((route) => isChurchRoute(route));
    for (const route of writes) {
      const path = world.pathOf(home, route, home);
      const body = world.bodyOf(route, home);
      for (const caller of callers.filter((item) => item.kind !== 'member')) {
        const response = await t.request(route.method, path, {
          ...(caller.token ? as(caller.token) : {}),
          body,
        });
        problems.push(...check(route, caller, response));
      }
    }
    expect(problems).toEqual([]);
  });

  it('refuses every guarded church write to members without its permission', async () => {
    const problems: string[] = [];
    const writes = world.writes.filter(
      (route) => isChurchRoute(route) && guardPermissions(route).length > 0,
    );
    for (const route of writes) {
      const path = world.pathOf(home, route, home);
      const body = world.bodyOf(route, home);
      const wanted = guardPermissions(route);
      // Only callers the guard refuses, so nothing is changed by this pass.
      for (const caller of callers.filter(
        (item) => item.kind === 'member' && !hasAny(item, wanted),
      )) {
        const response = await t.request(route.method, path, { ...as(caller.token!), body });
        problems.push(...check(route, caller, response));
      }
    }
    expect(problems).toEqual([]);
  });

  it('lets a custom role with exactly the route permission through the guard, and leaks nothing', async () => {
    const problems: string[] = [];
    // Deletions last, so the rows the other writes name still exist.
    const writes = world.writes
      .filter((route) => isChurchRoute(route) && guardPermissions(route).length > 0)
      .filter(
        (route) =>
          !/\/(transfer-ownership|leave)$/.test(route.path) &&
          route.path !== '/api/churches/:churchId',
      )
      .sort((a, b) => Number(a.method === 'DELETE') - Number(b.method === 'DELETE'));
    for (const route of writes) {
      const path = world.pathOf(home, route, home);
      const body = world.bodyOf(route, home);
      for (const permission of guardPermissions(route)) {
        const caller = await exactCaller(permission);
        if (!caller) continue;
        const response = await t.request(route.method, path, { ...as(caller.token!), body });
        problems.push(...check(route, caller, response));
      }
    }
    expect(problems).toEqual([]);
  });
});
