import { describe, expect, it } from "vitest";
import {
  changeAdminPasswordSchema,
  updateAdminProfileSchema
} from "./profile.schemas";

describe("admin profile schemas", () => {
  it("normalizes profile email", () => {
    const result = updateAdminProfileSchema.parse({
      firstName: "Jorge",
      lastName: "Domínguez",
      email: "ADMIN@EXAMPLE.COM",
      phone: "2215550000"
    });

    expect(result.email).toBe("admin@example.com");
  });

  it("rejects weak new passwords", () => {
    expect(() =>
      changeAdminPasswordSchema.parse({
        currentPassword: "oldpassword",
        newPassword: "abcdefghij"
      })
    ).toThrow();

    expect(() =>
      changeAdminPasswordSchema.parse({
        currentPassword: "oldpassword",
        newPassword: "1234567890"
      })
    ).toThrow();
  });

  it("accepts a stronger new password", () => {
    const result = changeAdminPasswordSchema.parse({
      currentPassword: "oldpassword",
      newPassword: "Academia2026"
    });

    expect(result.newPassword).toBe("Academia2026");
  });
});
