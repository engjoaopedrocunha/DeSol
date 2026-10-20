import { AlertTriangle, Droplets, Gauge, Power, Radio, Thermometer, Wifi } from "lucide-react";
import { useEsp32Telemetry } from "./use-esp32-telemetry";

const percent = (value: number | null) =>
  value === null
    ? "Sem leitura"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
const number = (value: number | null, unit: string, digits = 2) =>
  value === null
    ? "Sem leitura"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(value)} ${unit}`;

export function Esp32TelemetryPanel() {
  const { configured, reading, error } = useEsp32Telemetry();

  return (
    <section className="dt-esp32" aria-labelledby="dt-esp32-title">
      <header className="dt-esp32-header">
        <div>
          <span className="dt-esp32-kicker">Leituras locais do equipamento</span>
          <h2 id="dt-esp32-title">ESP32 · integração pela rede Wi-Fi</h2>
          <p>
            Dados recebidos diretamente da placa. Esta seção é independente das leituras de
            demonstração do gêmeo digital.
          </p>
        </div>
        <span
          className={`dt-esp32-status ${reading ? "is-connected" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span />
          {reading ? "Placa consultada" : error ? "Sem resposta atual" : "Aguardando conexão"}
        </span>
      </header>

      {configured === false && (
        <div className="dt-esp32-message">
          <Wifi size={18} />
          <p>
            Configure <code>DESOL_ESP32_BASE_URL=http://IP-DA-PLACA</code> no arquivo
            <code> .env.local</code> e reinicie o servidor. O computador do servidor e o ESP32
            precisam estar na mesma rede.
          </p>
        </div>
      )}

      {configured === true && error && (
        <div className="dt-esp32-message is-error" role="alert">
          <AlertTriangle size={18} />
          <p>
            O servidor não recebeu uma leitura válida do ESP32. Verifique o IP, a conexão Wi-Fi e o
            endereço <code>/api/dados</code>. O estado atual dos sensores e do comando da bomba é
            desconhecido; novas tentativas são automáticas.
          </p>
        </div>
      )}

      {reading && (
        <>
          <div className="dt-esp32-readings" aria-label="Leituras recebidas do ESP32">
            <article className="dt-esp32-card">
              <span>
                <Thermometer size={16} /> Temperatura
              </span>
              <strong>{number(reading.temperatura, "°C")}</strong>
              <small>DS18B20 · GPIO 18</small>
            </article>
            <article className="dt-esp32-card">
              <span>
                <Radio size={16} /> Distância
              </span>
              <strong>{number(reading.distancia, "cm")}</strong>
              <small>Ultrassônico · GPIO 25/33</small>
            </article>
            <article className="dt-esp32-card">
              <span>
                <Droplets size={16} /> Nível estimado
              </span>
              <strong>{percent(reading.nivel)}</strong>
              <small>Distância de referência · 30 cm vazio / 5 cm cheio</small>
            </article>
            <article className="dt-esp32-card">
              <span>
                <Gauge size={16} /> Sinal do sensor de pH
              </span>
              <strong>{number(reading.tensao_ph, "V", 3)}</strong>
              <small>ADC {reading.adc_ph ?? "—"} · calibração pendente</small>
            </article>
            <article className="dt-esp32-card">
              <span>
                <Gauge size={16} /> Sinal do sensor TDS
              </span>
              <strong>{number(reading.tensao_tds, "V", 3)}</strong>
              <small>ADC {reading.adc_tds ?? "—"} · calibração pendente</small>
            </article>
            <article className={`dt-esp32-card dt-esp32-pump ${reading.bomba ? "is-running" : ""}`}>
              <span>
                <Power size={16} /> Bomba · comando do relé
              </span>
              <strong>{reading.bomba ? "LIGADA" : "DESLIGADA"}</strong>
              <small>
                {reading.bomba ? "GPIO 26 HIGH · " : "GPIO 26 LOW · "}
                comando informado pela placa
              </small>
            </article>
          </div>

          <footer className="dt-esp32-footer">
            <span>
              <Wifi size={14} /> Resposta recebida pela rede local
            </span>
            <span>
              Recebimento no servidor: {new Date(reading.recebido_em).toLocaleTimeString("pt-BR")}
            </span>
          </footer>

          <p className="dt-esp32-note">
            “Bomba” indica o sinal enviado ao relé; a placa não mede o funcionamento mecânico nem
            confirma o fluxo de água. O nível é uma porcentagem estimada e não é convertido para
            milímetros. pH e TDS mostram tensão até a calibração dos sensores. O firmware não
            informa o horário das medições; receber uma resposta não comprova a idade da amostra.
          </p>
        </>
      )}
    </section>
  );
}
