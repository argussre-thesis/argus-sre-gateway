
export interface Config {
  port: number;
  backendUrl: string;
  gatewayBackendToken: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
  };

  const httpUrl = (name: string, value: string): string => {
    const protocol = URL.parse(value)?.protocol;
    if (protocol !== "http:" && protocol !== "https:") {
      throw new Error(`${name} must start with http:// or https://, got "${value}"`);
    }
    return value;
  };

  const port = (name: string, fallback: number): number => {
    const value = env[name];
    if (!value) return fallback;
    const n = Number(value);
    if (!/^\d+$/.test(value) || n < 1 || n > 65535) {
      throw new Error(`${name} must be a port number from 1 to 65535, got "${value}"`);
    }
    return n;
  };

  // The value is never part of the message.
  const secret = (name: string): string => {
    const value = required(name);
    if (value.length < 32) throw new Error(`${name} must be at least 32 characters`);
    return value;
  };

  return {
    port: port("PORT", 8080),
    backendUrl: httpUrl("BACKEND_URL", required("BACKEND_URL")),
    gatewayBackendToken: secret("GATEWAY_BACKEND_TOKEN"),
  };
}
