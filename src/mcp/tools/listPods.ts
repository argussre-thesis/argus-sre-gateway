import * as z from "zod";

export const listPods = {
  name: "list_pods",
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
};
