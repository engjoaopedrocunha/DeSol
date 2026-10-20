# Integração do ESP32 com o DeSol

A integração usa exatamente o JSON publicado pelo sketch original em `GET /api/dados`. Nenhum arquivo da pasta `firmware` precisa ser alterado para adaptar o painel. O controle automático da bomba continua na placa.

## Compatibilidade com o código enviado com LCD

O anexo enviado em 20/10/2026 acrescenta o LCD I²C no endereço `0x27`, com SDA no GPIO 21 e SCL no GPIO 22. A função `rotaDados()` é idêntica à da versão anterior: os mesmos 13 campos, tipos, unidades e valores nulos. Portanto, essa versão funciona com o adaptador atual sem alterar o código da placa. O LCD é atualizado localmente pelo sketch e não fornece dados nem comandos pela API.

O código enviado permanece intacto; o arquivo `.ino` da pasta `firmware` também foi preservado e ainda representa a versão anterior sem LCD. Para a placa já funcionando com o novo código, não é necessário gravar outro firmware nem instalar bibliotecas no computador servidor. Basta configurar o IP no DeSol conforme os passos abaixo.

O sistema respeita o campo `bomba` recebido, sem recalculá-lo pelo nível ou pela distância. Na faixa entre 2,33 e 5,27 cm, ambos os estados são possíveis por causa da histerese. A saída HIGH/LOW permanece sob responsabilidade da placa. Leituras iniciais nulas e ADC/tensões iguais a zero são aceitos como publicados, sem substituir ausência de temperatura, distância ou nível por zero.

## Caminho dos dados

```text
ESP32 /api/dados ← servidor local DeSol ← navegador /api/esp32/telemetry
```

O servidor valida a resposta da placa, acrescenta `recebido_em` e a entrega ao cartão ESP32. Esse horário indica recebimento pelo servidor; o sketch não informa horário nem idade da medição. A interface consulta a ponte a cada 2 segundos após uma resposta bem-sucedida e faz novas tentativas com espera progressiva após falhas. Uma falha remove a leitura anterior; uma resposta também expira na interface após 10 segundos sem renovação. Isso detecta falhas de comunicação, mas não comprova se a placa continua atualizando seus sensores enquanto responde.

## Preparação da placa

Se a placa já executa o sketch e está conectada ao Wi-Fi, pule para a configuração do servidor. Se ainda não foi gravada, abra uma cópia de `firmware/desol_esp32/desol_esp32.ino` na Arduino IDE, fora desta pasta, preencha `WIFI_SSID` e `WIFI_SENHA` nessa cópia e grave na placa correspondente. Assim, o arquivo do repositório permanece intacto. Instale o pacote ESP32 da Espressif e as bibliotecas OneWire e DallasTemperature.

Abra o Monitor Serial em 115200 baud e anote o IP impresso. No computador que executará o servidor, abra `http://<IP-do-ESP32>/api/dados`. Confirme que recebe JSON. O endereço `http://<IP-do-ESP32>/` abre a página própria da placa. Se a API não abrir, confira o IP atual, credenciais e conectividade local antes de configurar o DeSol.

## Executar o painel

1. Mantenha o computador servidor e o ESP32 em uma rede local em que possam se comunicar.
2. Na raiz do projeto, copie `.env.example` para `.env.local` se o arquivo ainda não existir. Se já existir, edite somente a configuração do ESP32, preservando os outros valores.
3. Preencha com o IP real da placa:

   ```dotenv
   DESOL_ESP32_BASE_URL=http://192.168.1.50
   ```

   Use o endereço base HTTP com IPv4 privado, sem `/api/dados`. O exemplo acima não é um IP detectado automaticamente. Uma reserva DHCP no roteador evita que o endereço mude. O arquivo `.env.local` fica fora do Git.

4. Se as dependências ainda não estiverem instaladas, execute `npm install`. Inicie o projeto na raiz:

   ```powershell
   npm run dev -- --port 3000
   ```

5. Abra `http://localhost:3000` no computador servidor e encontre o cartão **ESP32 · integração pela rede Wi-Fi**. Reinicie o servidor sempre que alterar `.env.local`.

## Dados disponíveis

| Campo | Exibição |
| --- | --- |
| `temperatura` | Temperatura DS18B20 em °C; `null` aparece como sem leitura. |
| `distancia` | Distância ultrassônica em cm. |
| `nivel` | Nível estimado em %, sem conversão para mm. |
| `adc_ph` / `tensao_ph` | Sinal bruto de pH, em ADC e volts. |
| `adc_tds` / `tensao_tds` | Sinal bruto de TDS, em ADC e volts. |
| `ph` / `salinidade` | Continuam `null`; o código não tem calibração para valores de pH/ppm. |
| `bomba` | Comando informado pela placa; não confirma funcionamento mecânico nem fluxo de água. |
| `recebido_em` | Adicionado pelo servidor, identificado como horário de recebimento. |

O adaptador não exige versão, ID, RSSI Wi-Fi, sequência ou diagnóstico que o sketch não envia. O recebimento de uma resposta confirma comunicação HTTP, sem inventar medições de intensidade do Wi-Fi. Não se infere uma nova amostra apenas porque o valor mudou ou permaneceu igual.

## Conferir e diagnosticar

- `http://<IP-do-ESP32>/api/dados`: resposta original da placa.
- `http://localhost:3000/api/esp32/config`: deve retornar `{"configured":true}` quando o endereço está configurado em formato permitido. Isso não testa se a placa responde.
- `http://localhost:3000/api/esp32/telemetry`: deve retornar as leituras originais mais `recebido_em`; falha ou resposta incompatível retorna erro, sem dados DEMO.

Se a primeira URL funciona e a terceira não, confira `.env.local`, reinicie o servidor e veja os logs do terminal. A ponte exige JSON no formato do sketch, recusa redirecionamentos e usa timeout de 6 segundos para a consulta HTTP. Se o IP mudar, atualize a configuração e reinicie o servidor. Desconecte e reconecte a rede para conferir a indicação de falha e a recuperação automática da interface; não é necessário mudar a lógica da bomba para testar comunicação.

## Alcance desta integração

O cartão mostra todos os dados disponíveis no sketch. DEMO, histórico r33, mapas e gráficos de outros sensores continuam com suas fontes identificadas: irradiância, produção e vazão não estão presentes nesse JSON. Não existe comando HTTP para acionar a bomba. Não é possível acrescentar controle remoto ou leitura calibrada apenas alterando o frontend.

O site publicado na Lovable não alcança diretamente o IP privado do ESP32. Para monitoramento pela internet mantendo o firmware intacto, o próximo componente é um gateway na rede da placa: ele consulta `/api/dados` e envia as leituras para um backend HTTPS com autenticação e banco de dados. Esse backend pode armazenar histórico com horário de recebimento e servir o site publicado. Requer definir e disponibilizar esse serviço e o gateway; esta ponte local não os cria nem expõe a placa na internet.
