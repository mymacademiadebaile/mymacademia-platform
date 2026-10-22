import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, apiMessage } from "./api.ts";

describe("apiMessage", () => {
  it("does not expose technical or English API error codes", () => {
    assert.equal(
      apiMessage(new ApiError(401, { error: "INVALID_CREDENTIALS" })),
      "No pudimos completar la operación."
    );
    assert.equal(
      apiMessage(new Error("Failed to fetch")),
      "No pudimos completar la operación. Probá nuevamente."
    );
  });

  it("keeps the Spanish message supplied by the API", () => {
    assert.equal(
      apiMessage(new ApiError(429, { message: "Superaste la cantidad de intentos permitidos." })),
      "Superaste la cantidad de intentos permitidos."
    );
  });
});
