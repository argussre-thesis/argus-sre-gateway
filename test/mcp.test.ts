import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Config } from "../src/config.ts";
import { startMcpServer } from "../src/mcp/server.ts";
import type { GatewayResult } from "../src/runners/server.ts";

const AGENT_GATEWAY_TOKEN = "a".repeat(32);

// No runner: every op answers `reply`, and its arguments are kept in `calls`.
async function startMcp(t: TestContext, reply: GatewayResult = { ok: true, data: { pods: [] } }) {
  const calls: unknown[][] = [];
  const mcp = await startMcpServer(
    { mcpHost: "127.0.0.1", mcpPort: 0, agentGatewayToken: AGENT_GATEWAY_TOKEN } as Config,
    async (...args) => {
      calls.push(args);
      return reply;
    },
  );
  t.after(() => mcp.close());
  return { calls, url: `http://127.0.0.1:${mcp.port}/mcp/tenants/t1/clusters/minikube` };
}

async function connect(t: TestContext, url: string) {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${AGENT_GATEWAY_TOKEN}` } },
    }),
  );
  t.after(() => client.close());
  return client;
}

test("the tools are listed with strict schemas", async (t) => {
  const { url } = await startMcp(t);
  const { tools } = await (await connect(t, url)).listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ["list_pods", "list_deployments"]);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    assert.deepEqual(tool.inputSchema.required, ["namespace"], tool.name);
  }
});

test("a call runs its op on the URL's tenant and cluster and returns its data as text", async (t) => {
  const { url, calls } = await startMcp(t);
  const client = await connect(t, url);
  const args = { namespace: "demo", labelSelector: "app=web" };
  for (const op of ["list_pods", "list_deployments"]) {
    const result = await client.callTool({ name: op, arguments: args });
    assert.deepEqual(result, { content: [{ type: "text", text: '{"pods":[]}' }] });
  }
  assert.deepEqual(calls, [
    ["t1", "minikube", "list_pods", args],
    ["t1", "minikube", "list_deployments", args],
  ]);
});

test("a failed op is an error result with its code", async (t) => {
  const { url } = await startMcp(t, {
    ok: false,
    error: { code: "RUNNER_OFFLINE", message: 'no runner connected for cluster "minikube"' },
  });
  const result = await (await connect(t, url)).callTool({ name: "list_pods", arguments: { namespace: "demo" } });
  assert.deepEqual(result, {
    content: [{ type: "text", text: 'Error RUNNER_OFFLINE: no runner connected for cluster "minikube"' }],
    isError: true,
  });
});

test("a mistyped argument is an error result, and the op never runs", async (t) => {
  const { url, calls } = await startMcp(t);
  const result = await (await connect(t, url)).callTool({
    name: "list_pods",
    arguments: { namespace: "demo", labelselector: "app=web" },
  });
  assert.equal(result.isError, true);
  assert.match((result.content as { text: string }[])[0]!.text, /Unrecognized key: "labelselector"/);
  assert.deepEqual(calls, []);
});

test("GET answers 405: the server doesn't stream messages to clients", async (t) => {
  const { url } = await startMcp(t);
  const res = await fetch(url, { headers: { authorization: `Bearer ${AGENT_GATEWAY_TOKEN}` } });
  assert.equal(res.status, 405);
});

test("a missing or wrong token is refused with 401", async (t) => {
  const { url, calls } = await startMcp(t);
  for (const authorization of [undefined, "Bearer wrong"]) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(authorization && { authorization }) },
      body: "{}",
    });
    assert.equal(res.status, 401, authorization);
  }
  assert.deepEqual(calls, []);
});
