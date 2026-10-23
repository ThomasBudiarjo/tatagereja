/**
 * Seeds realistic finance data for visual review, through the public API only.
 *
 *   bun scripts/screenshots.ts --port 3102 --seed --routes /churches   # demo account + church
 *   bun apps/api/src/modules/finance/scripts/seed-demo.ts --port 3102
 *
 * Signs in as the screenshot demo account (owner) and adds three members, all with the
 * password `demo-password`: penatua@tatagereja.test verifies and approves (segregation of
 * duties), penghitung@tatagereja.test only records (a custom role), and
 * anggota@tatagereja.test is a plain member who sees only their own giving. Then it records a
 * few months of offerings, giving, expenses, a budget, a campaign with pledges and a closed
 * month. Safe to run once per database.
 */
export {};

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3102')}/api`;
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose API payloads in a dev script
type Json = Record<string, any>;

async function api<T = Json>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${path}: ${json.error?.message ?? response.status}`);
  return json;
}

const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const sundayBefore = (weeks: number) => {
  const date = new Date();
  date.setDate(date.getDate() - date.getDay() - weeks * 7);
  return date.toISOString().slice(0, 10);
};

const owner = await api<{ token: string; user: { id: string } }>('/auth/login', {
  body: { email, password },
});
const churchId = (
  await api<{ items: { church: { id: string } }[] }>('/churches', { token: owner.token })
).items[0]?.church.id;
if (!churchId) throw new Error('Run the screenshot script with --seed first');
const at = `/churches/${churchId}`;
const fin = `${at}/finance`;
const token = owner.token;

const existing = await api<{ funds: unknown[] }>(`${fin}/setup`, { token });
if (existing.funds.length > 0) {
  console.info('Finance already seeded');
  process.exit(0);
}

await api(`${fin}/setup/defaults`, {
  token,
  body: { openingDate: day(-200).slice(0, 8) + '01', cashOpeningBalance: 4_250_000 },
});
await api(`${fin}/accounts`, {
  token,
  body: {
    name: 'BCA Gereja',
    type: 'bank',
    bankName: 'BCA',
    accountNumber: '437 0123 456',
    openingBalance: 86_500_000,
    openingDate: day(-200).slice(0, 8) + '01',
  },
});
await api(`${fin}/accounts`, {
  token,
  body: {
    name: 'QRIS Gereja',
    type: 'ewallet',
    openingBalance: 0,
    openingDate: day(-200).slice(0, 8) + '01',
  },
});
const setup = await api<{ funds: Json[]; accounts: Json[]; categories: Json[] }>(`${fin}/setup`, {
  token,
});
const fund = (name: string) => setup.funds.find((item) => item.name === name)!.id as string;
const account = (name: string) => setup.accounts.find((item) => item.name === name)!.id as string;
const category = (name: string) =>
  setup.categories.find((item) => item.name === name)!.id as string;

// Members: a Penatua who verifies and approves, a counter who only records, and a member.
const invitation = await api<{ invitation: { token: string } }>(`${at}/invitations`, {
  token,
  body: { expiresInDays: 7 },
});
const join = async (name: string, email: string, permissions: string[]) => {
  const user = await api<{ token: string; user: { id: string } }>('/auth/register', {
    body: { name, email, password: 'demo-password' },
  });
  await api(`/invitations/${invitation.invitation.token}/accept`, {
    method: 'POST',
    token: user.token,
  });
  if (permissions.length > 0) {
    const role = await api<{ role: { id: string } }>(`${at}/roles`, {
      token,
      body: { name: `Peran ${name}`, description: null, permissions },
    });
    const members = await api<{ items: { id: string; userId: string }[] }>(`${at}/members`, {
      token,
    });
    const membership = members.items.find((item) => item.userId === user.user.id)!;
    await api(`${at}/members/${membership.id}/roles`, { token, body: { roleId: role.role.id } });
  }
  return user;
};
const elderEmail = 'penatua@tatagereja.test';
const elder = await join('Pnt. Yohanes Tambunan', elderEmail, [
  'finance.view',
  'finance.approve',
  'finance.reports',
  'finance.record',
]);
await join('Dkn. Ruth Siregar', 'penghitung@tatagereja.test', ['finance.record']);
const member = await join('Andreas Wijaya', 'anggota@tatagereja.test', []);

// Service offerings for the last ten Sundays.
const notes = (total: number) => {
  const result: Record<string, number> = {};
  let rest = total;
  for (const value of [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000]) {
    const count = Math.floor(rest / value / (value >= 50_000 ? 1.6 : 1));
    if (count > 0) {
      result[String(value)] = count;
      rest -= count * value;
    }
  }
  return { denominations: result, amount: total - rest };
};
for (let week = 10; week >= 0; week -= 1) {
  for (const [label, base] of [
    ['Ibadah Umum 1', 4_200_000],
    ['Ibadah Umum 2', 2_650_000],
  ] as const) {
    const cash = notes(base + ((week * 137_000) % 900_000));
    const qris = 350_000 + ((week * 61_000) % 400_000);
    const created = await api<{ batch: { id: string } }>(`${fin}/offerings`, {
      token,
      body: {
        serviceDate: sundayBefore(week),
        serviceLabel: label,
        accountId: account('Kas Tunai'),
        counter1UserId: owner.user.id,
        counter2Name: week % 2 ? 'Dkn. Ruth Siregar' : 'Dkn. Samuel Nainggolan',
        lines: [
          {
            fundId: fund('Kas Umum'),
            categoryId: category('Persembahan Ibadah'),
            method: 'cash',
            ...cash,
          },
          {
            fundId: fund('Kas Umum'),
            categoryId: category('Persembahan Ibadah'),
            method: 'qris',
            accountId: account('QRIS Gereja'),
            amount: qris,
          },
          ...(label === 'Ibadah Umum 1'
            ? [{ fundId: fund('Pembangunan'), method: 'cash', amount: 750_000 + week * 25_000 }]
            : []),
        ],
        submit: week > 0 || label === 'Ibadah Umum 2',
      },
    });
    if (week > 0)
      await api(`${fin}/offerings/${created.batch.id}/verify`, {
        method: 'POST',
        token: elder.token,
      });
  }
}

// Individual giving, including a long Batak name to check how lists wrap it.
await api(`${at}/people`, {
  token,
  body: {
    firstName: 'Theodorus Hasiholan',
    lastName: 'Lumbantobing Simatupang Panggabean',
    membershipStatus: 'member',
  },
});
const people = await api<{ items: { id: string; firstName: string }[] }>(`${at}/people?limit=50`, {
  token,
});
// The plain member sees their own giving under "My giving".
const andreas = people.items.find((person) => person.firstName === 'Andreas');
if (andreas) {
  await api(`${at}/people/${andreas.id}/user`, {
    method: 'PUT',
    token,
    body: { userId: member.user.id },
  });
}
const kinds = ['tithe', 'tithe', 'thanksgiving', 'tithe', 'donation', 'special'] as const;
let index = 0;
for (let month = 5; month >= 0; month -= 1) {
  for (const person of people.items) {
    index += 1;
    const kind = kinds[index % kinds.length]!;
    await api(`${fin}/contributions`, {
      token,
      body: {
        personId: person.id,
        kind,
        fundId: kind === 'special' ? fund('Misi') : fund('Kas Umum'),
        accountId: account('BCA Gereja'),
        method: index % 3 === 0 ? 'qris' : 'transfer',
        amount: (kind === 'tithe' ? 1_000_000 : 250_000) + ((index * 175_000) % 1_500_000),
        receivedAt: day(-month * 30 - (index % 20)),
        reference: `TRX${100200 + index}`,
      },
    });
  }
}
await api(`${fin}/contributions`, {
  token,
  body: {
    kind: 'thanksgiving',
    fundId: fund('Diakonia'),
    accountId: account('Kas Tunai'),
    method: 'cash',
    amount: 500_000,
    receivedAt: day(-3),
    note: 'Syukur kesembuhan',
  },
});

// Campaign and pledges.
const campaign = await api<{ campaign: { id: string } }>(`${fin}/campaigns`, {
  token,
  body: {
    name: 'Renovasi Gedung Gereja',
    description: 'Atap, sound system, dan ruang Sekolah Minggu.',
    fundId: fund('Pembangunan'),
    targetAmount: 750_000_000,
    startDate: day(-150),
    endDate: day(200),
  },
});
for (const [position, person] of people.items.slice(0, 4).entries()) {
  await api(`${fin}/campaigns/${campaign.campaign.id}/pledges`, {
    token,
    body: {
      personId: person.id,
      amount: [25_000_000, 10_000_000, 15_000_000, 5_000_000][position],
    },
  });
  await api(`${fin}/contributions`, {
    token,
    body: {
      personId: person.id,
      kind: 'pledge_payment',
      fundId: fund('Pembangunan'),
      accountId: account('BCA Gereja'),
      campaignId: campaign.campaign.id,
      method: 'transfer',
      amount: [7_500_000, 4_000_000, 2_500_000, 5_000_000][position],
      receivedAt: day(-20 - position * 9),
    },
  });
}

// Expenses through every state.
const expense = async (
  body: Json,
  steps: ('approve' | 'reject' | 'pay')[] = [],
  requester = token,
) => {
  const created = await api<{ expense: { id: string } }>(`${fin}/expenses`, {
    token: requester,
    body: { fundId: fund('Kas Umum'), submit: steps.length > 0, ...body },
  });
  for (const step of steps) {
    const approver = requester === token ? elder.token : token;
    if (step === 'approve') {
      await api(`${fin}/expenses/${created.expense.id}/decide`, {
        token: approver,
        body: { decision: 'approved' },
      });
    } else if (step === 'reject') {
      await api(`${fin}/expenses/${created.expense.id}/decide`, {
        token: approver,
        body: { decision: 'rejected', note: 'Gunakan anggaran Komisi Pemuda' },
      });
    } else {
      await api(`${fin}/expenses/${created.expense.id}/pay`, {
        token,
        body: {
          accountId: account('BCA Gereja'),
          paidAt: body.paidAt ?? day(-2),
          paymentReference: 'TRF-BCA',
        },
      });
    }
  }
};
for (let month = 5; month >= 1; month -= 1) {
  await expense(
    {
      title: `Listrik & air ${month} bulan lalu`,
      categoryId: category('Listrik, Air & Internet'),
      amount: 2_350_000 + month * 40_000,
      payeeName: 'PLN & PDAM',
      paidAt: day(-month * 30 + 3),
    },
    ['approve', 'pay'],
  );
  await expense(
    {
      title: `Honorarium pemusik bulan ${month}`,
      categoryId: category('Honorarium'),
      amount: 3_000_000,
      payeeName: 'Tim Musik',
      paidAt: day(-month * 30 + 5),
    },
    ['approve', 'pay'],
  );
}
await expense(
  {
    title: 'Konsumsi rapat Majelis Jemaat',
    categoryId: category('Pelayanan & Ibadah'),
    amount: 850_000,
    payeeName: 'Katering Berkat',
    attachmentUrls: ['https://example.com/nota-katering.jpg'],
  },
  ['approve', 'pay'],
);
await expense(
  {
    title: 'Bantuan diakonia keluarga Hutapea',
    categoryId: category('Diakonia'),
    amount: 2_000_000,
    fundId: fund('Diakonia'),
  },
  ['approve'],
);
await expense(
  {
    title: 'Perbaikan sound system',
    categoryId: category('Operasional Gedung'),
    amount: 6_750_000,
    payeeName: 'Toko Audio Sejahtera',
    neededBy: day(10),
  },
  [],
  elder.token,
);
await api(`${fin}/expenses`, {
  token: elder.token,
  body: {
    title: 'Penggantian bensin perkunjungan',
    categoryId: category('Pelayanan & Ibadah'),
    fundId: fund('Kas Umum'),
    amount: 180_000,
    isReimbursement: true,
    reimbursePersonId: people.items[2]!.id,
    submit: true,
  },
});
await expense(
  { title: 'Kaos retret pemuda', categoryId: category('Pelayanan & Ibadah'), amount: 4_500_000 },
  ['reject'],
  elder.token,
);
await expense({ title: 'ATK sekretariat', categoryId: category('Administrasi'), amount: 420_000 });

// Deposit cash to the bank and an adjustment.
await api(`${fin}/transfers`, {
  token,
  body: {
    fromAccountId: account('Kas Tunai'),
    toAccountId: account('BCA Gereja'),
    fundId: fund('Kas Umum'),
    amount: 15_000_000,
    transferDate: day(-12),
    note: 'Setor kolekte',
  },
});
await api(`${fin}/adjustments`, {
  token,
  body: {
    entryDate: day(-9),
    accountId: account('BCA Gereja'),
    fundId: fund('Kas Umum'),
    categoryId: category('Administrasi'),
    amount: -25_000,
    description: 'Biaya administrasi bank',
  },
});

// The yearly budget (RAPB).
const year = new Date().getFullYear();
await api(`${fin}/budgets`, {
  method: 'PUT',
  token,
  body: {
    year,
    items: [
      ['Persembahan Ibadah', 380_000_000],
      ['Perpuluhan', 240_000_000],
      ['Persembahan Syukur', 60_000_000],
      ['Persembahan Khusus', 30_000_000],
      ['Donasi', 25_000_000],
      ['Pelayanan & Ibadah', 60_000_000],
      ['Honorarium', 48_000_000],
      ['Operasional Gedung', 36_000_000],
      ['Listrik, Air & Internet', 30_000_000],
      ['Diakonia', 40_000_000],
      ['Misi & Pekabaran Injil', 35_000_000],
      ['Pembangunan', 120_000_000],
      ['Administrasi', 12_000_000],
    ].map(([name, amount]) => ({ categoryId: category(name as string), amount })),
  },
});

// Close the month before last.
const closing = new Date();
closing.setMonth(closing.getMonth() - 2);
await api(`${fin}/periods/${closing.getFullYear()}/${closing.getMonth() + 1}/close`, {
  method: 'POST',
  token,
}).catch((error) => console.warn(`Could not close a month: ${(error as Error).message}`));
console.info(`Seeded finance for ${churchId}; members ${elderEmail}, penghitung@ and anggota@`);
