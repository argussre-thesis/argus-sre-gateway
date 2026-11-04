import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

export function registerListNamespaces(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "list_namespaces",
    {
      description: `List the cluster's namespaces: name, status (Active or Terminating) and creation time.
Use it to find where to look when no namespace is named: most other tools need one.`,
      inputSchema: z.strictObject({}),
      outputSchema: z.looseObject({
        namespaces: z.array(
          z.looseObject({
            name: z.string(),
            status: z.string(),
            createdAt: z.string(),
          }),
        ),
        truncated: z.boolean(),
      }),
    },
    (args) => runOp("list_namespaces", args),
  );
}
