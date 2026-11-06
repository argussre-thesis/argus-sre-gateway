import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

export const podSummary = z.looseObject({
  name: z.string(),
  status: z.string(),
  ready: z.string(),
  restarts: z.number(),
  node: z.string().optional(),
  owner: z.string().optional(),
  createdAt: z.string(),
  containers: z.array(
    z.looseObject({
      name: z.string(),
      image: z.string(),
      ready: z.boolean(),
      restarts: z.number(),
      state: z.string(),
      lastTermination: z
        .looseObject({ reason: z.string().optional(), exitCode: z.number(), finishedAt: z.string().optional() })
        .optional(),
    }),
  ),
});

export function registerListPods(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "list_pods",
    {
      description: `List the pods in a namespace, like \`kubectl get pods\`: status, ready containers, restarts, node, owner, and per container its image, state and last termination (reason, exit code, finishedAt).
A crash-looping pod's status flips between Error or OOMKilled (just exited) and CrashLoopBackOff (waiting to restart); restarts and lastTermination are the stable signal.
At most 500 pods; truncated: true means there were more.`,
      inputSchema: z.strictObject({
        namespace: z
          .string()
          .describe(
            "Kubernetes namespace. Listing a namespace that doesn't exist returns an empty list, not an error.",
          ),
        labelSelector: z
          .string()
          .optional()
          .describe('Label selector on the pods, e.g. "app=web"'),
      }),
      outputSchema: z.looseObject({
        pods: z.array(podSummary),
        truncated: z.boolean(),
      }),
    },
    (args) => runOp("list_pods", args),
  );
}
