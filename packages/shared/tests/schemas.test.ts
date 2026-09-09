import { describe, expect, it } from 'bun:test';
import {
  announcementInputSchema,
  churchInputSchema,
  createInvitationBodySchema,
  eventInputSchema,
  fullName,
  initials,
  invitationStatusOf,
  loginBodySchema,
  paginationQuerySchema,
  personInputSchema,
  registerBodySchema,
} from '../src';

describe('auth schemas', () => {
  it('trims and lowercases emails and enforces a password length', () => {
    const parsed = registerBodySchema.parse({
      name: '  Ada  ',
      email: ' ADA@Example.COM ',
      password: 'password123',
    });
    expect(parsed).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
    expect(
      registerBodySchema.safeParse({ name: 'A', email: 'nope', password: 'short' }).success,
    ).toBe(false);
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('optional text handling', () => {
  it('turns blank optional fields into null and validates formats', () => {
    const parsed = churchInputSchema.parse({
      name: 'Grace',
      description: '  ',
      email: '',
      website: null,
      city: ' Bandung ',
    });
    expect(parsed.description).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.website).toBeNull();
    expect(parsed.city).toBe('Bandung');
    expect(churchInputSchema.safeParse({ name: 'Grace', website: 'ftp://x.example' }).success).toBe(
      false,
    );
    expect(churchInputSchema.safeParse({ name: 'Grace', brandColor: 'red' }).success).toBe(false);
    expect(churchInputSchema.parse({ name: 'Grace', brandColor: '' }).brandColor).toBeNull();
    expect(churchInputSchema.parse({ name: 'Grace' }).brandColor).toBeNull();
    expect(churchInputSchema.parse({ name: 'Grace', brandColor: '#AABBCC' }).brandColor).toBe(
      '#AABBCC',
    );
  });

  it('applies person defaults and rejects malformed dates', () => {
    const parsed = personInputSchema.parse({ firstName: ' Bob ' });
    expect(parsed).toMatchObject({
      firstName: 'Bob',
      gender: 'unspecified',
      membershipStatus: 'visitor',
      birthDate: null,
    });
    expect(personInputSchema.safeParse({ firstName: 'Bob', birthDate: '31-12-2000' }).success).toBe(
      false,
    );
    expect(personInputSchema.safeParse({ firstName: '' }).success).toBe(false);
  });
});

describe('event and announcement schemas', () => {
  it('requires the end to come after the start', () => {
    const start = '2026-01-01T10:00:00.000Z';
    expect(
      eventInputSchema.safeParse({
        title: 'Service',
        startsAt: start,
        endsAt: '2026-01-01T09:00:00.000Z',
      }).success,
    ).toBe(false);
    const ok = eventInputSchema.parse({
      title: 'Service',
      startsAt: start,
      endsAt: '2026-01-01T11:00:00.000Z',
    });
    expect(ok.groupId).toBeNull();
    expect(ok.isAllDay).toBe(false);
  });

  it('defaults announcements to drafts', () => {
    expect(announcementInputSchema.parse({ title: 'Hi', body: 'There' }).status).toBe('draft');
  });
});

describe('pagination and invitations', () => {
  it('coerces pagination values and caps the page size', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 50 });
    expect(paginationQuerySchema.parse({ page: '3', limit: '10' })).toMatchObject({
      page: 3,
      limit: 10,
    });
    expect(paginationQuerySchema.safeParse({ limit: '5000' }).success).toBe(false);
  });

  it('defaults invitations to a member role that expires in a week', () => {
    expect(createInvitationBodySchema.parse({})).toEqual({
      role: 'member',
      label: null,
      expiresInDays: 7,
      maxUses: null,
    });
  });

  it('derives the invitation status', () => {
    const base = { revokedAt: null, expiresAt: null, maxUses: null, useCount: 0 };
    expect(invitationStatusOf(base)).toBe('active');
    expect(invitationStatusOf({ ...base, revokedAt: new Date().toISOString() })).toBe('revoked');
    expect(invitationStatusOf({ ...base, expiresAt: '2000-01-01T00:00:00.000Z' })).toBe('expired');
    expect(invitationStatusOf({ ...base, maxUses: 2, useCount: 2 })).toBe('exhausted');
  });
});

describe('display helpers', () => {
  it('builds names and initials', () => {
    expect(fullName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace');
    expect(fullName({ firstName: 'Ada', lastName: null })).toBe('Ada');
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('')).toBe('?');
  });
});
