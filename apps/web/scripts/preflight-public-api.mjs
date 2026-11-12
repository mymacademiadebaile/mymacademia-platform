const timeoutMs = 70_000;
const retryDelayMs = 1_000;
const transientStatuses = new Set([502, 503, 504]);

if (process.env.PUBLIC_DATA_SOURCE === "mock") {
  console.log("[public-api-preflight] skipped because PUBLIC_DATA_SOURCE=mock");
  process.exit(0);
}

const apiBase = (process.env.PUBLIC_BUILD_API_URL ?? "https://mymacademiadebaile.com.ar/api").replace(/\/+$/, "");

function endpoint(path) {
  return new URL(path.replace(/^\//, ""), `${apiBase}/`).toString();
}

function isTransientError(error) {
  return error instanceof TypeError ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
}

async function getWithOneRetry(path) {
  const url = endpoint(path);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok || attempt === 1 || !transientStatuses.has(response.status)) return response;
      console.warn(`[public-api-preflight] ${path} returned ${response.status}; retrying once`);
    } catch (error) {
      if (attempt === 1 || !isTransientError(error)) throw error;
      console.warn(`[public-api-preflight] ${path} had ${error instanceof Error ? error.name : "an unknown network error"}; retrying once`);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  throw new Error(`Preflight exhausted retries for ${path}`);
}

async function assertOk(path) {
  const response = await getWithOneRetry(path);
  if (!response.ok) throw new Error(`Preflight ${path} responded ${response.status}`);
  return response;
}

async function main() {
  try {
    await assertOk("health");
    const response = await assertOk("public/catalog");
    const catalog = await response.json();
    if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.styles) || !catalog.styles.length ||
      !Array.isArray(catalog.professors) || !Array.isArray(catalog.schedule)) {
      throw new Error("Preflight /public/catalog returned an invalid or empty published catalog");
    }
    console.log(`[public-api-preflight] ready: ${catalog.styles.length} styles, ${catalog.professors.length} professors, ${catalog.schedule.length} schedule entries`);
  } catch (error) {
    console.error(`[public-api-preflight] failed for ${apiBase}: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

await main();
