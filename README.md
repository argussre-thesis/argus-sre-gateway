# Argus SRE: Gateway

This is the gateway of **Argus SRE**, a platform that investigates Kubernetes incidents automatically. When an alert fires, an AI agent gathers telemetry from the cluster and writes a root cause analysis that engineers can then discuss in a chat.

The gateway connects the AI agent to customer clusters. Runners inside the clusters connect **out** to the gateway, so a cluster needs no inbound ports or firewall changes. The gateway then exposes each connected cluster to the agent service as an MCP server.

## Where it fits

```
Agent service ──MCP (HTTP)──▶ Gateway ◀──WebSocket (opened by the runner)── Runner ──▶ Kubernetes API
                                 │
                                 └──verify runner token──▶ Backend
```

| Repo | Role |
| --- | --- |
| [argus-sre-frontend](https://github.com/argussre-thesis/argus-sre-frontend) | Web app |
| [argus-sre-backend](https://github.com/argussre-thesis/argus-sre-backend) | API, webhooks, database |
| [argus-sre-agent-service](https://github.com/argussre-thesis/argus-sre-agent-service) | AI investigations and chat |
| **argus-sre-gateway** | Accepts runner connections |
| [argus-sre-runner](https://github.com/argussre-thesis/argus-sre-runner) | Runs inside the customer's cluster |

## What it does

**Runner side** (Socket.IO at `/runner`, public)
- A runner connects with its cluster token. The gateway checks it with the backend, and refuses the runner if the token is invalid, belongs to another cluster, or uses an unsupported protocol version.
- The token is checked again on every heartbeat, so revoking or rotating a token disconnects the runner within one heartbeat (25 seconds by default).
- One connection per cluster. If a second runner connects with the same token, the newest one wins.
- If a runner disconnects mid-request, the request fails right away with `RUNNER_DISCONNECTED` instead of waiting for a timeout.

**Agent side** (MCP at `/mcp/tenants/:tenantId/clusters/:cluster`, internal only)
- Read-only Kubernetes tools: list namespaces, nodes, pods, problem pods, deployments, replica sets and events, get a pod, and read logs.
- Each tool call is forwarded to that cluster's runner, and the answer comes back as the tool result. Errors such as `RUNNER_OFFLINE` come back as tool errors the agent can read.
- Requests need the agent service's token, compared in constant time.

`src/protocol.ts` is the contract between runner and gateway. The runner repo keeps the same file, and its version number must match on both sides.

## Tech stack

Node.js with native TypeScript, Socket.IO, the MCP SDK, Express 5, Zod. No database: the gateway only holds the live connections.

## Run locally

```bash
npm install
cp .env.example .env    # fill in the values
npm run dev
```

It needs the [backend](https://github.com/argussre-thesis/argus-sre-backend) running to verify runner tokens. Runners connect on `PORT` (default 8080), and the agent service connects to `MCP_HOST:MCP_PORT` (default `127.0.0.1:8081`).

Tests: `npm test`. Type check: `npm run typecheck`.
