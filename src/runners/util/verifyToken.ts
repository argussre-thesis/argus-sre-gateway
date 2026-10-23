import type { Config } from "../../config.ts";

export type Cluster = { tenantId: string; clusterName: string };

export async function verifyToken(
  config: Config,
  token: string,
): Promise<Cluster | null> {
  const res = await fetch(
    new URL("/internal/v1/runner-tokens/verify", config.backendUrl),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.gatewayBackendToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5_000),
    },
  );
  const body = (await res.json()) as {
    data: Cluster;
    error?: { code: string };
  };
  if (res.ok) return body.data;
  // A 401 for our own GATEWAY_BACKEND_TOKEN must not count as a bad runner token, or a config mistake would drop every runner.
  if (body.error?.code === "INVALID_RUNNER_TOKEN") return null;
  throw new Error(`backend answered ${res.status} ${body.error?.code}`);
}
