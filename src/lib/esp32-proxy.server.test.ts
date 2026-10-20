import { afterEach, describe, expect, it, vi } from "vitest";
import { handleEsp32Api } from "./esp32-proxy.server";
import { esp32TelemetrySchema } from "./esp32-telemetry";

const original = {
  temperatura: 26.5,
  distancia: 17.5,
  nivel: 50,
  ph: null,
  ph_calibrado: false,
  adc_ph: 1800,
  tensao_ph: 1.45,
  salinidade: null,
  tds_calibrado: false,
  adc_tds: 900,
  tensao_tds: 0.725,
  bomba: true,
};
const bindings = { DESOL_ESP32_BASE_URL: "http://192.168.1.50" };
const request = (route = "telemetry") => new Request(`http://localhost/api/esp32/${route}`);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ponte para o sketch original do ESP32", () => {
  it("aceita a resposta inicial do sketch com LCD antes da primeira leitura", async () => {
    const initial = {
      temperatura: null,
      distancia: null,
      nivel: null,
      ph: null,
      ph_calibrado: false,
      adc_ph: 0,
      tensao_ph: 0,
      salinidade: null,
      tds_calibrado: false,
      adc_tds: 0,
      tensao_tds: 0,
      bomba: false,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(initial)));
    const response = await handleEsp32Api(request(), bindings);
    expect(response!.status).toBe(200);
    const { recebido_em, ...sensors } = esp32TelemetrySchema.parse(await response!.json());
    expect(sensors).toEqual(initial);
    expect(recebido_em).toBeDefined();
  });

  it.each([true, false])(
    "preserva bomba=%s na faixa de histerese do sketch com LCD",
    async (bomba) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json({
            ...original,
            distancia: 4,
            nivel: 100,
            bomba,
          }),
        ),
      );
      const response = await handleEsp32Api(request(), bindings);
      expect(response!.status).toBe(200);
      expect(await response!.json()).toMatchObject({ distancia: 4, nivel: 100, bomba });
    },
  );

  it("reconhece configuração ausente sem consultar a rede", async () => {
    vi.stubEnv("DESOL_ESP32_BASE_URL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await handleEsp32Api(request("config"), {});
    expect(await response!.json()).toEqual({ configured: false });
    expect((await handleEsp32Api(request(), {}))!.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aceita o JSON original sem metadados v1 e preserva as unidades", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(original));
    vi.stubGlobal("fetch", fetch);
    const response = await handleEsp32Api(request(), bindings);
    expect(response!.status).toBe(200);
    expect(response!.headers.get("cache-control")).toBe("no-store");
    const data = esp32TelemetrySchema.parse(await response!.json());
    const { recebido_em, ...sensors } = data;
    expect(sensors).toEqual(original);
    expect(Number.isFinite(Date.parse(recebido_em))).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      new URL("http://192.168.1.50/api/dados"),
      expect.objectContaining({ cache: "no-store", redirect: "error" }),
    );
  });

  it("preserva sensores indisponíveis como null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...original,
          temperatura: null,
          distancia: null,
          nivel: null,
          bomba: false,
        }),
      ),
    );
    const response = await handleEsp32Api(request(), bindings);
    expect(response!.status).toBe(200);
    expect(await response!.json()).toMatchObject({
      temperatura: null,
      distancia: null,
      nivel: null,
      ph: null,
      salinidade: null,
      bomba: false,
    });
  });

  it.each([
    { ...original, bomba: "false" },
    { ...original, nivel: 101 },
    { ...original, adc_ph: 4096 },
    { ...original, ph: 7, ph_calibrado: true },
    { temperatura: 25 },
  ])("rejeita leituras incompatíveis sem substituí-las por DEMO: %j", async (payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    const response = await handleEsp32Api(request(), bindings);
    expect(response!.status).toBe(502);
    expect(await response!.json()).not.toHaveProperty("temperatura");
  });

  it("retorna indisponibilidade quando a placa não responde", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await handleEsp32Api(request(), bindings))!.status).toBe(503);
  });

  it.each([
    "https://192.168.1.50",
    "http://8.8.8.8",
    "http://esp32.local",
    "http://192.168.1.50/api/dados",
  ])("não consulta um endereço não permitido: %s", async (address) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const env = { DESOL_ESP32_BASE_URL: address };
    expect(await (await handleEsp32Api(request("config"), env))!.json()).toEqual({
      configured: false,
    });
    expect((await handleEsp32Api(request(), env))!.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
