import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import { env } from "../../config/env";
import { requireAuth } from "../../middleware/require-auth";
import { sendEmail } from "../../services/mailer";
import { AuditLogModel } from "../audit/audit-log.model";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema
} from "./auth.schemas";
import { login } from "./auth.service";
import { PasswordResetTokenModel } from "./password-reset-token.model";
import { UserModel } from "./user.model";

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 15 * 60 * 1000,
  path: "/"
};

const clearCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

authRouter.post("/login", async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const result = await login(input);

    response.cookie("mym_access", result.accessToken, cookieOptions);
    response.json({ user: result.user });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/forgot-password", async (request, response, next) => {
  try {
    const input = forgotPasswordSchema.parse(request.body);
    const user = await UserModel.findOne({
      email: input.email,
      isActive: true
    });

    if (user) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await PasswordResetTokenModel.deleteMany({ userId: user._id });
      await PasswordResetTokenModel.create({
        userId: user._id,
        tokenHash,
        expiresAt
      });

      const resetUrl = `${env.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;

      try {
        await sendEmail({
          to: user.email,
          subject: "Restablecer contraseña - M&M Academia",
          text:
            `Hola ${user.firstName}. Recibimos una solicitud para restablecer tu contraseña de M&M Academia. ` +
            `Abrí este enlace dentro de los próximos 30 minutos: ${resetUrl}. ` +
            "Si no solicitaste este cambio, ignorá este mensaje."
        });
      } catch {
        await PasswordResetTokenModel.deleteMany({ userId: user._id });
      }
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.post("/reset-password", async (request, response, next) => {
  try {
    const input = resetPasswordSchema.parse(request.body);
    const tokenHash = hashResetToken(input.token);

    const resetToken = await PasswordResetTokenModel.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() }
    });

    if (!resetToken) {
      response.status(400).json({
        error: "INVALID_OR_EXPIRED_RESET_TOKEN",
        message: "El enlace es inválido o ya venció. Solicitá uno nuevo."
      });
      return;
    }

    const user = await UserModel.findOne({
      _id: resetToken.userId,
      isActive: true
    }).select("+passwordHash");

    if (!user) {
      await PasswordResetTokenModel.deleteMany({ userId: resetToken.userId });
      response.status(400).json({
        error: "INVALID_OR_EXPIRED_RESET_TOKEN",
        message: "El enlace es inválido o ya venció. Solicitá uno nuevo."
      });
      return;
    }

    user.passwordHash = await bcrypt.hash(input.password, 12);
    await user.save();

    await Promise.all([
      PasswordResetTokenModel.deleteMany({ userId: user._id }),
      AuditLogModel.create({
        organizationId: user.organizationId,
        actorUserId: user._id,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: "User",
        entityId: user._id
      })
    ]);

    response.clearCookie("mym_access", clearCookieOptions);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await UserModel.findOne({
      _id: request.auth!.userId,
      organizationId: request.auth!.organizationId,
      isActive: true
    }).select("email firstName lastName role branchIds");

    if (!user) {
      response.status(401).json({ error: "USER_NOT_FOUND" });
      return;
    }

    response.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branchIds: user.branchIds.map((id) => id.toString())
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_request, response) => {
  response.clearCookie("mym_access", clearCookieOptions);
  response.status(204).send();
});
