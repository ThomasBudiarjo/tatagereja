/**
 * Demo data for the administration and security screens, created through the API of a running
 * server (after `scripts/screenshots.ts --seed` made the demo church):
 *
 *   bun apps/api/src/modules/admin-security/scripts/seed-demo.ts --port 3100
 *
 * Adds member accounts with custom roles (Pendeta, Majelis, Bendahara), a suspended member, an
 * administrator with two-step verification, invitations, a switched-off module, failed sign-ins
 * and the audit entries all of this produces. Safe to run twice: existing accounts are reused.
 */
import { totpCode } from '../totp';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3100')}/api`;
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');

// Loose JSON for a throwaway script talking to our own API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function api<T = Json>(
  path: string,
  init: { method?: string; token?: string; body?: unknown; ip?: string } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36',
      'x-forwarded-for': init.ip ?? '36.68.12.40',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  return { status: response.status, json };
}

async function account(name: string, mail: string, secret = 'Kasih-Setia 2026!') {
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email: mail, password: secret },
  });
  if (login.status === 200 && login.json.token)
    return { token: login.json.token as string, id: login.json.user.id as string };
  const created = await api('/auth/register', {
    method: 'POST',
    body: { name, email: mail, password: secret },
  });
  if (created.status !== 201) throw new Error(`register ${mail}: ${created.json.error?.message}`);
  return { token: created.json.token as string, id: created.json.user.id as string };
}

const owner = await api('/auth/login', { method: 'POST', body: { email, password } });
if (owner.status !== 200) throw new Error(`Sign in as ${email} first (run the screenshot seed).`);
const token = owner.json.token as string;
const churches = await api('/churches', { token });
const churchId = churches.json.items[0]?.church.id as string;
const at = `/churches/${churchId}`;

const invitation = await api(`${at}/invitations`, {
  method: 'POST',
  token,
  body: { role: 'member', label: 'QR Warta Jemaat', expiresInDays: 30, maxUses: 200 },
});
await api(`${at}/invitations`, {
  method: 'POST',
  token,
  body: { role: 'member', label: 'Komisi Pemuda', expiresInDays: 7 },
});

const people = [
  ['Pdt. Yohanes Tambunan', 'yohanes@example.com', 'Pendeta'],
  ['Andreas Wijaya', 'andreas@example.com', 'Majelis / Penatua'],
  ['Ester Lumbantobing', 'ester@example.com', 'Bendahara'],
  ['Ruth Siregar', 'ruth@example.com', 'Guru Sekolah Minggu'],
  ['Daniel Hutapea', 'daniel@example.com', null],
  ['Samuel Nainggolan', 'samuel@example.com', null],
  ['Lidia Pardede', 'lidia@example.com', 'Sekretaris'],
] as const;

const accounts: Record<string, { token: string; id: string }> = {};
for (const [name, mail] of people) {
  accounts[mail] = await account(name, mail);
  await api(`/invitations/${invitation.json.invitation.token}/accept`, {
    method: 'POST',
    token: accounts[mail]!.token,
  });
}

const members = (await api(`${at}/members`, { token })).json.items as Json[];
const roles = (await api(`${at}/roles`, { token })).json.items as Json[];
const membershipOf = (mail: string) => members.find((item) => item.user.email === mail)!;

for (const [, mail, roleName] of people) {
  if (!roleName) continue;
  const role = roles.find((item) => item.name === roleName);
  if (role) {
    await api(`${at}/members/${membershipOf(mail).id}/roles`, {
      method: 'POST',
      token,
      body: { roleId: role.id },
    });
  }
}
await api(`${at}/members/${membershipOf('yohanes@example.com').id}`, {
  method: 'PATCH',
  token,
  body: { role: 'administrator' },
});
await api(`${at}/members/${membershipOf('samuel@example.com').id}/status`, {
  method: 'PATCH',
  token,
  body: { status: 'suspended' },
});

await api(`${at}/roles`, {
  method: 'POST',
  token,
  body: {
    name: 'Koordinator Multimedia',
    description: 'Mengelola pengumuman dan Warta Jemaat untuk layar ibadah.',
    permissions: ['announcements.manage', 'events.view'],
  },
});

// The pastor protects his account with an authenticator app.
const pastor = accounts['yohanes@example.com']!;
const setup = await api('/auth/two-factor/setup', {
  method: 'POST',
  token: pastor.token,
  body: { password: 'Kasih-Setia 2026!' },
});
if (setup.status === 200) {
  await api('/auth/two-factor/enable', {
    method: 'POST',
    token: pastor.token,
    body: { code: totpCode(setup.json.secret) },
  });
}

await api(`${at}/modules`, { method: 'PATCH', token, body: { modules: { facilities: false } } });
await api(at, {
  method: 'PATCH',
  token,
  body: {
    name: 'GKI Kebon Jati',
    city: 'Bandung',
    phone: '022-4231234',
    email: 'sekretariat@gkikebonjati.or.id',
  },
});

// A few wrong passwords on the demo account, from another address, for the sign-in history.
for (let attempt = 0; attempt < 2; attempt += 1) {
  await api('/auth/login', {
    method: 'POST',
    body: { email, password: 'salah-ketik' },
    ip: '103.10.66.7',
  });
}
await api('/auth/login', { method: 'POST', body: { email, password } });
console.info(`Seeded admin-security demo data in ${churchId}`);
