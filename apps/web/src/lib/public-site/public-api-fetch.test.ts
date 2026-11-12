import assert from "node:assert/strict";
import test from "node:test";
import { fetchPublicApi } from "./public-api-fetch.ts";

test("retries one transient upstream response", async () => {
  let calls = 0;
  const response = await fetchPublicApi("https://api.example.test/api/public/catalog", {}, {
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status: calls === 1 ? 504 : 200 });
    },
    sleep: async () => undefined
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("does not retry a non-transient response", async () => {
  let calls = 0;
  const response = await fetchPublicApi("https://api.example.test/api/public/catalog", {}, {
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status: 404 });
    },
    sleep: async () => undefined
  });

  assert.equal(response.status, 404);
  assert.equal(calls, 1);
});

test("retries one network failure", async () => {
  let calls = 0;
  const response = await fetchPublicApi("https://api.example.test/api/public/catalog", {}, {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response("{}", { status: 200 });
    },
    sleep: async () => undefined
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});
