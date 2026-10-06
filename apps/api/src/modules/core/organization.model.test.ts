import { describe, expect, it } from "vitest";
import { OrganizationModel } from "./organization.model";

describe("Organization academySpaceImages", () => {
  it("allows updating one collage position without creating invalid undefined siblings", async () => {
    const organization = new OrganizationModel({
      name: "Academia de prueba",
      slug: "academia-de-prueba",
      cancellationNoticeHours: 6
    });

    organization.set("academySpaceImages.wide", {
      url: "https://res.cloudinary.com/demo/image/upload/landing-wide.jpg",
      width: 1600,
      height: 900
    });

    await expect(organization.validate()).resolves.toBeUndefined();
    expect(organization.toObject().academySpaceImages).toEqual({
      wide: {
        url: "https://res.cloudinary.com/demo/image/upload/landing-wide.jpg",
        width: 1600,
        height: 900
      }
    });
  });
});
