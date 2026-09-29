import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { UserModel } from "./user.model";
import { loginSchema } from "./auth.schemas";
import { login } from "./auth.service";

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 15 * 60 * 1000,
  path: "/"
};

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
  response.clearCookie("mym_access", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
  response.status(204).send();
});
