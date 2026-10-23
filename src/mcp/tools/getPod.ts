import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

// Init and regular containers alike.
const container = z.looseObject({
  name: z.string(),
  image: z.string().optional(),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  ports: z.array(z.string()).optional(),
  resources: z
    .looseObject({
      requests: z.record(z.string(), z.string()).optional(),
      limits: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  probes: z.looseObject({
    liveness: z.string().optional(),
    readiness: z.string().optional(),
    startup: z.string().optional(),
  }),
  env: z.array(z.string()).optional(),
  envFrom: z.array(z.string()).optional(),
  ready: z.boolean().optional(),
  restarts: z.number().optional(),
  state: z.string(),
  stateMessage: z.string().optional(),
  lastTermination: z
    .looseObject({
      reason: z.string().optional(),
      exitCode: z.number(),
      message: z.string().optional(),
      startedAt: z.string().optional(),
      finishedAt: z.string().optional(),
    })
    .optional(),
});

export function registerGetPod(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "get_pod",
    {
      description: `Describe one pod, like \`kubectl describe pod\` without events: per container its image, command and args, resources (requests, limits), probes, env vars (names and source only, never values), state and last termination (reason, exit code, message); "problems" (the pod conditions that aren't True, e.g. Ready=False), labels and owner.
Use it for what list_pods doesn't show: a container's limits (why it was OOMKilled), its probes (why it isn't Ready), what it runs.`,
      inputSchema: z.strictObject({
        namespace: z
          .string()
          .describe(
            "Kubernetes namespace. Listing a namespace that doesn't exist returns an empty list, not an error.",
          ),
        name: z.string().describe("The pod's name, as in list_pods"),
      }),
      outputSchema: z.looseObject({
        name: z.string(),
        status: z.string(),
        reason: z.string().optional(),
        message: z.string().optional(),
        node: z.string().optional(),
        owner: z.string().optional(),
        serviceAccount: z.string().optional(),
        qosClass: z.string().optional(),
        createdAt: z.string(),
        labels: z.record(z.string(), z.string()).optional(),
        problems: z.array(
          z.looseObject({
            type: z.string(),
            status: z.string(),
            reason: z.string().optional(),
            message: z.string().optional(),
            since: z.string().optional(),
          }),
        ),
        initContainers: z.array(container).optional(),
        containers: z.array(container),
      }),
    },
    (args) => runOp("get_pod", args),
  );
}
