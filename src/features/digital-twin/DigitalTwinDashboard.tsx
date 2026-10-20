import { lazy, Suspense, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  ChevronDown,
  Clock3,
  Droplets,
  Gauge,
  Info,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip as Hint,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  calculateHealth,
  filterRecords,
  formatTimestamp,
  formatValue,
  isSensor,
  latestBySensor,
  modelManifest,
  parts,
  recordsToCsv,
  sensorIds,
  sensors,
  type ComponentId,
  type DemoScenario,
  type Health,
  type Reading,
  type SensorId,
} from "./model";
import { overviewDisplayState, sensorDisplayState } from "./dashboard-presentation";
import { HistoryChart, Sparkline } from "./TelemetryCharts";
import { useDigitalTelemetry } from "./use-telemetry";
import { Esp32TelemetryPanel } from "./Esp32TelemetryPanel";
import type { SceneReport } from "./ModelViewer";
import LegacyTelemetryPanel from "./LegacyTelemetryPanel";

const ModelViewer = lazy(() => import("./ModelViewer"));
const sensorIcons = {
  solar_irradiance: Sun,
  water_level: Droplets,
  production_flow: Gauge,
  gateway: Radio,
};
const cardLabels = {
  solar_irradiance: "Irradiância",
  water_level: "Nível de água",
  production_flow: "Vazão produzida",
  gateway: "Conexão",
};
const qualityLabels = { good: "Boa", suspect: "Suspeita", bad: "Inválida", missing: "Ausente" };
function SensorState({
  health,
  demo,
  reading,
}: {
  health: Health;
  demo: boolean;
  reading?: Reading | undefined;
}) {
  const state = sensorDisplayState(health, demo, reading);
  return (
    <span className={`dt-status dt-status-${demo ? "demo" : health} dt-state-${state.tone}`}>
      <span />
      {state.label}
    </span>
  );
}
export default function DigitalTwinDashboard() {
  const [selected, setSelected] = useState<ComponentId>("solar_irradiance");
  const [scene, setScene] = useState<SceneReport | null>(null);
  const [reportSensor, setReportSensor] = useState<SensorId | "all">("all");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const drawerTrigger = useRef<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState<"detail" | "history" | "diagnostics" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const showDrawer = (view: "detail" | "history" | "diagnostics") => {
    setDrawer(view);
    setDrawerOpen(true);
  };
  const [showLegacy, setShowLegacy] = useState(false);
  const from = fromInput ? `${fromInput}:00Z` : "";
  const to = toInput ? `${toInput}:00Z` : "";
  const telemetry = useDigitalTelemetry(from, to);
  const demo = telemetry.mode === "demo";
  const latest = latestBySensor(telemetry.records);
  const interval =
    telemetry.summary?.sampleIntervalSeconds ?? telemetry.config?.sampleIntervalSeconds;
  const health = (id: SensorId): Health =>
    telemetry.connection === "disconnected" || telemetry.mode !== "real"
      ? "unknown"
      : calculateHealth(
          latest[id],
          telemetry.now,
          interval,
          telemetry.summary?.hardwareConfirmed,
          telemetry.summary?.communication === "offline",
        );
  const current = isSensor(selected) ? latest[selected] : undefined;
  const rangeInvalid = !!from && !!to && Date.parse(from) > Date.parse(to);
  const filtered = filterRecords(
    telemetry.history,
    reportSensor,
    from ? Date.parse(from) : -Infinity,
    to ? Date.parse(to) : Infinity,
  );
  const events = telemetry.events.filter(
    (event) =>
      (!event.sensorId || reportSensor === "all" || event.sensorId === reportSensor) &&
      (!from || Date.parse(event.timestamp) >= Date.parse(from)) &&
      (!to || Date.parse(event.timestamp) <= Date.parse(to)),
  );
  const lastTimestamp = telemetry.records.length
    ? Math.max(...telemetry.records.map((r) => Date.parse(r.timestamp)))
    : undefined;
  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([recordsToCsv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `desol-${demo ? "demo" : "real"}-${reportSensor}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const preset = (hours: number) => {
    const anchor = demo
      ? Math.max(...telemetry.records.map((r) => Date.parse(r.timestamp)))
      : Date.now();
    setFromInput(new Date(anchor - hours * 3_600_000).toISOString().slice(0, 16));
    setToInput(new Date(anchor).toISOString().slice(0, 16));
  };

  const overview = overviewDisplayState({
    mode: telemetry.mode,
    disconnected: telemetry.connection === "disconnected",
    scenario: telemetry.demoScenario,
    health: sensorIds.map(health),
  });
  const openDetail = (id: ComponentId) => {
    setSelected(id);
    if (isSensor(id)) setReportSensor(id);
    showDrawer("detail");
  };
  const recentAnchor = demo ? (lastTimestamp ?? telemetry.now) : telemetry.now;
  const recentHistory = filterRecords(
    telemetry.history,
    "all",
    recentAnchor - 86_400_000,
    recentAnchor,
  );
  const selectedLabel = isSensor(selected) ? sensors[selected].label : parts[selected].label;
  const demoExplanation =
    "Dados simulados — sem telemetria real. A demonstração não confirma a instalação ou a saúde física do equipamento.";
  return (
    <AppShell
      title="Gêmeo digital"
      statusBar={null}
      titleAccessory={
        <TooltipProvider delayDuration={200}>
          <Hint>
            <TooltipTrigger asChild>
              <button
                className="dt-mode-chip"
                aria-label={
                  demo ? "DEMO: informações sobre os dados simulados" : "Origem da telemetria"
                }
                onClick={() => showDrawer("diagnostics")}
              >
                {demo ? "DEMO" : telemetry.mode === "checking" ? "CONECTANDO" : "API REAL"}
              </button>
            </TooltipTrigger>
            <TooltipContent className="dt-mode-tooltip">
              {demo
                ? demoExplanation
                : "Consulte a origem e a qualidade das leituras em Diagnóstico."}
            </TooltipContent>
          </Hint>
        </TooltipProvider>
      }
      headerActions={
        <span className="dt-header-time">
          <Clock3 size={14} /> Última leitura <time>{formatTimestamp(lastTimestamp)}</time>
        </span>
      }
    >
      <div className="dt-dashboard dt-overview">
        <section
          className={`dt-overall dt-state-${overview.tone}`}
          aria-label="Estado geral"
          aria-live="polite"
        >
          <div>
            <span className="dt-eyebrow">Dessalinizador solar</span>
            <h2>
              <span className="dt-overall-dot" />
              {overview.label}
            </h2>
            <p>{overview.description}</p>
          </div>
          <div className="dt-daily-production">
            <span>Produção de água hoje</span>
            <strong>
              — <small>L</small>
            </strong>
            <p>Acumulado diário não disponível</p>
          </div>
        </section>
        {telemetry.error && (
          <div className="dt-api-error" role="alert">
            <AlertTriangle size={18} />
            <p>API indisponível. As leituras disponíveis podem estar desatualizadas.</p>
            <button onClick={telemetry.retry}>
              <RefreshCw size={14} />
              Reconectar
            </button>
            <button onClick={telemetry.showDemo}>Explorar DEMO</button>
          </div>
        )}
        {demo && telemetry.config?.mode === "real" && (
          <button className="dt-button mb-4" onClick={telemetry.retry}>
            <RefreshCw size={14} />
            Retomar API real
          </button>
        )}
        <Esp32TelemetryPanel />
        <div className="dt-metrics" aria-label="Sensores do equipamento">
          {sensorIds.map((id) => {
            const Icon = sensorIcons[id];
            const state = sensorDisplayState(health(id), demo, latest[id]);
            return (
              <button
                key={id}
                className={`dt-metric-card dt-state-${state.tone} ${selected === id ? "is-selected" : ""}`}
                onClick={() => openDetail(id)}
                aria-label={`Detalhes de ${cardLabels[id]}`}
                aria-pressed={selected === id}
                aria-haspopup="dialog"
              >
                <div className="dt-metric-heading">
                  <span>
                    <Icon size={16} />
                    {cardLabels[id]}
                  </span>
                  <ArrowUpRight size={14} />
                </div>
                <div className={`dt-metric-value ${id === "gateway" ? "dt-gateway-value" : ""}`}>
                  {formatValue(latest[id])} {id !== "gateway" && <small>{sensors[id].unit}</small>}
                </div>
                <Sparkline id={id} records={recentHistory} interval={demo ? 900 : interval} />
                <SensorState health={health(id)} demo={demo} reading={latest[id]} />
              </button>
            );
          })}
        </div>
        <section className="dt-model-section" aria-label="Explorar equipamento">
          <div className="dt-model-heading">
            <div>
              <h2>Explore o equipamento</h2>
              <p>Selecione um sensor ou toque em uma peça para ver os detalhes.</p>
            </div>
            <label className="dt-part-picker">
              <span className="sr-only">Explorar componentes</span>
              <select
                aria-label="Explorar componentes"
                value={selected}
                onChange={(event) => openDetail(event.target.value as ComponentId)}
              >
                <optgroup label="Sensores">
                  {sensorIds.map((id) => (
                    <option key={id} value={id}>
                      {sensors[id].label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Componentes">
                  {Object.entries(parts).map(([id, part]) => (
                    <option key={id} value={id}>
                      {part.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
          <Suspense
            fallback={<div className="dt-viewer dt-empty">Preparando visualizador 3D…</div>}
          >
            <ModelViewer
              selected={selected}
              onSelect={setSelected}
              onActivate={openDetail}
              onInspect={setScene}
              telemetry={{
                readings: latest,
                health: Object.fromEntries(sensorIds.map((id) => [id, health(id)])) as Record<
                  SensorId,
                  Health
                >,
                mode: telemetry.mode,
                error: telemetry.error,
              }}
            />
          </Suspense>
        </section>
        <nav className="dt-secondary-actions" aria-label="Consultas do equipamento">
          <button
            onClick={() => {
              setReportSensor("all");
              showDrawer("history");
            }}
          >
            <Clock3 size={15} />
            Histórico e exportação
          </button>
          <button onClick={() => showDrawer("diagnostics")}>
            <SlidersHorizontal size={15} />
            Diagnóstico
          </button>
        </nav>
      </div>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={`dt-dashboard dt-drawer ${drawer === "detail" && !isSensor(selected) ? "dt-drawer-compact" : ""}`}
          overlayClassName="dt-drawer-overlay"
          onOpenAutoFocus={() => {
            drawerTrigger.current =
              document.activeElement instanceof HTMLElement &&
              document.activeElement !== document.body
                ? document.activeElement
                : document.querySelector<HTMLElement>(".dt-metric-card.is-selected, .dt-canvas");
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            drawerTrigger.current?.focus({ preventScroll: true });
          }}
        >
          <SheetHeader className="dt-drawer-header">
            <span className="dt-eyebrow">DeSol · {demo ? "Dados simulados" : "Telemetria"}</span>
            <SheetTitle>
              {drawer === "diagnostics"
                ? "Diagnóstico"
                : drawer === "history"
                  ? "Histórico e exportação"
                  : selectedLabel}
            </SheetTitle>
            <SheetDescription
              className={drawer === "detail" && !isSensor(selected) ? "sr-only" : ""}
            >
              {drawer === "diagnostics"
                ? "Informações técnicas, origem dos dados e configuração da demonstração."
                : drawer === "history"
                  ? "Consulte as leituras recebidas e exporte os registros disponíveis."
                  : isSensor(selected)
                    ? "Leitura atual, histórico e informações deste sensor."
                    : "Informações deste componente."}
            </SheetDescription>
          </SheetHeader>
          <div className="dt-drawer-body">
            {drawer === "detail" && (
              <div className="dt-selected-panel">
                {isSensor(selected) && (
                  <>
                    <div className="dt-detail-value">
                      {formatValue(current)}
                      <small>{selected === "gateway" ? "" : sensors[selected].unit}</small>
                    </div>
                    <SensorState health={health(selected)} demo={demo} reading={current} />
                    <HistoryChart
                      id={selected}
                      records={filtered}
                      interval={demo ? 900 : interval}
                      demo={demo}
                    />
                    <dl className="dt-reading-details">
                      <div>
                        <dt>Última amostra</dt>
                        <dd>{formatTimestamp(current?.timestamp)}</dd>
                      </div>
                      <div>
                        <dt>Qualidade</dt>
                        <dd>{current ? qualityLabels[current.quality] : "Sem dados"}</dd>
                      </div>
                      <div>
                        <dt>Origem</dt>
                        <dd>
                          {current?.source === "demo"
                            ? "Simulada"
                            : current?.source === "real"
                              ? "API real"
                              : "Não disponível"}
                        </dd>
                      </div>
                      {current?.batteryPct != null && (
                        <div>
                          <dt>Bateria</dt>
                          <dd>{current.batteryPct}%</dd>
                        </div>
                      )}
                      {current?.rssiDbm != null && (
                        <div>
                          <dt>RSSI</dt>
                          <dd>{current.rssiDbm} dBm</dd>
                        </div>
                      )}
                      {current?.diagnosticCode && (
                        <div>
                          <dt>Diagnóstico</dt>
                          <dd>{current.diagnosticCode}</dd>
                        </div>
                      )}
                    </dl>
                  </>
                )}
                <p>
                  {isSensor(selected) ? sensors[selected].description : parts[selected].description}
                </p>
                {!isSensor(selected) && (
                  <p>Este componente não possui medição dedicada configurada.</p>
                )}
              </div>
            )}
            {(drawer === "history" || (drawer === "detail" && isSensor(selected))) && (
              <>
                <section id="dt-reports" className="dt-reports" aria-labelledby="dt-reports-title">
                  <div className="dt-reports-heading">
                    <div>
                      <span className="dt-eyebrow">Telemetria e relatórios</span>
                      <h2 id="dt-reports-title">Histórico de leituras</h2>
                      <p>
                        {demo
                          ? "Amostras do pacote de demonstração de 09/10/2026."
                          : "Registros recebidos pela API; os filtros consultam o período solicitado."}{" "}
                        Horários em Cuiabá (UTC−4).
                      </p>
                    </div>
                    <button
                      className="dt-button dt-button-primary"
                      onClick={exportCsv}
                      disabled={!filtered.length || rangeInvalid}
                    >
                      <ArrowDownToLine size={16} /> Exportar CSV <span>({filtered.length})</span>
                    </button>
                  </div>
                  <div className="dt-report-filters">
                    {drawer === "history" && (
                      <label>
                        Sensor
                        <select
                          aria-label="Filtrar por sensor"
                          value={reportSensor}
                          onChange={(event) =>
                            setReportSensor(event.target.value as SensorId | "all")
                          }
                        >
                          <option value="all">Todos os sensores</option>
                          {sensorIds.map((id) => (
                            <option key={id} value={id}>
                              {sensors[id].label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      De (UTC)
                      <input
                        aria-label="Início do período em UTC"
                        type="datetime-local"
                        value={fromInput}
                        onChange={(event) => setFromInput(event.target.value)}
                      />
                    </label>
                    <label>
                      Até (UTC)
                      <input
                        aria-label="Fim do período em UTC"
                        type="datetime-local"
                        value={toInput}
                        onChange={(event) => setToInput(event.target.value)}
                      />
                    </label>
                    <div className="dt-range-presets">
                      <button onClick={() => preset(1)}>1 h</button>
                      <button onClick={() => preset(24)}>24 h</button>
                      <button
                        onClick={() => {
                          setFromInput("");
                          setToInput("");
                        }}
                      >
                        Limpar período
                      </button>
                    </div>
                  </div>
                  {rangeInvalid && (
                    <p role="alert" className="dt-binding-warning">
                      A data inicial deve ser anterior à data final.
                    </p>
                  )}
                  {drawer === "history" && (
                    <div className="dt-history-grid">
                      {sensorIds
                        .filter((id) => reportSensor === "all" || id === reportSensor)
                        .map((id) => (
                          <HistoryChart
                            key={id}
                            id={id}
                            records={filtered}
                            interval={demo ? 900 : interval}
                            demo={demo}
                          />
                        ))}
                    </div>
                  )}
                  <details className="dt-records">
                    <summary>
                      Consultar registros disponíveis <span>{filtered.length} registros</span>
                    </summary>
                    <div className="dt-table-scroll">
                      <table>
                        <caption className="sr-only">
                          Registros filtrados de telemetria, com horário, sensor, unidade, qualidade
                          e origem.
                        </caption>
                        <thead>
                          <tr>
                            <th>Data · Cuiabá</th>
                            <th>Sensor</th>
                            <th>Valor</th>
                            <th>Qualidade</th>
                            <th>Origem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((r, i) => (
                            <tr key={`${r.sensorId}-${r.timestamp}-${i}`}>
                              <td>{formatTimestamp(r.timestamp)}</td>
                              <td>{sensors[r.sensorId].shortLabel}</td>
                              <td>
                                {formatValue(r)} {r.unit !== "boolean" ? r.unit : ""}
                              </td>
                              <td>{qualityLabels[r.quality]}</td>
                              <td>{r.source === "demo" ? "Simulada" : "Real"}</td>
                            </tr>
                          ))}
                          {!filtered.length && (
                            <tr>
                              <td colSpan={5}>Nenhum registro disponível nesse período.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </section>
                <section className="dt-events" aria-labelledby="dt-events-title">
                  <div className="dt-section-heading">
                    <h2 id="dt-events-title">Eventos e alertas</h2>
                    <span>{events.length}</span>
                  </div>
                  {events.length ? (
                    <ul>
                      {events.map((event) => (
                        <li key={event.id}>
                          <span className={`dt-event-icon dt-event-${event.severity}`}>
                            {event.severity === "info" ? (
                              <Info size={17} />
                            ) : (
                              <AlertTriangle size={17} />
                            )}
                          </span>
                          <div>
                            <p>{event.message}</p>
                            <span>
                              {formatTimestamp(event.timestamp)} ·{" "}
                              {event.source === "demo"
                                ? "Evento de demonstração"
                                : "Evento recebido do backend"}
                              {event.sensorId ? ` · ${sensors[event.sensorId].shortLabel}` : ""}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="dt-empty">
                      Nenhum evento recebido no período. Isso não confirma ausência de falhas no
                      hardware.
                    </div>
                  )}
                </section>
              </>
            )}
            {drawer === "diagnostics" && (
              <div className="dt-diagnostics">
                <section>
                  <h2>Modelo e vínculos</h2>
                  <div className="dt-model-meta">
                    <span>
                      <Box size={14} />
                      GLB local · revisão {modelManifest.revision}
                    </span>
                    <span>
                      {scene
                        ? `${scene.objectCount} objetos · ${scene.found.filter(isSensor).length}/4 papéis de sensor encontrados`
                        : "Aguardando inspeção da cena"}
                    </span>
                  </div>
                  {scene && scene.missingNames.length > 0 && (
                    <p className="dt-binding-warning">
                      <AlertTriangle size={14} />
                      {scene.missingNames.length} nomes esperados não encontrados no arquivo.
                    </p>
                  )}
                  <p>Dimensões conceituais; não utilizar como cotas de fabricação.</p>
                </section>
                {telemetry.error && (
                  <section>
                    <h2>Conexão com a API</h2>
                    <p>{telemetry.error}</p>
                  </section>
                )}
                <section>
                  <h2>Origem e qualidade</h2>
                  <p>
                    {demo
                      ? demoExplanation
                      : !interval
                        ? "Intervalo esperado não configurado. A saúde não pode ser confirmada."
                        : telemetry.summary?.hardwareConfirmed
                          ? "Saúde calculada pela idade, qualidade e diagnóstico das leituras. Não confirma potabilidade ou funcionamento hidráulico completo."
                          : "A instalação do hardware ainda não foi confirmada pelo backend."}
                  </p>
                  <dl className="dt-reading-details">
                    {sensorIds.map((id) => (
                      <div key={id}>
                        <dt>{cardLabels[id]}</dt>
                        <dd>
                          {latest[id] ? qualityLabels[latest[id].quality] : "Sem dados"} ·{" "}
                          {latest[id]?.source === "demo"
                            ? "Simulada"
                            : latest[id]?.source === "real"
                              ? "API real"
                              : "Origem indisponível"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section>
                  <h2>Sobre a produção diária</h2>
                  <p>
                    O contrato atual fornece vazão em L/h, mas não o volume acumulado do dia. O
                    painel mantém esse total indisponível, sem transformar leituras pontuais em
                    litros produzidos.
                  </p>
                </section>
                {demo && (
                  <label className="dt-demo-controls">
                    Cenário de demonstração
                    <select
                      aria-label="Cenário de demonstração"
                      value={telemetry.demoScenario}
                      onChange={(event) =>
                        telemetry.setDemoScenario(event.target.value as DemoScenario)
                      }
                    >
                      <option value="nominal">Leituras de referência</option>
                      <option value="gateway-offline">Simular gateway offline</option>
                      <option value="bad-reading">Simular leitura inválida</option>
                    </select>
                    <span>Os cenários não alteram dados reais.</span>
                  </label>
                )}
                <details
                  className="dt-legacy"
                  onToggle={(event) => setShowLegacy(event.currentTarget.open)}
                >
                  <summary>
                    <Activity size={16} />
                    Painel anterior · métricas complementares
                    <ChevronDown size={15} />
                  </summary>
                  {showLegacy && <LegacyTelemetryPanel />}
                </details>
              </div>
            )}
          </div>
          <footer className="dt-drawer-footer">
            <SheetClose asChild>
              <button className="dt-button">
                <ChevronDown size={16} />
                Voltar ao painel
              </button>
            </SheetClose>
          </footer>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
