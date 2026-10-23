import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

export function registerListReplicasets(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "list_replicasets",
    {
      description: `List the ReplicaSets in a namespace: one per Deployment revision, grouped by Deployment (owner), newest revision first, each with revision, changeCause, ready ("ready/desired"; 0/0 is an old revision) and its pod template's containers (as in get_pod).
Comparing a Deployment's newest revision with the one before shows what a rollout changed. restartedAt set means the revision came from \`kubectl rollout restart\`, with the template otherwise unchanged.
Pass the Deployment's "selector" (from list_deployments) as labelSelector: a whole namespace can be large.`,
      inputSchema: z.strictObject({
        namespace: z
          .string()
          .describe(
            "Kubernetes namespace. Listing a namespace that doesn't exist returns an empty list, not an error.",
          ),
        labelSelector: z
          .string()
          .optional()
          .describe(
            'Label selector on the ReplicaSets, e.g. a Deployment\'s selector "app=web"',
          ),
      }),
    },
    (args) => runOp("list_replicasets", args),
  );
}
