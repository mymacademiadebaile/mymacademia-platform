import { z } from "zod";

export const updateAdminProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(50).optional().or(z.literal(""))
});

export const changeAdminPasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z
    .string()
    .min(10, "La nueva contraseña debe tener al menos 10 caracteres")
    .regex(/[A-Za-z]/, "La nueva contraseña debe incluir una letra")
    .regex(/[0-9]/, "La nueva contraseña debe incluir un número")
});

export type UpdateAdminProfileInput = z.infer<typeof updateAdminProfileSchema>;
export type ChangeAdminPasswordInput = z.infer<typeof changeAdminPasswordSchema>;
