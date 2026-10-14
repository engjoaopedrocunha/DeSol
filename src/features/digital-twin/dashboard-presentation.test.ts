import { describe, expect, it } from "vitest";
import { demoRecords } from "./model";
import { overviewDisplayState, sensorDisplayState } from "./dashboard-presentation";

describe("apresentação do resumo operacional", () => {
  const real = { mode: "real" as const, disconnected: false, scenario: "nominal" as const };
  it("só apresenta normalidade com os quatro estados confirmados", () => {
    expect(overviewDisplayState({ ...real, health: ["ok", "ok", "ok", "unknown"] }).label).toBe(
      "Atenção",
    );
    expect(overviewDisplayState({ ...real, health: ["ok", "ok", "ok", "ok"] }).label).toBe(
      "Operando normalmente",
    );
    expect(overviewDisplayState({ ...real, health: [] }).label).toBe("Atenção");
  });
  it("uma API desconectada não confirma uma falha física nem reaproveita normalidade", () => {
    const state = overviewDisplayState({
      ...real,
      disconnected: true,
      health: ["ok", "ok", "ok", "ok"],
    });
    expect(state.label).toBe("Atenção");
    expect(state.description).toContain("não confirmado");
  });
  it("distingue atraso, falha reportada e simulação", () => {
    expect(overviewDisplayState({ ...real, health: ["stale", "ok", "ok", "ok"] }).tone).toBe(
      "attention",
    );
    expect(overviewDisplayState({ ...real, health: ["error", "ok", "ok", "ok"] }).tone).toBe(
      "critical",
    );
    expect(
      overviewDisplayState({ ...real, mode: "demo", health: ["ok", "ok", "ok", "ok"] }).label,
    ).toBe("Modo de demonstração");
    expect(
      overviewDisplayState({ ...real, mode: "demo", scenario: "bad-reading", health: [] }).label,
    ).toBe("Falha simulada");
    expect(
      overviewDisplayState({ ...real, mode: "demo", scenario: "gateway-offline", health: [] })
        .label,
    ).toContain("simulação");
  });
  it("marca exceções simuladas sem alterar a saúde calculada", () => {
    const reading = demoRecords[0]!;
    expect(sensorDisplayState("unknown", true, reading).tone).toBe("calm");
    expect(
      sensorDisplayState("unknown", true, { ...reading, value: null, quality: "bad" }).label,
    ).toBe("Inválida · simulação");
    expect(sensorDisplayState("unknown", false, reading).label).toBe("Estado desconhecido");
  });
});
