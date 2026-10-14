import { useMemo } from "react";
import { Clock3, Droplets, Gauge, Radio, Sun } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTimestamp, historyPoints, sensors, type Reading, type SensorId } from "./model";
const sensorIcons = {
  solar_irradiance: Sun,
  water_level: Droplets,
  production_flow: Gauge,
  gateway: Radio,
};
const timeFormat = (timestamp: number) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

export function Sparkline({
  id,
  records,
  interval,
}: {
  id: SensorId;
  records: Reading[];
  interval: number | undefined;
}) {
  const { points } = useMemo(() => historyPoints(records, id, interval), [records, id, interval]);
  const count = points.filter((point) => point.value !== null).length;
  return (
    <div
      className="dt-sparkline"
      role="img"
      aria-label={`${count} amostras recentes de ${sensors[id].label}`}
    >
      {count ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer={false}
            data={points}
            margin={{ top: 5, bottom: 5, left: 4, right: 4 }}
          >
            <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis domain={id === "gateway" ? [-0.1, 1.1] : ["auto", "auto"]} hide />
            <Line
              type={id === "gateway" ? "stepAfter" : "linear"}
              dataKey="value"
              stroke="currentColor"
              strokeWidth={1.6}
              dot={count < 2 ? { r: 3, fill: "currentColor", strokeWidth: 0 } : false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <span>Sem histórico disponível</span>
      )}
      {count === 1 && <span className="dt-sparkline-note">1 amostra</span>}
    </div>
  );
}
export function HistoryChart({
  id,
  records,
  interval,
  demo,
}: {
  id: SensorId;
  records: Reading[];
  interval: number | undefined;
  demo: boolean;
}) {
  const { points, gaps } = useMemo(
    () => historyPoints(records, id, interval),
    [records, id, interval],
  );
  const sensor = sensors[id];
  const Icon = sensorIcons[id];
  return (
    <section className="dt-chart-card" aria-label={`Histórico de ${sensor.label}`}>
      <header>
        <div>
          <Icon size={16} />
          <h3>{sensor.label}</h3>
        </div>
        <span>{id === "gateway" ? "Estado de comunicação" : sensor.unit}</span>
      </header>
      <div
        className="dt-chart-plot"
        role="img"
        aria-label={`${points.filter((p) => !p.gap).length} amostras de ${sensor.label}. ${gaps} intervalos sem dados. ${demo ? "Dados simulados." : "Dados reais disponíveis."}`}
      >
        {points.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 15, right: 16, left: 2, bottom: 8 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={timeFormat}
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                minTickGap={35}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={id === "gateway" ? 88 : 50}
                domain={id === "gateway" ? [-0.1, 1.1] : ["auto", "auto"]}
                {...(id === "gateway"
                  ? {
                      ticks: [0, 1],
                      tickFormatter: (v: number) => (v === 1 ? "Conectado" : "Offline"),
                    }
                  : {})}
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#202a36",
                  border: "1px solid #344050",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: 12,
                }}
                labelFormatter={(v) => formatTimestamp(Number(v))}
                formatter={(v) => [
                  id === "gateway"
                    ? Number(v) === 1
                      ? "Conectado"
                      : "Desconectado"
                    : `${v} ${sensor.unit}`,
                  demo ? "Simulação" : "Leitura",
                ]}
              />
              <Line
                type={id === "gateway" ? "stepAfter" : "linear"}
                dataKey="value"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="dt-empty">
            <Clock3 size={22} />
            <span>Sem registros nesse período</span>
          </div>
        )}
      </div>
      <footer>
        {demo ? "Série de referência · dados simulados" : "Somente registros recebidos"}
        <span>
          {gaps
            ? `${gaps} intervalo(s) sem dados`
            : points.length < 2
              ? "Amostras insuficientes para uma série"
              : interval
                ? "Sem lacunas detectadas"
                : "Cadência não configurada"}
        </span>
      </footer>
    </section>
  );
}
