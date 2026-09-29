import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { AppError } from "../../common/http/app-error";
import { UserModel } from "./user.model";
import type { LoginInput } from "./auth.schemas";

export async function login(input: LoginInput) {
  const user = await UserModel.findOne({
    email: input.email,
    isActive: true
  }).select("+passwordHash");

  if (!user) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const accessToken = jwt.sign(
    {
      sub: user.id,
      organizationId: user.organizationId.toString(),
      role: user.role
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      branchIds: user.branchIds.map((id) => id.toString())
    }
  };
}
