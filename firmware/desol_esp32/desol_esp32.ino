
#include <WiFi.h>
#include <WebServer.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>

// ==============================
// CONFIGURACAO DO WIFI
// ==============================

const char* WIFI_SSID = "SEU_WIFI";
const char* WIFI_SENHA = "SUA_SENHA";

WebServer servidor(80);

// ==============================
// PINOS DO ESP32
// ==============================

#define PIN_PH       34
#define PIN_TDS      35
#define PIN_TEMP     18
#define PIN_TRIG     25
#define PIN_ECHO     33
#define PIN_RELE     26

// ==============================
// CONFIGURACAO DO RESERVATORIO
// ==============================

// Ajuste apos medir seu reservatorio.
// Distancia do sensor ate a agua,
// com o reservatorio vazio e cheio.
const float DISTANCIA_VAZIO_CM = 30.0;
const float DISTANCIA_CHEIO_CM = 5.0;

// ==============================
// SENSOR DE TEMPERATURA
// ==============================

OneWire oneWire(PIN_TEMP);
DallasTemperature sensorTemp(&oneWire);

// ==============================
// VARIAVEIS DOS SENSORES
// ==============================

float temperatura = NAN;
float distancia = NAN;
float nivel = NAN;

int adcPH = 0;
int adcTDS = 0;

float tensaoPH = 0;
float tensaoTDS = 0;

unsigned long ultimaLeitura = 0;
const unsigned long INTERVALO_LEITURA = 2000;

// Rele ativo em LOW: LOW liga, HIGH desliga.
const float DISTANCIA_LIGAR_CM = 5.27f;
const float DISTANCIA_DESLIGAR_CM = 2.33f;
bool bombaLigada = false;

void controlarBomba(bool ligar) {
  digitalWrite(PIN_RELE, ligar ? HIGH : LOW);
  bombaLigada = ligar;
}

void atualizarBomba() {
  if (isnan(distancia)) {
    controlarBomba(false);
  } else if (distancia >= DISTANCIA_LIGAR_CM) {
    controlarBomba(true);
  } else if (distancia <= DISTANCIA_DESLIGAR_CM) {
    controlarBomba(false);
  }
  // Entre os limites, conserva o estado anterior.
}


// ==============================
// SENSOR ULTRASSONICO
// ==============================

float lerDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);

  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duracao =
    pulseIn(PIN_ECHO, HIGH, 30000UL);

  if (duracao == 0) {
    return NAN;
  }

  float cm = duracao * 0.0343f / 2.0f;

  if (cm < 2.0 || cm > 400.0) {
    return NAN;
  }

  return cm;
}

// ==============================
// CALCULO DO NIVEL
// ==============================

float calcularNivel(float distanciaCM) {
  if (isnan(distanciaCM)) {
    return NAN;
  }

  float intervalo =
    DISTANCIA_VAZIO_CM - DISTANCIA_CHEIO_CM;

  if (intervalo <= 0) {
    return NAN;
  }

  float percentual =
    (DISTANCIA_VAZIO_CM - distanciaCM)
    * 100.0f / intervalo;

  return constrain(percentual, 0.0f, 100.0f);
}

// ==============================
// LEITURA DOS SENSORES
// ==============================

void lerSensores() {
  // Temperatura
  sensorTemp.requestTemperatures();

  float leituraTemp =
    sensorTemp.getTempCByIndex(0);

  if (leituraTemp == DEVICE_DISCONNECTED_C ||
      leituraTemp < -55 ||
      leituraTemp > 125) {
    temperatura = NAN;
  } else {
    temperatura = leituraTemp;
  }

  // Ultrassonico
  distancia = lerDistancia();
  nivel = calcularNivel(distancia);

  // Sensor de pH
  adcPH = analogRead(PIN_PH);
  tensaoPH = analogReadMilliVolts(PIN_PH) / 1000.0f;

  // Sensor TDS
  adcTDS = analogRead(PIN_TDS);
  tensaoTDS = analogReadMilliVolts(PIN_TDS) / 1000.0f;

  // ATENCAO:
  // pH e TDS precisam de calibracao.
  // Nao inventamos valores de pH ou ppm
  // a partir das tensoes sem calibrar.
}

// ==============================
// FUNCOES AUXILIARES JSON
// ==============================

String numeroOuNull(float valor, int casas = 2) {
  if (isnan(valor) || isinf(valor)) {
    return "null";
  }

  return String(valor, casas);
}

// ==============================
// API PARA PAGINA WEB
// ==============================

