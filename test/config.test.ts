import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.ts";

const GATEWAY_BACKEND_TOKEN = "t".repeat(32);
const AGENT_GATEWAY_TOKEN = "a".repeat(32);
const required = { BACKEND_URL: "http://127.0.0.1:5000", GATEWAY_BACKEND_TOKEN, AGENT_GATEWAY_TOKEN };
const tokens = { gatewayBackendToken: GATEWAY_BACKEND_TOKEN, agentGatewayToken: AGENT_GATEWAY_TOKEN };

test("defaults with only the required values", () => {
  const defaults = { port: 8080, backendUrl: "http://127.0.0.1:5000", mcpHost: "127.0.0.1", mcpPort: 8081, ...tokens };
  assert.deepEqual(loadConfig(required), defaults);
  // `KEY=` lines in a .env file count as unset.
  assert.deepEqual(loadConfig({ ...required, PORT: "", MCP_HOST: "", MCP_PORT: "" }), defaults);
});

test("set values are used", () => {
  const env = { ...required, PORT: "9000", BACKEND_URL: "https://api.argus.example", MCP_HOST: "0.0.0.0", MCP_PORT: "9001" };
  assert.deepEqual(loadConfig(env), {
    port: 9000,
    backendUrl: "https://api.argus.example",
    mcpHost: "0.0.0.0",
    mcpPort: 9001,
    ...tokens,
  });
});

test("missing required values are rejected", () => {
  for (const name of ["BACKEND_URL", "GATEWAY_BACKEND_TOKEN", "AGENT_GATEWAY_TOKEN"] as const) {
    assert.throws(() => loadConfig({ ...required, [name]: "" }), { message: `Missing required environment variable ${name}` });
  }
});

test("bad values are rejected", () => {
  assert.throws(() => loadConfig({ ...required, BACKEND_URL: "ws://127.0.0.1:5000" }), /BACKEND_URL must start with http/);
  for (const PORT of ["0", "65536", "80a", "-1", "8.5", "1e3"]) {
    assert.throws(() => loadConfig({ ...required, PORT }), /PORT must be a port number/, PORT);
  }
});

test("a short token is rejected without showing it", () => {
  // The exact message: it can't contain the token.
  for (const name of ["GATEWAY_BACKEND_TOKEN", "AGENT_GATEWAY_TOKEN"] as const) {
    assert.throws(() => loadConfig({ ...required, [name]: "s".repeat(31) }), { message: `${name} must be at least 32 characters` });
  }
});
