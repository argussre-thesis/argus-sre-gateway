import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import type { Config } from "../src/config.ts";
import { PROTOCOL_VERSION, RUNNER_PATH, type RunnerAuth } from "../src/protocol.ts";
import { startRunnerServer } from "../src/runners/server.ts";

const GATEWAY_BACKEND_TOKEN = "b".repeat(32);

// Answers like the backend's verify endpoint: tokens in `valid` belong to cluster minikube of tenant t1.
async function startBackend(t: TestContext) {
  const backend = { url: "", down: false, valid: new Set(["good"]), calls: 0 };
  const server = createServer(async (req, res) => {
    backend.calls++;
    let body = "";
    for await (const chunk of req) body += chunk;
    const [status, reply] = backend.down
      ? [503, { success: false, error: { code: "SERVICE_UNAVAILABLE" } }]
      : req.method !== "POST" || req.url !== "/internal/v1/runner-tokens/verify"
        ? [404, { success: false, error: { code: "ROUTE_NOT_FOUND" } }]
        : req.headers.authorization !== `Bearer ${GATEWAY_BACKEND_TOKEN}`
          ? [401, { success: false, error: { code: "INVALID_INTERNAL_TOKEN" } }]
          : typeof JSON.parse(body).token !== "string"
            ? [400, { success: false, error: { code: "VALIDATION_ERROR" } }]
            : backend.valid.has(JSON.parse(body).token)
              ? [200, { success: true, data: { tenantId: "t1", clusterId: "c1", clusterName: "minikube" } }]
              : [401, { success: false, error: { code: "INVALID_RUNNER_TOKEN" } }];
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(reply));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  backend.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(() => server.close());
  return backend;
}

async function startGateway(t: TestContext, backendUrl: string, gatewayBackendToken = GATEWAY_BACKEND_TOKEN) {
  const gateway = await startRunnerServer({ port: 0, backendUrl, gatewayBackendToken } as Config, 50);
  t.after(() => gateway.close());
  return { ...gateway, url: `http://127.0.0.1:${gateway.port}` };
}

// node:events' once() doesn't take socket.io-client's emitter type.
const next = (socket: Socket, event: "connect" | "connect_error" | "disconnect" | "op") =>
  new Promise<any[]>((resolve) => socket.once(event, (...args: unknown[]) => resolve(args)));

// Answers every op with its own name and args, unless reply is false.
function connectRunner(t: TestContext, url: string, auth: Partial<RunnerAuth> = {}, reply = true) {
  const socket = io(url, {
    path: RUNNER_PATH,
    transports: ["websocket"],
    reconnection: false,
    auth: { token: "good", clusterName: "minikube", runnerVersion: "test", protocolVersion: PROTOCOL_VERSION, ops: ["ping"], ...auth },
  });
  socket.on("op", (req, ack) => reply && ack({ ok: true, data: { op: req.op, args: req.args, by: auth.runnerVersion } }));
  t.after(() => socket.disconnect());
  return socket;
}

test("a runner with a valid token gets its tenant's ops, no one else's", async (t) => {
  const backend = await startBackend(t);
  const gateway = await startGateway(t, backend.url);
  await next(connectRunner(t, gateway.url), "connect");

  assert.deepEqual(await gateway.sendOp("t1", "minikube", "list_pods", { namespace: "demo" }), {
    ok: true,
    data: { op: "list_pods", args: { namespace: "demo" } },
  });
  for (const [tenantId, cluster] of [["t2", "minikube"], ["t1", "other"]]) {
    assert.deepEqual(await gateway.sendOp(tenantId!, cluster!, "ping", {}), {
      ok: false,
      error: { code: "RUNNER_OFFLINE", message: `no runner connected for cluster "${cluster}"` },
    });
  }
});

test("bad tokens, another cluster's token and old protocols are refused with a code", async (t) => {
  const backend = await startBackend(t);
  const gateway = await startGateway(t, backend.url);
  const cases: [Partial<RunnerAuth>, string][] = [
    [{ token: "revoked" }, "UNAUTHORIZED"],
    [{ clusterName: "other" }, "UNAUTHORIZED"],
    [{ token: undefined }, "UNAUTHORIZED"],
    [{ protocolVersion: 2 }, "UNSUPPORTED_PROTOCOL"],
  ];
  for (const [auth, code] of cases) {
    const [err] = await next(connectRunner(t, gateway.url, auth), "connect_error");
    assert.deepEqual(err.data, { code }, JSON.stringify(auth));
  }
});

test("when the backend can't answer, the runner is refused without a code", async (t) => {
  const backend = await startBackend(t);
  const wrongBackendToken = await startGateway(t, backend.url, "x".repeat(32));
  let [err] = await next(connectRunner(t, wrongBackendToken.url), "connect_error");
  assert.equal(err.data, undefined);

  backend.down = true;
  const gateway = await startGateway(t, backend.url);
  [err] = await next(connectRunner(t, gateway.url), "connect_error");
  assert.equal(err.data, undefined);
});

test("a newer connection replaces the older one", async (t) => {
  const backend = await startBackend(t);
  const gateway = await startGateway(t, backend.url);
  const first = connectRunner(t, gateway.url, { runnerVersion: "first" });
  await next(first, "connect");

  const dropped = next(first, "disconnect");
  await next(connectRunner(t, gateway.url, { runnerVersion: "second" }), "connect");
  assert.equal((await dropped)[0], "io server disconnect");
  const result = await gateway.sendOp("t1", "minikube", "ping", {});
  assert.deepEqual(result, { ok: true, data: { op: "ping", args: {}, by: "second" } });
});

test("a disconnect fails all of the runner's pending ops at once", async (t) => {
  const backend = await startBackend(t);
  const gateway = await startGateway(t, backend.url);
  const runner = connectRunner(t, gateway.url, {}, false);
  await next(runner, "connect");

  const results = Promise.all([gateway.sendOp("t1", "minikube", "ping", {}), gateway.sendOp("t1", "minikube", "ping", {})]);
  await next(runner, "op");
  runner.disconnect();
  for (const result of await results) assert.equal(!result.ok && result.error.code, "RUNNER_DISCONNECTED");
});

test("pings re-check the token: a backend outage keeps the runner, a revoked token drops it", async (t) => {
  const backend = await startBackend(t);
  const gateway = await startGateway(t, backend.url);
  const runner = connectRunner(t, gateway.url);
  await next(runner, "connect");

  backend.down = true;
  const calls = backend.calls;
  await sleep(300);
  assert.ok(backend.calls > calls + 1, "pings should call the backend");
  assert.ok(runner.connected);

  backend.down = false;
  backend.valid.delete("good");
  assert.equal((await next(runner, "disconnect"))[0], "io server disconnect");
});
