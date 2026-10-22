import type { DictionaryKeys } from '@/lib/i18n/define';
import { commonDictionary } from '@/lib/i18n/common';
import { adminSecurityDictionary } from './admin-security/i18n';
import { announcementsDictionary } from './announcements/i18n';
import { attendanceDictionary } from './attendance/i18n';
import { authDictionary } from './auth/i18n';
import { careDictionary } from './care/i18n';
import { checkinDictionary } from './checkin/i18n';
import { churchesDictionary } from './churches/i18n';
import { commsDictionary } from './comms/i18n';
import { coreDictionary } from './core/i18n';
import { dashboardDictionary } from './dashboard/i18n';
import { eventsDictionary } from './events/i18n';
import { facilitiesDictionary } from './facilities/i18n';
import { financeDictionary } from './finance/i18n';
import { groupsDictionary } from './groups/i18n';
import { insightsDictionary } from './insights/i18n';
import { invitationsDictionary } from './invitations/i18n';
import { peopleDictionary } from './people/i18n';
import { profileDictionary } from './profile/i18n';
import { recordsDictionary } from './records/i18n';
import { worshipDictionary } from './worship/i18n';

/**
 * Every feature dictionary, already listed so features only edit their own `i18n.ts`.
 * A namespace is used once; the key type below is the union of every `<namespace>.<key>`.
 */
export const DICTIONARIES = [
  commonDictionary,
  adminSecurityDictionary,
  announcementsDictionary,
  attendanceDictionary,
  authDictionary,
  careDictionary,
  checkinDictionary,
  churchesDictionary,
  commsDictionary,
  coreDictionary,
  dashboardDictionary,
  eventsDictionary,
  facilitiesDictionary,
  financeDictionary,
  groupsDictionary,
  insightsDictionary,
  invitationsDictionary,
  peopleDictionary,
  profileDictionary,
  recordsDictionary,
  worshipDictionary,
] as const;

export type MessageKey = DictionaryKeys<(typeof DICTIONARIES)[number]>;
