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
