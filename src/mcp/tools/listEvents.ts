import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import type { RunOp } from "../server.ts";

export function registerListEvents(server: McpServer, runOp: RunOp) {
  server.registerTool(
    "list_events",
    {
      description: `List a namespace's events, newest first: time, type, reason, object (Kind/name), message, count. At most 100; truncated: true means more matched.
Ask for type "Warning" about one object first (the signal: most Normal events are routine); ask for the full timeline only when you need it.
Kubernetes keeps events for about an hour, so older history isn't here, and the first, most specific error of a failure can already be gone (e.g. why an image pull failed; later events only repeat "Back-off pulling image").`,
      inputSchema: z.strictObject({
        namespace: z
          .string()
          .describe(
            "Kubernetes namespace. Listing a namespace that doesn't exist returns an empty list, not an error.",
          ),
        involvedObject: z
          .string()
          .optional()
          .describe(
            'Only events about one object: "Kind/name" (e.g. "Pod/web-7d9f-x2k", or the owner shown by list_pods or get_pod, e.g. "ReplicaSet/web-7d9f") or a bare name',
          ),
        type: z.enum(["Warning", "Normal"]).optional(),
        sinceSeconds: z
          .number()
          .optional()
          .describe(
            "Only events from the last N seconds, a whole number from 1 to 3600",
          ),
      }),
      outputSchema: z.looseObject({
        events: z.array(
          z.looseObject({
            time: z.string().optional(),
            firstTime: z.string().optional(),
            type: z.string().optional(),
            reason: z.string().optional(),
            object: z.string(),
            message: z.string().optional(),
            count: z.number(),
            source: z.string().optional(),
          }),
        ),
        truncated: z.boolean(),
      }),
    },
    (args) => runOp("list_events", args),
  );
}
