import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, type Socket } from "socket.io";
import type { Config } from "../config.ts";
import { log } from "../log.ts";
import {
  DEFAULT_OP_TIMEOUT_MS,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  RUNNER_PATH,
  type ClientToServerEvents,
  type ConnectErrorCode,
  type ConnectErrorData,
  type ErrorCode,
  type RunnerAuth,
  type ServerToClientEvents,
} from "../protocol.ts";
import { verifyToken, type Cluster } from "./util/verifyToken.ts";

export type GatewayResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      error: {
        code:
          | ErrorCode
          | "RUNNER_OFFLINE"
          | "RUNNER_DISCONNECTED"
          | "GATEWAY_TIMEOUT";
        message: string;
      };
    };

interface SocketData extends Cluster {
  pending: Set<(result: GatewayResult) => void>;
}
type RunnerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>;

export async function startRunnerServer(config: Config, pingInterval = 25_000) {
  const runners = new Map<string, RunnerSocket>();
  const httpServer = createServer();
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<never, never>,
    SocketData
  >(httpServer, {
    path: RUNNER_PATH,
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    pingInterval,
  });

  io.use(async (socket, next) => {
    const { token, clusterName, protocolVersion } = socket.handshake
      .auth as Partial<RunnerAuth>;
    const refuse = (code: ConnectErrorCode, message: string) => {
      log("warn", "runner refused", { code, clusterName, protocolVersion });
      next(
        Object.assign(new Error(message), {
          data: { code } satisfies ConnectErrorData,
        }),
      );
    };

    if (protocolVersion !== PROTOCOL_VERSION) {
      return refuse(
        "UNSUPPORTED_PROTOCOL",
        `protocol version ${protocolVersion} is not supported, use ${PROTOCOL_VERSION}`,
      );
    }
    let cluster: Cluster | null = null;
    try {
      if (typeof token === "string") cluster = await verifyToken(config, token);
    } catch (err) {
      log("error", "cannot verify runner token", {
        clusterName,
        error: (err as Error).message,
      });
      return next(new Error("the gateway cannot verify tokens right now"));
    }
    if (!cluster || cluster.clusterName !== clusterName) {
      return refuse(
        "UNAUTHORIZED",
        "invalid token, or the token belongs to another cluster",
      );
    }
    socket.data = { ...cluster, pending: new Set() };
    next();
  });

  io.on("connection", (socket) => {
    const { tenantId, clusterName } = socket.data;
    const { token, runnerVersion, ops } = socket.handshake.auth as RunnerAuth;
    const key = `${tenantId}/${clusterName}`;

    // Newest wins: the old connection is either dead and not noticed yet, or a second runner with the same token.
    const previous = runners.get(key);
    if (previous) {
      log("warn", "runner replaced by a newer connection", {
        tenantId,
        clusterName,
        oldSocketId: previous.id,
        newSocketId: socket.id,
      });
      previous.disconnect(true);
    }
    runners.set(key, socket);
    log("info", "runner connected", {
      socketId: socket.id,
      tenantId,
      clusterName,
      runnerVersion,
      ops,
    });

    socket.conn.on("heartbeat", async () => {
      try {
        if (await verifyToken(config, token)) return;
        log("warn", "runner token revoked, disconnecting", {
          socketId: socket.id,
          tenantId,
          clusterName,
        });
        socket.disconnect(true);
      } catch (err) {
        log("warn", "cannot re-verify runner token, keeping the runner", {
          socketId: socket.id,
          tenantId,
          clusterName,
          error: (err as Error).message,
        });
      }
    });

    // Runs after a disconnect has already happened
    socket.on("disconnect", (reason) => {
      if (runners.get(key) === socket) runners.delete(key);
      for (const done of socket.data.pending) {
        done({
          ok: false,
          error: {
            code: "RUNNER_DISCONNECTED",
            message: "runner disconnected before answering, retry the op",
          },
        });
      }
      log("info", "runner disconnected", {
        socketId: socket.id,
        tenantId,
        clusterName,
        reason,
      });
    });
  });

  async function sendOp(
    tenantId: string,
    cluster: string,
    op: string,
    args: Record<string, unknown>,
  ): Promise<GatewayResult> {
    const socket = runners.get(`${tenantId}/${cluster}`);
    if (!socket)
      return {
        ok: false,
        error: {
          code: "RUNNER_OFFLINE",
          message: `no runner connected for cluster "${cluster}"`,
        },
      };

    const id = randomUUID();
    const started = performance.now();
    const timeoutMs = DEFAULT_OP_TIMEOUT_MS + 2_000;
    return new Promise((resolve) => {
      // We define the done function that runs only when runner answers.
      const done = (result: GatewayResult) => {

        if (!socket.data.pending.delete(done)) return;
        clearTimeout(timer);
        const errorCode = result.ok ? undefined : result.error.code;
        log("info", "op answered", {
          id,
          tenantId,
          cluster,
          op,
          errorCode,
          durationMs: Math.round(performance.now() - started),
        });
        resolve(result);
      };

      const timer = setTimeout(
        () =>
          done({
            ok: false,
            error: {
              code: "GATEWAY_TIMEOUT",
              message: `runner did not answer within ${timeoutMs}ms`,
            },
          }),
        timeoutMs,
      );
      socket.data.pending.add(done);
      // We grab the result and run the done fuction, which clears timer and resolve(result) means return the outcome. 
      socket.emit("op", { id, op, args }, done);
    });
  }

  httpServer.listen(config.port);
  await once(httpServer, "listening");
  const { port } = httpServer.address() as AddressInfo;
  log("info", "listening for runners", { port, path: RUNNER_PATH });
  return { port, sendOp, close: () => io.close() };
}
