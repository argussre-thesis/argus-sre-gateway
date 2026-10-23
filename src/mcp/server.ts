import { createHash, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import pkg from "../../package.json" with { type: "json" };
import type { Config } from "../config.ts";
import { log } from "../log.ts";
import type { GatewayResult } from "../runners/server.ts";
import { registerListDeployments } from "./tools/listDeployments.ts";
import { registerListPods } from "./tools/listPods.ts";

export type RunOp = (op: string, args: Record<string, unknown>) => Promise<CallToolResult>;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export async function startMcpServer(
  config: Config,
  sendOp: (
    tenantId: string,
    cluster: string,
    op: string,
    args: Record<string, unknown>,
  ) => Promise<GatewayResult>,
) {
  const expectedAuth = sha256(`Bearer ${config.agentGatewayToken}`);
  const path = "/mcp/tenants/:tenantId/clusters/:cluster";
  const app = createMcpExpressApp({ host: config.mcpHost });

  app.post(path, async (req, res) => {
    const { tenantId, cluster } = req.params;
    if (!timingSafeEqual(sha256(req.headers.authorization ?? ""), expectedAuth)) {
      log("warn", "mcp request refused: missing or wrong token", { tenantId, cluster });
      res.status(401).json({ error: "missing or wrong AGENT_GATEWAY_TOKEN" });
      return;
    }

    const server = new McpServer({ name: "argus-sre-gateway", version: pkg.version });
    const runOp: RunOp = async (op, args) => {
      const result = await sendOp(tenantId, cluster, op, args);
      return result.ok
        ? { content: [{ type: "text", text: JSON.stringify(result.data) }] }
        : {
            content: [{ type: "text", text: `Error ${result.error.code}: ${result.error.message}` }],
            isError: true,
          };
    };
    registerListPods(server, runOp);
    registerListDeployments(server, runOp);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get(path, (_req, res) => {
    res.sendStatus(405);
  });

  const httpServer = app.listen(config.mcpPort, config.mcpHost);
  await once(httpServer, "listening");
  const { port } = httpServer.address() as AddressInfo;
  log("info", "listening for MCP clients", { host: config.mcpHost, port, path });
  return { port, close: () => httpServer.close() };
}
