import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

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
    },
    (args) => runOp("get_pod", args),
  );
}
