import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";
import { podSummary } from "./listPods.ts";

export function registerListProblemPods(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "list_problem_pods",
    {
      description: `List the unhealthy pods across all namespaces, each with its namespace, plus "total", the number of pods read. A pod is listed when it isn't Running or finished, isn't fully ready, or has a container that restarted in the last hour (a crash-looping pod can look healthy between crashes).
Use it for how a cluster is doing, or to find what's broken when no namespace is named. Pods starting or stopping during a normal rollout are listed too: check status and createdAt.
At most 500 pods are read; truncated: true means there were more, and neither "problems" nor "total" covers them.`,
      inputSchema: z.strictObject({}),
      outputSchema: z.looseObject({
        total: z.number(),
        problems: z.array(podSummary.extend({ namespace: z.string() })),
        truncated: z.boolean(),
      }),
    },
    (args) => runOp("list_problem_pods", args),
  );
}
