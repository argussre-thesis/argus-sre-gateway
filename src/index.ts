import pkg from "../package.json" with { type: "json" };
import { loadConfig, type Config } from "./config.ts";
import { log } from "./log.ts";

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  log("error", "invalid configuration", { error: (err as Error).message });
  process.exit(1);
}

log("info", "gateway starting", { version: pkg.version, port: config.port, backendUrl: config.backendUrl });
