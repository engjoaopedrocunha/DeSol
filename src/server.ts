import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { predictDailyYield } from "./lib/piml-engine";
import { handleDigitalTwinApi } from "./lib/digital-twin-proxy.server";
import { handleEsp32Api } from "./lib/esp32-proxy.server";
import {
  addReading,
  addReadingsBatch,
  classifyReading,
  getDeviceStatus,
  getLatestReading,
  getReadings24h,
  telemetryReadingSchema,
} from "./lib/telemetry-store";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const twinResponse = await handleDigitalTwinApi(request, env);
      if (twinResponse) return twinResponse;
      const esp32Response = await handleEsp32Api(request, env);
      if (esp32Response) return esp32Response;
      const apiResponse = await handleTelemetryApi(request);
      if (apiResponse) return apiResponse;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

const API_PREFIX = "/api/v1";
const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function handleTelemetryApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${API_PREFIX}/`)) return null;

  const path = url.pathname.slice(API_PREFIX.length);
  const method = request.method.toUpperCase();
  try {
    if (path === "/telemetry/ingest" && method === "POST") {
      const parsed = telemetryReadingSchema.safeParse(await request.json());
      if (!parsed.success)
        return jsonResponse(
          { error: "Invalid telemetry payload", issues: parsed.error.issues },
          400,
        );
      addReading(parsed.data);
      const result = classifyReading(parsed.data);
      if (result.alertTriggered) {
        console.error(
          "CRITICAL_TELEMETRY_ALERT",
          JSON.stringify({
            deviceId: parsed.data.deviceId,
            timestamp: parsed.data.timestamp,
            tdsValue: parsed.data.tdsValue,
            waterTemp: parsed.data.waterTemp,
          }),
        );
      }
      return jsonResponse(result, 201);
    }

    if (path === "/telemetry/batch-sync" && method === "POST") {
      const body: unknown = await request.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("deviceId" in body) ||
        !("readings" in body)
      ) {
        return jsonResponse({ error: "Expected deviceId and readings" }, 400);
      }
      const { deviceId, readings } = body;
      if (
        typeof deviceId !== "string" ||
        !deviceId.trim() ||
        !Array.isArray(readings) ||
        readings.length > 10_000
      ) {
        return jsonResponse({ error: "Invalid deviceId or readings (maximum 10000)" }, 400);
      }
      const counts = addReadingsBatch(deviceId, readings);
      return jsonResponse(
        { success: true, ...counts, latest: getLatestReading(deviceId) ?? null },
        200,
      );
    }

    const latestMatch = path.match(/^\/telemetry\/latest\/([^/]+)$/);
    if (latestMatch && method === "GET") {
      const deviceId = decodeURIComponent(latestMatch[1]!);
      const latest = getLatestReading(deviceId);
      return latest
        ? jsonResponse(latest)
        : jsonResponse({ error: "No telemetry found", deviceId }, 404);
    }

    const historyMatch = path.match(/^\/telemetry\/history\/([^/]+)$/);
    if (historyMatch && method === "GET") {
      const deviceId = decodeURIComponent(historyMatch[1]!);
      return jsonResponse({ deviceId, readings: getReadings24h(deviceId) });
    }

    const statusMatch = path.match(/^\/devices\/([^/]+)\/status$/);
    if (statusMatch && method === "GET") {
      return jsonResponse(getDeviceStatus(decodeURIComponent(statusMatch[1]!)));
    }

    const predictionMatch = path.match(/^\/predictions\/daily-yield\/([^/]+)$/);
    if (predictionMatch && method === "GET") {
      const deviceId = decodeURIComponent(predictionMatch[1]!);
      const latest = getLatestReading(deviceId);
      return latest
        ? jsonResponse(predictDailyYield(latest))
        : jsonResponse({ error: "No telemetry available for prediction", deviceId }, 404);
    }

    if (path === "/telemetry/simulate-failure" && method === "POST") {
      const body: unknown = await request.json().catch(() => ({}));
      const requestedId =
        typeof body === "object" && body !== null && "deviceId" in body ? body.deviceId : undefined;
      const deviceId =
        typeof requestedId === "string" && requestedId.trim() ? requestedId : "ESP32-DESOL-01";
      const reading = telemetryReadingSchema.parse({
        deviceId,
        timestamp: Date.now() / 1000,
        waterTemp: 54.2,
        glassTemp: 32.8,
        tdsValue: 350,
        reservoirLevel: 82,
        accumulatedYield: 18.4,
        solarIrradiation: 850.5,
        rssiLoRa: -92,
        batteryLevel: 4.15,
      });
      addReading(reading);
      const result = classifyReading(reading);
      console.error(
        "CRITICAL_TELEMETRY_SIMULATION",
        JSON.stringify({ deviceId, timestamp: reading.timestamp, tdsValue: reading.tdsValue }),
      );
      return jsonResponse({ ...result, reading }, 201);
    }

    return jsonResponse({ error: "API route not found" }, 404);
  } catch (error) {
    if (error instanceof SyntaxError)
      return jsonResponse({ error: "Request body must be valid JSON" }, 400);
    console.error("Telemetry API error", error);
    return jsonResponse({ error: "Internal telemetry API error" }, 500);
  }
}
