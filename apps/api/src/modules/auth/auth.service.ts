import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { AppError } from "../../common/http/app-error";
import { UserModel } from "./user.model";
import type { LoginInput } from "./auth.schemas";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

type TokenType = "access" | "refresh";
type TokenUser = {
  id?: string;
  _id?: { toString(): string };
  organizationId: { toString(): string };
  role: string;
};

function createToken(user: TokenUser, tokenType: TokenType, expiresIn: string) {
  const userId = user.id ?? user._id?.toString();

  if (!userId) {
    throw new Error("Cannot create an authentication token without a user id");
  }

  return jwt.sign(
    {
      sub: userId,
      organizationId: user.organizationId.toString(),
      role: user.role,
      tokenType
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] }
  );
}

export function createAccessToken(user: TokenUser) {
  return createToken(user, "access", ACCESS_TOKEN_TTL);
}

export function createRefreshToken(user: TokenUser) {
  return createToken(user, "refresh", REFRESH_TOKEN_TTL);
}

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

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  return {
    accessToken,
    refreshToken,
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
