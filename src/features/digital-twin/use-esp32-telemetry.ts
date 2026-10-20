import { useEffect, useState } from "react";
import {
  esp32BridgeConfigSchema,
  esp32TelemetrySchema,
  type Esp32Telemetry,
} from "@/lib/esp32-telemetry";

type State = {
  configured: boolean | undefined;
  reading: Esp32Telemetry | undefined;
  error: boolean;
};

export function useEsp32Telemetry() {
  const [state, setState] = useState<State>({
    configured: undefined,
    reading: undefined,
    error: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(8_000);
    const signal = AbortSignal.any([controller.signal, timeout]);

    void fetch("/api/esp32/config", {
      signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Bridge configuration unavailable");
        const config = esp32BridgeConfigSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setState({ configured: config.configured, reading: undefined, error: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ configured: false, reading: undefined, error: true });
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (state.configured !== true) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let failures = 0;

    const poll = async () => {
      try {
        const response = await fetch("/api/esp32/telemetry", {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("ESP32 is unavailable");
        const reading = esp32TelemetrySchema.parse(await response.json());
        if (!active) return;
        if (expiryTimer !== undefined) clearTimeout(expiryTimer);
        setState({ configured: true, reading, error: false });
        // Expire the last response even if a subsequent request is still pending.
        expiryTimer = setTimeout(() => {
          if (active) setState({ configured: true, reading: undefined, error: true });
        }, 10_000);
        failures = 0;
      } catch {
        if (!active) return;
        if (expiryTimer !== undefined) clearTimeout(expiryTimer);
        setState((current) => ({ ...current, reading: undefined, error: true }));
        failures += 1;
      }
      if (active) {
        const delay = failures === 0 ? 2_000 : Math.min(30_000, 2_000 * 2 ** failures);
        timer = setTimeout(() => void poll(), delay);
      }
    };

    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      if (expiryTimer !== undefined) clearTimeout(expiryTimer);
    };
  }, [state.configured]);

  return state;
}
