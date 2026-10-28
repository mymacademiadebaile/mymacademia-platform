import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

const servers = [];
try {
  servers.push(await reservePort(), await reservePort());
  const [apiPort, webPort] = servers.map((server) => server.address().port);
  const env = {
    ...process.env,
    E2E_API_URL: `http://127.0.0.1:${apiPort}`,
    MYM_E2E_API_PORT: String(apiPort),
    MYM_E2E_WEB_PORT: String(webPort),
    MYM_QA_RUN_ID: `qa-${Date.now()}-${process.pid}`
  };
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  console.log(`E2E aislado: web ${webPort}, API ${apiPort}, ejecución ${env.MYM_QA_RUN_ID}`);
  const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
  const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], { env, stdio: "inherit" });
  const forward = (signal) => { if (!child.killed) child.kill(signal); };
  process.on("SIGINT", forward); process.on("SIGTERM", forward);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  process.exitCode = code;
} finally {
  await Promise.all(servers.filter((server) => server.listening).map((server) => new Promise((resolve) => server.close(resolve))));
}
