import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

export function registerListNodes(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "list_nodes",
    {
      description: `List the cluster's nodes: "ready" (True, False, or Unknown when the node stopped reporting), "problems" (every unhealthy condition, e.g. Ready=False, MemoryPressure=True, DiskPressure=True, with its reason and message; empty means none) and "allocatable" (what pods can request in total).
"allocatable" is capacity, not usage: no tool shows a node's current CPU or memory use.`,
      inputSchema: z.strictObject({}),
      outputSchema: z.looseObject({
        nodes: z.array(
          z.looseObject({
            name: z.string(),
            ready: z.string(),
            problems: z.array(
              z.looseObject({
                type: z.string(),
                status: z.string(),
                reason: z.string().optional(),
                message: z.string().optional(),
                since: z.string().optional(),
              }),
            ),
            allocatable: z.record(z.string(), z.string()).optional(),
            createdAt: z.string(),
          }),
        ),
        truncated: z.boolean(),
      }),
    },
    (args) => runOp("list_nodes", args),
  );
}
