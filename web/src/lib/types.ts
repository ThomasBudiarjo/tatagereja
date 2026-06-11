export interface User {
  id: string;
  church_id: string;
  name: string;
  email: string;
  role: string;
}

export interface Church {
  id: string;
  name: string;
  slug: string;
  address: string;
}

export interface Me {
  user: User;
  church: Church;
}

export const MEMBER_STATUSES = ["active", "inactive", "moved", "deceased", "guest"] as const;

export interface Member {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  address: string;
  birth_date: string;
  gender: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const RELATIONS = ["father", "mother", "child", "spouse", "sibling", "other"] as const;

export interface Family {
  id: string;
  family_name: string;
  head_member_id: string;
  head_name: string;
  member_count: number;
}

export interface FamilyMember {
  id: string;
  member_id: string;
  full_name: string;
  relation: string;
}

export interface FamilyDetail {
  family: Family;
  members: FamilyMember[];
}

export const SERVICE_TYPES = ["Sunday", "Youth", "Prayer", "Cell Group", "Christmas", "Easter", "Other"] as const;

export const SERVICE_ROLES = [
  "Preacher",
  "Worship Leader",
  "Singer",
  "Musician",
  "Multimedia",
  "Usher",
  "Collector",
  "Prayer",
  "Other",
] as const;

export interface Service {
  id: string;
  title: string;
  service_type: string;
  start_time: string;
  end_time: string;
  location: string;
  notes: string;
  attendance_count: number;
  role_count: number;
}

export interface ServiceRole {
  id: string;
  role_name: string;
  member_id: string;
  full_name: string;
  notes: string;
}

export interface AttendanceRecord {
  id: string;
  member_id: string;
  full_name: string;
  is_guest: boolean;
  guest_name: string;
}

export interface DashboardReport {
  total_members: number;
  total_active_members: number;
  total_families: number;
  upcoming_services: { id: string; title: string; service_type: string; start_time: string; location: string }[];
  this_week_roles: { service_id: string; service_title: string; start_time: string; role_name: string; full_name: string }[];
  birthdays_this_month: { id: string; full_name: string; birth_date: string }[];
  recent_attendance: { service_id: string; title: string; start_time: string; count: number }[];
}
