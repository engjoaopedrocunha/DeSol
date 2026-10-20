import { esp32DeviceTelemetrySchema } from "./esp32-telemetry";

type RuntimeBindings = Record<string, unknown>;

function setting(bindings: RuntimeBindings) {
  const value = bindings["DESOL_ESP32_BASE_URL"] ?? process.env["DESOL_ESP32_BASE_URL"];
  return typeof value === "string" ? value.trim() : "";
}

function isPrivateIPv4(hostname: string) {
  const octets = hostname.split(".");
  if (
    octets.length !== 4 ||
    octets.some((octet) => !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)
  )
    return false;
  const [a, b] = octets.map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function localDeviceUrl(bindings: RuntimeBindings) {
  const base = setting(bindings);
  if (!base) return undefined;
  const url = new URL(base);
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !isPrivateIPv4(url.hostname)
  ) {
    throw new Error("Invalid local ESP32 address");
  }
  return url;
}

const json = (payload: unknown, status = 200) =>
  Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });

export async function handleEsp32Api(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/esp32/")) return null;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const route = url.pathname.slice("/api/esp32/".length);
  if (route === "config") {
    try {
      const bindings = env && typeof env === "object" ? (env as RuntimeBindings) : {};
      return json({ configured: localDeviceUrl(bindings) !== undefined });
    } catch {
      return json({ configured: false });
    }
  }
  if (route !== "telemetry") return json({ error: "Not found" }, 404);

  try {
    const bindings = env && typeof env === "object" ? (env as RuntimeBindings) : {};
    const device = localDeviceUrl(bindings);
    if (!device) return json({ error: "Local ESP32 is not configured" }, 503);

    const endpoint = new URL("/api/dados", device);
    const response = await fetch(endpoint, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(6_000)]),
      redirect: "error",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return json({ error: "ESP32 is not responding" }, 502);
    if (
      response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      return json({ error: "ESP32 returned an invalid response" }, 502);
    }

    const body = await response.text();
    if (body.length > 16_384) return json({ error: "ESP32 response is too large" }, 502);
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return json({ error: "ESP32 returned invalid JSON" }, 502);
    }

    const parsed = esp32DeviceTelemetrySchema.safeParse(payload);
    if (!parsed.success)
      return json({ error: "ESP32 response does not match the sketch's /api/dados format" }, 502);
    return json({ ...parsed.data, recebido_em: new Date().toISOString() });
  } catch {
    return json({ error: "Local ESP32 is unavailable or misconfigured" }, 503);
  }
}
