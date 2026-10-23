import { describe, expect, it } from 'bun:test';
import {
  canAdministerCareCase,
  canChangeCareConfidentiality,
  canCompleteCareTask,
  canEditCareTask,
  canManageCareCase,
  canManageCareVisit,
  canManageFollowUp,
  canModeratePrayer,
  canReadCareVisit,
  canSeePrayerRequester,
  careVisitInputSchema,
  diakoniaAidInputSchema,
  isCareTaskOverdue,
  moveFollowUpBodySchema,
  visitorFollowUpInputSchema,
  type AccessLike,
  type Permission,
} from '../src';

const access = (
  permissions: readonly Permission[],
  userId = 'u1',
  personId: string | null = null,
): AccessLike => ({
  userId,
  role: 'member',
  leaderGroupIds: [],
  personId,
  permissions,
});

const confidential = { confidentiality: 'confidential' as const };
const normal = { confidentiality: 'normal' as const };

describe('care case rules', () => {
  it('lets caregivers work a case and managers only within their confidentiality', () => {
    expect(canManageCareCase(access([]), confidential, ['u1'])).toBe(true);
    expect(canManageCareCase(access(['care.manage']), normal, [])).toBe(true);
    expect(canManageCareCase(access(['care.manage']), confidential, [])).toBe(false);
    expect(canManageCareCase(access(['care.view']), normal, [])).toBe(false);
  });

  it('keeps assigning and deleting with care managers', () => {
    expect(canAdministerCareCase(access([]), normal, ['u1'])).toBe(false);
    expect(canAdministerCareCase(access(['care.manage']), confidential, ['u1'])).toBe(true);
    expect(canAdministerCareCase(access(['care.manage']), confidential, [])).toBe(false);
  });

  it('lets only care.confidential holders lower confidentiality', () => {
    expect(canChangeCareConfidentiality(access([]), 'normal', 'confidential')).toBe(true);
    expect(canChangeCareConfidentiality(access(['care.manage']), 'confidential', 'normal')).toBe(
      false,
    );
    expect(
      canChangeCareConfidentiality(access(['care.confidential']), 'confidential', 'normal'),
    ).toBe(true);
  });
});

describe('visit rules', () => {
  const visit = { confidentiality: 'normal' as const, createdBy: 'u2', visitorPersonIds: ['p1'] };

  it('shows visits to the care team, the author, the visitors and the case caregivers', () => {
    expect(canReadCareVisit(access(['care.view']), visit)).toBe(true);
    expect(canReadCareVisit(access([]), visit)).toBe(false);
    expect(canReadCareVisit(access([], 'u2'), visit)).toBe(true);
    expect(canReadCareVisit(access([], 'u3', 'p1'), visit)).toBe(true);
    expect(canReadCareVisit(access([]), visit, ['u1'])).toBe(true);
    const secret = { ...visit, confidentiality: 'confidential' as const };
    expect(canReadCareVisit(access(['care.view', 'care.manage']), secret)).toBe(false);
    expect(canReadCareVisit(access(['care.confidential']), secret)).toBe(true);
  });

  it('lets authors, caregivers and managers change visits', () => {
    expect(canManageCareVisit(access([], 'u2'), visit)).toBe(true);
    expect(canManageCareVisit(access(['care.view']), visit)).toBe(false);
    expect(canManageCareVisit(access(['care.manage']), { ...visit, ...confidential })).toBe(false);
  });

  it('needs someone visited', () => {
    expect(careVisitInputSchema.safeParse({ visitDate: '2026-10-01' }).success).toBe(false);
    expect(
      careVisitInputSchema.safeParse({ visitDate: '2026-10-01', personId: crypto.randomUUID() })
        .success,
    ).toBe(true);
  });
});

describe('prayer rules', () => {
  it('lets prayer moderators and care managers moderate', () => {
    expect(canModeratePrayer(access(['prayer.moderate']))).toBe(true);
    expect(canModeratePrayer(access(['care.manage']))).toBe(true);
    expect(canModeratePrayer(access(['care.view']))).toBe(false);
  });

  it('hides anonymous requesters', () => {
    const request = { submittedBy: 'u2', isAnonymous: true };
    expect(canSeePrayerRequester(access([]), request)).toBe(false);
    expect(canSeePrayerRequester(access([], 'u2'), request)).toBe(true);
    expect(canSeePrayerRequester(access(['prayer.moderate']), request)).toBe(true);
  });
});

describe('follow-up and task rules', () => {
  it('lets managers and assignees move a follow-up', () => {
    expect(canManageFollowUp(access(['care.manage']), { assignedUserId: null })).toBe(true);
    expect(canManageFollowUp(access([]), { assignedUserId: 'u1' })).toBe(true);
    expect(canManageFollowUp(access(['care.view']), { assignedUserId: 'u2' })).toBe(false);
  });

  it('lets assignees complete but only creators and managers edit', () => {
    const task = { createdBy: 'u2', assignedUserId: 'u1' };
    expect(canCompleteCareTask(access([]), task)).toBe(true);
    expect(canEditCareTask(access([]), task)).toBe(false);
    expect(canEditCareTask(access([], 'u2'), task)).toBe(true);
    expect(canEditCareTask(access(['care.manage']), task)).toBe(true);
  });

  it('flags overdue open tasks only', () => {
    expect(isCareTaskOverdue({ status: 'open', dueDate: '2026-10-01' }, '2026-10-02')).toBe(true);
    expect(isCareTaskOverdue({ status: 'open', dueDate: '2026-10-02' }, '2026-10-02')).toBe(false);
    expect(isCareTaskOverdue({ status: 'done', dueDate: '2026-10-01' }, '2026-10-02')).toBe(false);
    expect(isCareTaskOverdue({ status: 'open', dueDate: null }, '2026-10-02')).toBe(false);
  });

  it('needs a person or a new visitor, and a reason to close', () => {
    expect(visitorFollowUpInputSchema.safeParse({}).success).toBe(false);
    expect(
      visitorFollowUpInputSchema.safeParse({ newVisitor: { firstName: 'Kevin' } }).success,
    ).toBe(true);
    expect(moveFollowUpBodySchema.safeParse({ stage: 'closed' }).success).toBe(false);
    expect(
      moveFollowUpBodySchema.safeParse({ stage: 'closed', closedReason: 'Pindah kota' }).success,
    ).toBe(true);
  });
});

describe('diakonia input', () => {
  it('keeps amounts optional, whole and non-negative', () => {
    const base = { recipientName: 'Ibu Siti', category: 'food', givenAt: '2026-10-01' };
    expect(diakoniaAidInputSchema.parse(base).amount).toBeNull();
    expect(diakoniaAidInputSchema.safeParse({ ...base, amount: 250_000 }).success).toBe(true);
    expect(diakoniaAidInputSchema.safeParse({ ...base, amount: 1.5 }).success).toBe(false);
    expect(diakoniaAidInputSchema.safeParse({ ...base, amount: -1 }).success).toBe(false);
  });
});
