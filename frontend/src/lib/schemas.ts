import * as v from "valibot";

// Server response shapes.
export const UserSchema = v.object({
  id: v.string(),
  email: v.string(),
});
export type User = v.InferOutput<typeof UserSchema>;

export const StatusSchema = v.object({
  status: v.string(),
});

// Form input schemas (also used client-side for UX validation).
export const LoginSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.email("Enter a valid email address")),
  password: v.pipe(v.string(), v.minLength(8, "Password must be at least 8 characters")),
});
export type LoginInput = v.InferOutput<typeof LoginSchema>;

export const RegisterSchema = LoginSchema;
export type RegisterInput = v.InferOutput<typeof RegisterSchema>;

// Scheduling domain response shapes.
export const PelayananTypeSchema = v.object({
  code: v.string(),
  name: v.string(),
});
export type PelayananType = v.InferOutput<typeof PelayananTypeSchema>;

export const RoleSchema = v.object({
  code: v.string(),
  name: v.string(),
  sortOrder: v.number(),
});
export type Role = v.InferOutput<typeof RoleSchema>;

export const PersonSchema = v.object({
  id: v.string(),
  name: v.string(),
  phone: v.string(),
  notes: v.string(),
});
export type Person = v.InferOutput<typeof PersonSchema>;

export const AssignmentSchema = v.object({
  id: v.string(),
  personId: v.string(),
  personName: v.string(),
  roleCode: v.string(),
  roleName: v.string(),
});
export type Assignment = v.InferOutput<typeof AssignmentSchema>;

export const ServiceSchema = v.object({
  id: v.string(),
  pelayananTypeCode: v.string(),
  pelayananTypeName: v.string(),
  date: v.string(),
  startTime: v.string(),
  title: v.string(),
  notes: v.string(),
  assignments: v.array(AssignmentSchema),
});
export type Service = v.InferOutput<typeof ServiceSchema>;

export const AssignResponseSchema = v.object({
  assignment: AssignmentSchema,
  warnings: v.array(v.string()),
});

// Scheduling form input schemas.
export const PersonInputSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "Nama wajib diisi")),
  phone: v.string(),
  notes: v.string(),
});
export type PersonInput = v.InferOutput<typeof PersonInputSchema>;

export const ServiceInputSchema = v.object({
  pelayananTypeCode: v.pipe(v.string(), v.minLength(1, "Jenis pelayanan wajib dipilih")),
  date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD")),
  startTime: v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/, "Format jam HH:MM")),
  title: v.string(),
  notes: v.string(),
});
export type ServiceInput = v.InferOutput<typeof ServiceInputSchema>;

export const RoleInputSchema = v.object({
  code: v.pipe(
    v.string(),
    v.regex(/^[a-z0-9_]{1,40}$/, "Kode harus huruf kecil, angka, atau garis bawah"),
  ),
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "Nama wajib diisi")),
  sortOrder: v.number(),
});
export type RoleInput = v.InferOutput<typeof RoleInputSchema>;

export const AssignInputSchema = v.object({
  personId: v.pipe(v.string(), v.minLength(1, "Pilih jemaat")),
  roleCode: v.pipe(v.string(), v.minLength(1, "Pilih peran")),
});
export type AssignInput = v.InferOutput<typeof AssignInputSchema>;
