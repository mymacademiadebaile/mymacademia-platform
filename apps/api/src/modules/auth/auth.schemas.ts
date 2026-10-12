import { z } from "zod";

export const userNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre de usuario no puede estar vacío")
  .max(60)
  .transform((value) => value.toLowerCase());

// `login` is the email or the userName; `email` is still accepted for older clients.
export const loginSchema = z
  .object({
    login: z.string().trim().min(1).max(254).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    password: z.string().min(8)
  })
  .refine((value) => value.login || value.email, { message: "Ingresá tu email o nombre de usuario", path: ["login"] })
  .transform(({ login, email, password }) => ({
    login: (login ?? email ?? "").toLowerCase(),
    password
  }));

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase())
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .max(128)
    .regex(/[A-Za-z]/, "La contraseña debe incluir una letra")
    .regex(/[0-9]/, "La contraseña debe incluir un número")
});

export type LoginInput = z.infer<typeof loginSchema>;
