import pkg from "../package.json" with { type: "json" };
import { loadConfig, type Config } from "./config.ts";
import { log } from "./log.ts";
import { startRunnerServer } from "./runners/server.ts";

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  log("error", "invalid configuration", { error: (err as Error).message });
  process.exit(1);
}

log("info", "gateway starting", { version: pkg.version, backendUrl: config.backendUrl });
const runners = await startRunnerServer(config);

// Kubernetes sends SIGTERM before killing a pod, Ctrl+C sends SIGINT. `once`: a second Ctrl+C kills right away.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log("info", "shutting down", { signal });
    runners.close();
    // Node exits by itself once nothing is left running; this only catches something that hangs.
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}
