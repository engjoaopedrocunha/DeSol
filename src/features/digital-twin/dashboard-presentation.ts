import { healthLabels, type DemoScenario, type Health, type Reading } from "./model";

export type DisplayState = { label: string; tone: "calm" | "attention" | "critical" };

// Presentation only: keep the existing health calculation and never infer physical thresholds.
export function sensorDisplayState(health: Health, demo: boolean, reading?: Reading): DisplayState {
  if (demo) {
    if (reading?.quality === "bad" || reading?.diagnosticCode)
      return { label: "Inválida · simulação", tone: "critical" };
    if (reading?.sensorId === "gateway" && reading.value === false)
      return { label: "Offline · simulação", tone: "attention" };
    return { label: "Simulação", tone: "calm" };
  }
  return {
    label: healthLabels[health],
    tone: health === "error" ? "critical" : health === "ok" ? "calm" : "attention",
  };
}

export function overviewDisplayState({
  mode,
  disconnected,
  scenario,
  health,
}: {
  mode: "demo" | "real" | "checking";
  disconnected: boolean;
  scenario: DemoScenario;
  health: Health[];
}): DisplayState & { description: string } {
  if (mode === "demo") {
    if (scenario === "bad-reading")
      return {
        label: "Falha simulada",
        description: "Leitura inválida no cenário de demonstração.",
        tone: "critical",
      };
    if (scenario === "gateway-offline")
      return {
        label: "Atenção · simulação",
        description: "Gateway offline no cenário de demonstração.",
        tone: "attention",
      };
    return {
      label: "Modo de demonstração",
      description: "Explore o equipamento com dados simulados.",
      tone: "calm",
    };
  }
  if (disconnected)
    return {
      label: "Atenção",
      description: "Telemetria indisponível. Estado atual não confirmado.",
      tone: "attention",
    };
  if (mode === "checking")
    return {
      label: "Verificando telemetria",
      description: "Aguardando a configuração do equipamento.",
      tone: "calm",
    };
  if (health.some((state) => state === "error" || state === "offline"))
    return {
      label: "Falha",
      description: "Há erro de leitura ou comunicação offline. Consulte os sensores.",
      tone: "critical",
    };
  if (health.length === 4 && health.every((state) => state === "ok"))
    return {
      label: "Operando normalmente",
      description: "Telemetria dos quatro sensores atualizada.",
      tone: "calm",
    };
  return {
    label: "Atenção",
    description: "Há leituras atrasadas ou um estado ainda não confirmado.",
    tone: "attention",
  };
}
