import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

export function registerGetLogs(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "get_logs",
    {
      description: `Read a container's logs: the newest lines that fit 64 KB, with timestamps, each line cut at 2,000 characters; truncated: true means older lines were left out.
While a container waits in CrashLoopBackOff, its current logs are its last crashed run, the same as previous: true. A container still waiting for its image has no logs (the error says why).`,
      inputSchema: z.strictObject({
        namespace: z
          .string()
          .describe(
            "Kubernetes namespace. Listing a namespace that doesn't exist returns an empty list, not an error.",
          ),
        pod: z.string().describe("The pod's name, as in list_pods"),
        container: z
          .string()
          .optional()
          .describe(
            "Needed when the pod has more than one container (the error names them)",
          ),
        previous: z
          .boolean()
          .optional()
          .describe(
            "true for the container's previous run, the one before its last restart. Can be gone (NOT_FOUND)",
          ),
        tailLines: z
          .number()
          .optional()
          .describe(
            "How many of the newest lines, a whole number from 1 to 500 (default 100). TOO_LARGE means they are over 2 MB: ask for fewer",
          ),
        sinceSeconds: z
          .number()
          .optional()
          .describe(
            "Only lines from the last N seconds, a whole number up to 604800 (7 days)",
          ),
      }),
    },
    (args) => runOp("get_logs", args),
  );
}
