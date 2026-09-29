import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8)
});

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
