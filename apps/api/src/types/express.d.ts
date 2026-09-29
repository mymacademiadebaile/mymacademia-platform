import type { UserRole } from "@mym/shared";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        role: UserRole;
      };
    }
  }
}

export {};