void rotaDados() {
  String json = "{";

  json += "\"temperatura\":";
  json += numeroOuNull(temperatura);
  json += ",";

  json += "\"distancia\":";
  json += numeroOuNull(distancia);
  json += ",";

  json += "\"nivel\":";
  json += numeroOuNull(nivel);
  json += ",";

  // Valores nao calibrados
  json += "\"ph\":null,";
  json += "\"ph_calibrado\":false,";

  json += "\"adc_ph\":";
  json += String(adcPH);
  json += ",";

  json += "\"tensao_ph\":";
  json += numeroOuNull(tensaoPH, 3);
  json += ",";

  json += "\"salinidade\":null,";
  json += "\"tds_calibrado\":false,";

  json += "\"adc_tds\":";
  json += String(adcTDS);
  json += ",";

  json += "\"tensao_tds\":";
  json += numeroOuNull(tensaoTDS, 3);
  json += ",\"bomba\":";
  json += bombaLigada ? "true" : "false";

  json += "}";

  servidor.send(200, "application/json", json);
}

// ==============================
// PAGINA WEB DE TESTE
// ==============================

void rotaPrincipal() {
  String pagina = R"rawliteral(
<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1">
  <title>Dessalinizador Solar</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #edf4f8;
      color: #19344a;
      padding: 24px;
      max-width: 650px;
      margin: auto;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 18px;
      margin: 12px 0;
      box-shadow: 0 2px 8px #0001;
    }
    h1 { font-size: 24px; }
    .valor {
      font-size: 22px;
      font-weight: bold;
      margin-top: 8px;
    }
    small { color: #607080; }
  </style>
</head>
<body>
  <h1>Dessalinizador Solar</h1>
  <p>Monitoramento pelo ESP32</p>

  <div class="card">
    Temperatura
    <div class="valor" id="temp">--</div>
  </div>

  <div class="card">
    Nivel da agua
    <div class="valor" id="nivel">--</div>
  </div>

  <div class="card">
    Distancia ultrassonica
    <div class="valor" id="dist">--</div>
  </div>

  <div class="card">
    Sensor de pH
    <div class="valor" id="ph">--</div>
    <small>Aguardando calibracao</small>
  </div>

  <div class="card">
    Sensor TDS
    <div class="valor" id="tds">--</div>
    <small>Aguardando calibracao</small>
  </div>

  <div class="card">Bomba (comando)<div class="valor" id="bomba">--</div></div>

  <script>
    function formatar(valor, unidade) {
      if (valor === null || valor === undefined) {
        return "Sem leitura";
      }
      return Number(valor).toFixed(2) + " " + unidade;
    }

    async function atualizar() {
      try {
        const resposta = await fetch("/api/dados");
        const d = await resposta.json();

        document.getElementById("temp").textContent =
          formatar(d.temperatura, "°C");

        document.getElementById("nivel").textContent =
          formatar(d.nivel, "%");

        document.getElementById("dist").textContent =
          formatar(d.distancia, "cm");

        document.getElementById("ph").textContent =
          formatar(d.tensao_ph, "V");

        document.getElementById("tds").textContent =
          formatar(d.tensao_tds, "V");

        document.getElementById("bomba").textContent =
          d.bomba ? "LIGADA" : "DESLIGADA";

      } catch (erro) {
        console.error("Erro na leitura:", erro);
      }
    }

    atualizar();
    setInterval(atualizar, 2000);
  </script>
</body>
</html>
)rawliteral";

  servidor.send(200, "text/html; charset=utf-8", pagina);
}

// ==============================
// SETUP
// ==============================

void setup() {
  Serial.begin(115200);

  digitalWrite(PIN_RELE, HIGH);
  pinMode(PIN_RELE, OUTPUT);
  controlarBomba(false);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  digitalWrite(PIN_TRIG, LOW);

  analogReadResolution(12);

  analogSetPinAttenuation(PIN_PH, ADC_11db);
  analogSetPinAttenuation(PIN_TDS, ADC_11db);

  sensorTemp.begin();

  Serial.println();
  Serial.println("Iniciando dessalinizador...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);

  Serial.print("Conectando ao Wi-Fi");

  unsigned long inicioWiFi = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - inicioWiFi < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("IP do ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("Wi-Fi nao conectado.");
  }

  servidor.on("/", HTTP_GET, rotaPrincipal);
  servidor.on("/api/dados", HTTP_GET, rotaDados);

  servidor.begin();

  Serial.println("Servidor iniciado.");
}

// ==============================
// LOOP PRINCIPAL
// ==============================

void loop() {
  servidor.handleClient();

  if (millis() - ultimaLeitura >= INTERVALO_LEITURA) {
    ultimaLeitura = millis();

    lerSensores();
    atualizarBomba();

    Serial.println("---------------------");

    Serial.print("Temperatura: ");
    Serial.println(numeroOuNull(temperatura));

    Serial.print("Distancia: ");
    Serial.println(numeroOuNull(distancia));

    Serial.print("Nivel: ");
    Serial.println(numeroOuNull(nivel));

    Serial.print("pH - tensao: ");
    Serial.println(tensaoPH, 3);

    Serial.print("TDS - tensao: ");
    Serial.println(tensaoTDS, 3);

    Serial.print("Bomba (comando): ");
    Serial.println(bombaLigada ? "LIGADA" : "DESLIGADA");
  }
}
