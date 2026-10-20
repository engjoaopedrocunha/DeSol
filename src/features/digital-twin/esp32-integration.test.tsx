import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Esp32TelemetryPanel } from "./Esp32TelemetryPanel";

const reading = {
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
  recebido_em: "2026-10-20T15:00:00.000Z",
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("mostra o sketch original e remove o comando antigo quando a rede falha", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ configured: true }))
    .mockResolvedValueOnce(Response.json(reading))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(Response.json({ ...reading, bomba: false }));
  vi.stubGlobal("fetch", fetch);
  render(<Esp32TelemetryPanel />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText("LIGADA")).toBeInTheDocument();
  expect(screen.getByText("50%")).toBeInTheDocument();
  expect(screen.getByText(/firmware não informa o horário/)).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.queryByText("LIGADA")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("desconhecido");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(screen.getByText("DESLIGADA")).toBeInTheDocument();
});

it("expira a resposta anterior mesmo se a próxima consulta ficar pendente", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ configured: true }))
      .mockResolvedValueOnce(Response.json(reading))
      .mockImplementation(() => new Promise(() => {})),
  );
  render(<Esp32TelemetryPanel />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText("LIGADA")).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(screen.queryByText("LIGADA")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
