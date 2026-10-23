import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

export function registerListDeployments(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "list_deployments",
    {
      description: `List the deployments in a namespace: ready replicas, rollout status (the checks of \`kubectl rollout status\`), pod selector and images.
"ready" can look healthy while a new rollout is stuck or failed: check "rollout".
To see a deployment's pods or ReplicaSets, pass its "selector" to list_pods or list_replicasets as labelSelector.`,
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
            "Label selector on the Deployments' own labels, not their pods'. Usually not needed.",
          ),
      }),
    },
    (args) => runOp("list_deployments", args),
  );
}
