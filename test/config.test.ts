import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.ts";

const BACKEND_TOKEN = "t".repeat(32);
const required = { BACKEND_URL: "http://127.0.0.1:5000", BACKEND_TOKEN };

test("defaults with only the required values", () => {
  const defaults = { port: 8080, backendUrl: "http://127.0.0.1:5000", backendToken: BACKEND_TOKEN };
  assert.deepEqual(loadConfig(required), defaults);
  // `KEY=` lines in a .env file count as unset.
  assert.deepEqual(loadConfig({ ...required, PORT: "" }), defaults);
});

test("set values are used", () => {
  assert.deepEqual(loadConfig({ ...required, PORT: "9000", BACKEND_URL: "https://api.argus.example" }), {
    port: 9000,
    backendUrl: "https://api.argus.example",
    backendToken: BACKEND_TOKEN,
  });
});

test("missing required values are rejected", () => {
  for (const name of ["BACKEND_URL", "BACKEND_TOKEN"] as const) {
    assert.throws(() => loadConfig({ ...required, [name]: "" }), { message: `Missing required environment variable ${name}` });
  }
});

test("bad values are rejected", () => {
  assert.throws(() => loadConfig({ ...required, BACKEND_URL: "ws://127.0.0.1:5000" }), /BACKEND_URL must start with http/);
  for (const PORT of ["0", "65536", "80a", "-1", "8.5", "1e3"]) {
    assert.throws(() => loadConfig({ ...required, PORT }), /PORT must be a port number/, PORT);
  }
});

test("a short backend token is rejected without showing it", () => {
  // The exact message: it can't contain the token.
  assert.throws(() => loadConfig({ ...required, BACKEND_TOKEN: "s".repeat(31) }), { message: "BACKEND_TOKEN must be at least 32 characters" });
});
