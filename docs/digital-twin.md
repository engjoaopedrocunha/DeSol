# Gêmeo digital DeSol — revisão 33

## O que funciona

- GLB local em `public/models/dessalinizador-solar-r33.glb`, sem dependência de URL assinada ou de login no Higgsfield.
- Modelo recebido: GLB 2.0, 1.749.364 bytes, 224 nodes exportados e 225 objetos na cena carregada, incluindo a raiz. Seis objetos SENSOR correspondem aos quatro papéis funcionais; todos foram encontrados.
- SHA-256: `61dd4c141a9e2c87a5d385b8e807c261612b453b22013c5f2f5e72775a37e596`.
- OrbitControls: arraste, rotação 360°, zoom limitado, rotação automática opcional, reset e tela cheia. A câmera também responde às setas, +/- e Home quando focada, além dos botões de giro lateral. Redução de movimento desativa a rotação automática.
- Tela cheia inicia a apresentação 360° (quando a redução de movimento não está ativa): percorre os 12 componentes presentes no GLB, com 12 segundos por componente, aproximação automática proporcional ao tamanho da peça, contador e balão ligado à posição 3D por uma linha projetada. A câmera muda suavemente para um ângulo 3/4 calculado para a geometria de cada peça e continua a rotação ao redor dela. O enquadramento mostra a peça inteira, reduzindo um pouco o zoom e procurando minimizar a sobreposição do balão. A leitura pausa com a aba oculta.
- Clique em uma peça na tela cheia pausa a apresentação e aproxima a câmera com uma transição de 650 ms. O painel ampliado ocupa o canto superior oposto à posição inicial da peça. Há seleção por menu/teclado, próximo componente, retorno à visão geral e retomada da apresentação. Esc ou o botão de tela cheia encerra o modo e restaura a câmera.
- Balões exibem os mesmos registros validados da página: origem DEMO/API, valor, unidade, qualidade, horário e bateria/RSSI/diagnóstico quando disponíveis. Peças sem sensor dedicado mostram a descrição e as leituras gerais, sem inventar medições. Em telas estreitas, o balão tem altura limitada e rolagem para preservar a área do modelo.
- Raycasting dos sensores, reconhecimento de filhos/ancestrais, prioridade de sensores e seleção de oito grupos de componentes. Destaque reversível por cópia de materiais; vidro, água, calha e transparências não são substituídos.
- Inspeção efetiva com `scene.traverse`; nomes esperados ausentes são reportados no console e no painel, sem criar um vínculo fictício.
- Layout responsivo, seleção textual por teclado, indicação de qualidade, horário da leitura, bateria/RSSI/diagnóstico quando recebidos, fallback com imagens técnicas para 404/GLB inválido/WebGL indisponível e botão de nova tentativa.
- Fixtures originais em `src/features/digital-twin/data/demo.json`. Dados fixos de 09/10/2026: não se inventa um relógio de telemetria ao vivo. Horários apresentados em America/Cuiaba; filtros e timestamps do contrato em UTC.
- DEMO com cenários explícitos de falha de comunicação ou leitura inválida. Eventos e dados exportados continuam com `source: demo`.
- Quatro gráficos, filtros por sensor/período, tabela de registros e CSV somente dos registros carregados e filtrados. Gateway tem uma amostra no fixture original, sinalizada como insuficiente para série histórica. O cenário de falha acrescenta uma segunda amostra simulada.
- Lacunas e leituras ausentes/inválidas interrompem a linha; não são convertidas em zeros. A cadência de referência DEMO é 15 minutos nos gráficos, sem afirmar que seja a cadência de um dispositivo físico.
- Painel anterior de TDS/temperatura/reservatório/produção preservado em seção expansível. As rotas `/preditivo`, `/mapa`, `/operacional` e a API `/api/v1` continuam disponíveis. Unidades legadas não são convertidas arbitrariamente em mm ou L/h do modelo novo.

## Arquitetura

`src/routes/index.tsx` mantém a rota TanStack existente e renderiza `DigitalTwinDashboard`. O visualizador Three.js é carregado sob demanda no navegador. A página e o restante da telemetria continuam disponíveis enquanto ele carrega ou falha.

- `model.ts`: manifesto, mapeamento, contrato Zod, fixtures, saúde, filtros, lacunas e CSV.
- `ModelViewer.tsx` / `model-loader.ts`: GLTFLoader, OrbitControls, iluminação, raycasting, gerenciamento e descarte de recursos, renderização somente quando a cena/câmera muda, timeout e recuperação.
- `presentation.ts` / `ComponentCallout.tsx`: ciclo de 12 segundos, pausa/limpeza de temporizadores e apresentação dos detalhes/telemetria dentro do elemento em tela cheia.
- `telemetry-client.ts` / `use-telemetry.ts`: adaptador REST, validação e cancelamento, polling a cada 15 s e backoff de 30/60 s após falhas. Essa frequência é da interface, não uma taxa presumida de amostragem do hardware.
- `src/lib/digital-twin-proxy.server.ts`: proxy somente no backend. O frontend consulta `/api/digital-twin/*`; o token nunca é devolvido na configuração nem colocado em variáveis `VITE_*`. Redirecionamentos são recusados para não encaminhar a autorização a outro destino.

A API anterior tem um contrato diferente: reservatório em porcentagem e produção acumulada, sem os quatro registros padronizados, eventos ou comprovação de hardware. Por isso a integração r33 usa um adaptador próprio e preserva a API anterior, em vez de fabricar conversões ou tratar suas fixtures como dados reais.

## ESP32 direto na rede local

O cartão aceita o JSON do [sketch original enviado](../firmware/desol_esp32/desol_esp32.ino), mantendo a pasta `firmware` intacta. O adaptador valida apenas os campos que o sketch publica e acrescenta horário de recebimento pelo servidor. Não inventa versão, identificação, sinal Wi-Fi ou idade da medição. A página de monitoramento do próprio ESP32 continua em `http://<IP-do-ESP32>/`. Consulte o [guia completo de integração](esp32-integration.md).

O cartão de telemetria local lê `/api/dados`, servido pela placa. Para configurar, informe `DESOL_ESP32_BASE_URL=http://<IPv4 privado do ESP32>` em `.env.local` e reinicie o servidor Vite. O computador servidor e a placa precisam estar na mesma rede; o cliente consulta `/api/esp32/telemetry` no servidor do próprio projeto, que faz a ponte com a placa. O servidor aceita apenas HTTP em IPv4 privado e confere formato e tamanho da resposta. A interface atualiza a consulta a cada 2 segundos após sucesso, tenta novamente com espera progressiva após falhas e descarta a resposta anterior após erro ou 10 segundos sem renovação. Receber uma resposta não comprova a idade da amostra do sensor. Não há autenticação nesse firmware local; use somente uma rede confiável.

O cartão local fica visivelmente separado de DEMO e da API r33 porque temperatura, distância, nível percentual, sinais pH/TDS e comando da bomba não podem ser adaptados aos quatro sensores r33 sem conversões ou dados físicos inexistentes. O gêmeo, histórico, mapas e outros painéis continuam recebendo apenas os contratos configurados para eles. O firmware está no [sketch único do ESP32](../firmware/desol_esp32/desol_esp32.ino), com credenciais e configurações no próprio arquivo.

## Configuração real (opcional)

Sem `DESOL_API_BASE_URL`, o modo é DEMO e nenhum serviço externo é consultado. `GET /api/digital-twin/config` expõe somente modo, identificador de dispositivo e intervalo esperado opcional.

Copie `.env.example` para `.env.local` para desenvolvimento. O Vite carrega apenas as quatro configurações privadas abaixo no processo do servidor; elas não entram nos defines do cliente. Variáveis já injetadas no processo têm precedência. Em produção, configure as variáveis/bindings de runtime no serviço de hospedagem, sem versionar valores secretos.

| Variável | Significado |
| --- | --- |
| `DESOL_API_BASE_URL` | Base HTTPS do backend, incluindo o prefixo da API, por exemplo `https://backend.example/api/`. HTTP só é aceito para localhost em desenvolvimento. |
| `DESOL_DEVICE_ID` | Identificador real registrado no backend; obrigatório em modo real. |
| `DESOL_API_TOKEN` | Bearer token opcional, apenas no backend, se o serviço exigir esse método. Não inserir no frontend. |
| `DESOL_SAMPLE_INTERVAL_SECONDS` | Intervalo confirmado de amostragem física, em segundos; omitido enquanto não for conhecido. O resumo pode fornecê-lo também. |

Reinicie o servidor após modificar essas configurações. Não habilite o modo real apenas para remover a faixa DEMO: ele requer o serviço com o contrato abaixo.

## Contrato REST do backend

Com base `https://backend.example/api/` e dispositivo `device-a`, são consultados:

| Operação | URL do serviço |
| --- | --- |
| Resumo | `GET /api/devices/device-a/summary` |
| Últimas amostras | `GET /api/devices/device-a/telemetry/latest` |
| Histórico | `GET /api/devices/device-a/telemetry/history?from=<ISO UTC>&to=<ISO UTC>` |
| Eventos | `GET /api/devices/device-a/events?from=<ISO UTC>&to=<ISO UTC>` |

Latest/history retornam array de registros ou `{ "records": [...] }`; eventos retornam array ou `{ "events": [...] }`. Sem filtro explícito de período, o adaptador consulta as últimas 24 h. CSV é gerado no navegador a partir dos registros disponíveis. O frontend não presume histórico além dos dados recebidos. Se o backend usar paginação, agregação ou um contrato diferente, adapte `telemetry-client.ts` ao contrato confirmado antes de operar.

Cada registro segue o contrato do pacote, com validações adicionais de unidade, métrica, tipo de valor, timestamp, fonte e identificador:

```json
{
  "deviceId": "device-a",
  "sensorId": "solar_irradiance",
  "metric": "irradiance_w_m2",
  "value": 725.4,
  "unit": "W/m²",
  "timestamp": "2026-10-09T13:00:00Z",
  "quality": "good",
  "source": "real"
}
```

Esse exemplo é um contrato ilustrativo, não evidência de uma leitura física. `quality`: `good`, `suspect`, `bad`, `missing`. `value` pode ser `null`; gateway usa boolean. Campos opcionais: `diagnosticCode`, `batteryPct` (0–100), `rssiDbm`.

| sensorId | metric | unit |
| --- | --- | --- |
| `solar_irradiance` | `irradiance_w_m2` | `W/m²` |
| `water_level` | `water_level_mm` | `mm` |
| `production_flow` | `production_flow_l_h` | `L/h` |
| `gateway` | `gateway_online` | `boolean` |

Resumo:

```json
{
  "deviceId": "device-a",
  "hardwareConfirmed": true,
  "communication": "online",
  "lastSeen": "2026-10-09T13:00:00Z",
  "sampleIntervalSeconds": 60
}
```

`hardwareConfirmed` e `communication` precisam ser informações reais do backend. Sessenta segundos é apenas um exemplo; não foi configurado como taxa física padrão. Na ausência de confirmação, o estado permanece desconhecido. Um registro DEMO retornado em modo real, dispositivo incorreto, unidade errada ou JSON inválido invalida a sincronização.

Eventos: `{ "id": "event-id", "timestamp": "ISO UTC", "sensorId": "water_level", "severity": "warning", "message": "Diagnóstico recebido do backend", "source": "real" }`. `sensorId` pode ser omitido/null; severity é `info`, `warning` ou `error`.

O proxy tem timeout de 7 s e o cliente, de 8 s. Ao falhar, os últimos registros reais são preservados, a API é indicada como indisponível e a saúde atual fica desconhecida. Não há fallback silencioso para DEMO: o usuário precisa escolher “Explorar DEMO”. Interação 3D e consulta dos dados disponíveis continuam funcionando.

## Saúde e limites

- DEMO nunca confirma hardware saudável/online; a origem simulada permanece visível.
- `offline`: comunicação explicitamente offline no resumo, ou registro recente/válido do gateway com valor false, após conhecer intervalo e confirmar o hardware.
- `error`: qualidade bad ou diagnóstico de erro recebido.
- `unknown`: falta de dados, valor ausente, qualidade suspeita, configuração/instalação não confirmada, timestamp inválido/futuro ou API indisponível.
- `stale`: amostra real mais antiga que duas vezes o intervalo esperado explicitamente configurado.
- `ok`: amostra real válida e recente, com hardware confirmado e intervalo conhecido. Significa leitura atualizada, não potabilidade ou funcionamento hidráulico completo.

Não há porcentagem de saúde, limiar físico/sanitário presumido ou taxa de amostragem inventada. Os 40 mm da cena, os 18° da tampa e as dimensões da calha são características conceituais do modelo, não alarmes ou medições. A transparência e a calha devem continuar sendo revisadas no navegador ao substituir o GLB.

## Testes e validação

`bun run test` executa o teste anterior de roteamento e testes do mapeamento (inclusive o arquivo GLB real), saúde, cenários DEMO, contratos, lacunas, CSV, GLB 404/inválido, origem inválida, API offline e proxy backend. `bunx tsc --noEmit` valida tipos; as incompatibilidades anteriores com Recharts 3 e a inferência do alerta legado foram corrigidas.

`bun run test:e2e` executa Playwright/Chromium com WebGL de software: cliques projetados nas malhas reais dos quatro sensores, drag/rotação/reset, filtros, conteúdo do CSV, 404 e recuperação, API indisponível, DEMO explícito, responsividade, toque/arraste no celular, teclado (incluindo câmera), redução de movimento e fallback sem WebGL. Instale o navegador com `bunx playwright install chromium` ou informe `CHROMIUM_PATH` para um Chromium do sistema. As opções de software são somente do navegador de testes; a aplicação usa WebGL normal.

## O que depende de hardware/serviço

- Confirmação de sensores instalados, local físico do sensor de nível, calibração e unidades do gateway.
- Protocolo de ingestão de ESP32/LoRa, gateway real, autenticação e backend persistente.
- Endpoints operacionais que cumpram ou adaptem o contrato; política de acesso do serviço de hospedagem.
- Intervalos de amostragem, heartbeats e diagnósticos efetivamente disponíveis.
- Regras de segurança/potabilidade, limites e alarmes aprovados por responsáveis técnicos.
- SSE/WebSocket é uma evolução opcional quando o serviço oferecer um protocolo confirmado. O adaptador atual usa REST; não cria MQTT, tópicos, credenciais ou conexões LoRa fictícias.
- Não foi feita publicação/deploy nem ensaio com dispositivos físicos. O build mantém o destino Cloudflare existente.

### Resultado da validação desta entrega

- Instalação com `bun install --frozen-lockfile`: aprovada.
- Build de produção, checagem de tipos e 32 testes Vitest: aprovados na atualização de tela cheia de 10/10/2026. Os quatro novos testes cobrem o ciclo completo dos 12 componentes, duração, pausa/retomada/desmontagem, aba oculta, componentes ausentes e identificação de dados simulados.
- Na validação inicial, os sete testes Playwright passaram. Após reposicionar o modelo no topo da página inicial, em 10/10/2026, o teste de celular/teclado passou, mas o teste completo de rotação/reset/filtros/CSV excedeu o tempo limite em capturas e interações com WebGL de software, inclusive na repetição isolada. A suíte completa ainda precisa ser revalidada nessa versão; esse resultado não é considerado aprovado. O carregamento do GLB e a presença do visualizador na primeira tela foram verificados no navegador em desktop e celular.
- ESLint: nenhum erro; seis avisos preexistentes de Fast Refresh nos componentes de UI.
- Modelo e transparências revisados em capturas desktop/mobile. Nenhum ensaio com hardware físico, broker ou gateway real foi executado.

- Atualização de tela cheia (10/10/2026): os dois novos testes Playwright passaram, verificando fullscreen nativo, balão e linha, troca após 12 segundos, clique na malha do GLB, aproximação real da câmera, painel maior, pausa/retomada, saída, seleção textual e redução de movimento. O teste de saída por Esc revelou uma falha no Chromium headless; o visualizador passou a tratar Esc explicitamente, e a repetição desse teste passou. O timeout anteriormente documentado da suíte geral não foi revalidado nesta atualização.

- Aproximação automática no ciclo 360° (10/10/2026): o teste de tela cheia foi ampliado para verificar a centralização do primeiro componente e do seguinte após 12 segundos, mantendo o estado de apresentação e a rotação. A comparação visual do zoom manual foi preservada, usando capturas da página após a centralização em vez de repetir capturas do canvas em um polling; essa repetição havia excedido o limite com WebGL de software. Os dois testes de tela cheia, os 32 testes unitários, tipos, lint dos arquivos alterados e build passaram.

- Ajuste de ângulo e enquadramento individual (10/10/2026): cada transição agora avalia 36 direções ao redor da peça, calcula o enquadramento da caixa completa e reduz a sobreposição do balão; mantém um zoom mais aberto do que o close manual. Os testes Vitest agora totalizam 34 e verificam a escolha do ângulo da peça alongada e o enquadramento no celular. O teste de tela cheia verifica o centro da peça após as aproximações automáticas, o close manual e a saída por Esc/botão. A saída pelo botão foi verificada novamente no teste focado de movimento reduzido.

## Refinamento visual local do modelo r33

O projeto Higgsfield solicitado não pôde ser editado nesta sessão: não havia ferramenta Higgsfield disponível e o acesso HTTPS ao domínio retornou bloqueio 403 no proxy de rede. As mudanças abaixo são uma camada de apresentação da aplicação sobre o GLB r33 versionado; o arquivo original e seu SHA-256 permanecem intactos. Nenhuma revisão nova foi gravada no Higgsfield.

### Materiais e iluminação

- Acabamentos PBR distintos para isolamento branco não metálico, alumínio escovado, borracha, células fotovoltaicas, calcita, vidro, reservatório translúcido e água. O material da carcaça havia sido exportado como metal; a camada web corrige essa classificação.
- Cinco texturas procedurais determinísticas de 256 × 256 pixels, geradas localmente e compartilhadas entre materiais: microrrelevo, escovação, células solares, granulado mineral e ondulação discreta. UVs planares são adicionadas apenas às malhas que não as possuíam. Não há dependência de CDN de texturas ou serviço de renderização.
- Vidro e água continuam transparentes. Os anéis geométricos de ondulação do export são ocultados em favor do microrrelevo da superfície.
- Ambiente de reflexão, iluminação principal quente e preenchimento frio, sombras filtradas e piso de apoio. As luzes de estúdio exportadas são desativadas para evitar iluminação duplicada. O destaque de seleção é mais discreto e preserva o acabamento.
- Mapa de sombra estático de 1024 pixels (512 em telas pequenas), pixel ratio limitado a 1,5 e renderização sob demanda. Rotação e interação continuam em tempo real no dispositivo. Texturas, materiais, geometria e mapa de sombras são descartados ao desmontar o visualizador.

### Ajustes de montagem representada

- A geometria local da calha já correspondia à parede +X do relatório, mas a matriz de objeto do GLB a girava para a parede frontal e esticava seu comprimento. A matriz é restaurada, mantendo a malha original de 0,186 × 1,236 m e alinhando-a aos suportes, tampas e dreno existentes.
- Os dois pés do filtro são prolongados até o mesmo plano dos quatro pés da unidade; o topo dos apoios permanece junto ao filtro.
- A espessura visual da junta IP65 é ajustada para preencher as duas folgas entre a caixa e a tampa.
- Uma pequena sela de apoio é acrescentada entre o tubo superior e o piranômetro, onde existia uma fresta. Esse suporte é uma proposta visual, não uma peça confirmada no equipamento físico. O sensor conserva o papel e a interação existentes.
- Os testes verificam a proximidade/interseção das caixas delimitadoras de 12 pares consecutivos de encaixes hidráulicos, com tolerância geométrica de 1 mm. Essa checagem detecta afastamentos grosseiros, mas não demonstra estanqueidade, circulação, cotas de fabricação, dimensionamento ou conectividade elétrica. As ligações reais de ESP32/LoRa, alimentação, pinagem e calibração ainda dependem do projeto do hardware.

### Câmeras

Cada um dos 12 componentes tem uma direção exterior preferencial, combinada com a avaliação de 36 candidatos e sete linhas de visibilidade por candidato. A câmera favorece vistas sem paredes opacas à frente da peça; superfícies transparentes não bloqueiam a seleção do ângulo. Sensores muito pequenos recebem uma distância mínima que mantém algum contexto do encaixe.

Cabos remotos continuam visíveis, mas não deslocam o alvo da câmera da caixa eletrônica ou do conjunto fotovoltaico. O painel de detalhes tem espaço reservado no desktop; no celular, um deslocamento da projeção posiciona o componente abaixo do balão. Redimensionar a tela recalcula o enquadramento ativo. O ciclo de 12 segundos, redução de movimento, seleção manual, telemetria DEMO e relatórios são preservados.

### Verificação desta alteração

- 43 testes Vitest passaram, incluindo nove novos casos sobre o GLB real: calha, apoios, junta, caminho hidráulico, propriedades dos materiais e visibilidade externa dos quatro sensores.
- Capturas em Chromium conferidas para visão geral, cobertura, sensor de nível, eletrônica, filtro e cuba/calha.
- A qualidade final depende da geometria conceitual fornecida e da GPU do navegador. O modelo recebeu refinamento visual; não é um CAD validado nem uma renderização fotográfica calculada pelo Higgsfield.
- TypeScript, lint dos arquivos alterados e build de produção passaram. Permanece o aviso existente sobre chunks de Three.js acima de 500 kB.
- Seis testes Playwright passaram usando `CHROMIUM_PATH=/usr/bin/chromium`: recuperação de GLB 404, API offline, navegação móvel/teclado, apresentação de 12 segundos com clique e zoom, redução de movimento/saída de tela cheia e foco móvel abaixo do balão com reenquadramento ao mudar a orientação. Os demais casos da suíte E2E não foram repetidos nesta alteração.

## Responsividade em smartphones (14/10/2026)

O visualizador em telas pequenas separa cabeçalho, canvas e controles em linhas próprias. A altura acompanha a área visível do navegador (`svh`), e a câmera enquadra os limites do modelo dentro do canvas disponível, recalculando a visão geral ou a peça selecionada após redimensionamento.

Na apresentação expandida em telas compactas, as abas “Modelo 3D” e “Detalhes” separam a cena do texto longo. O modo Modelo mantém apenas a seleção de componente e um resumo da leitura; o modo Detalhes oferece rolagem própria. Na horizontal, o seletor compacto ocupa uma coluna lateral, preservando a altura do canvas. Os controles de toque têm pelo menos 44 × 44 pixels e os seletores usam fonte de 16 pixels.

Em telas compactas, o botão de expansão usa diretamente um modo compatível dentro da página, sem solicitar fullscreen nativo. Um portal com contêiner estável move o visualizador para o corpo do documento e o devolve ao local original ao fechar, preservando o canvas/WebGL e escapando de ancestrais com transformação, contenção ou corte. A altura segue `visualViewport.height`, com fallback para `innerHeight`; as margens de segurança do dispositivo são respeitadas. O botão de fechar, o controle de expansão e Esc restauram foco e rolagem.

A abertura compacta mostra o equipamento inteiro, sem apresentação/zoom automáticos. A aproximação manual mantém mais contexto do sensor. O desktop conserva a apresentação de 12 segundos e fullscreen nativo quando disponível.

A cobertura móvel verifica 320, 390 e 430 pixels de largura com altura de apenas 525 pixels, as duas orientações, troca entre modelo e detalhes, preservação do mesmo canvas, áreas de toque e um ancestral transformado com `contain: paint`. Um caso adicional reduz a altura a 450 pixels e verifica a atualização da área visível. Os testes usam Chromium e não substituem validação em Safari/iPhone físico.

Validação desta alteração: 43 testes Vitest, checagem de tipos, lint dos arquivos TypeScript alterados e build de produção aprovados. Sete testes Playwright focados passaram na versão final: teclado/redução de movimento, arraste por toque, apresentação automática e seleção no desktop, três larguras móveis nas duas orientações e alternativa sem fullscreen nativo. A suíte E2E completa não foi repetida.

## Painel operacional enxuto (14/10/2026)

A página principal apresenta cabeçalho com badge de origem e última leitura, resumo de estado, quatro cards com valor e histórico compacto de até 24 horas e, abaixo, o modelo GLB existente. A seleção é compartilhada entre cards e malhas; a ativação manual abre uma gaveta com o gráfico maior, qualidade, origem, registros e exportação CSV. A apresentação automática em fullscreen atualiza a seleção sem abrir a gaveta operacional.

O antigo painel fixo de sensores foi substituído pela gaveta. Revisão do GLB, contagem de objetos, vínculos, explicações sobre saúde e controles de cenários DEMO ficam em Diagnóstico. Histórico de todos os sensores e exportação continuam disponíveis sob demanda. O menu lateral pode ser recolhido, mantendo os nomes acessíveis dos links.

O backend, o contrato, as fixtures, o polling, a validação, os filtros e o cálculo de saúde permanecem os mesmos. O status geral resume os quatro estados existentes: normalidade exige quatro leituras `ok`; dados atrasados, ausência de confirmação ou API indisponível exigem atenção; erro de leitura ou comunicação offline são destacados. No modo DEMO, normalidade física não é afirmada e as exceções são explicitamente simuladas. As sparklines preservam lacunas e mostram um ponto quando há somente uma amostra, sem inventar tendências.

“Produção de água hoje” aparece como indisponível porque o contrato fornece vazão em L/h, sem volume diário acumulado. Não há integração estimada, conversão de vazão pontual em volume nem reutilização de métricas legadas com unidades diferentes.

Validação do redesenho: 47 testes Vitest, tipos, lint dos arquivos alterados e build de produção aprovados. Os 14 cenários Playwright foram verificados: 12 passaram na execução geral; seleção de malhas/rotação/reset e filtros/CSV passaram nas repetições isoladas após separar a exportação do teste gráfico e aguardar o fechamento das gavetas. A validação móvel inclui 320, 390 e 430 pixels, as duas orientações, toque, teclado, movimento reduzido e ausência de fullscreen nativo. Não houve publicação nem ensaio em iPhone físico.


### Modo expandido compatível

O painel longo simultâneo à cena foi substituído pelas abas compactas após revisar a captura enviada. A cena inicial permanece em visão geral; a leitura detalhada ocupa sua própria área. Foram acrescentados três testes unitários de enquadramento de sensores pequenos em canvases baixos. Tipos, lint e build aprovados; 50 testes Vitest passaram. A cobertura E2E desta revisão inclui o modo compatível e as regressões de toque, teclado, diagnóstico e fullscreen no desktop.

Validação final do modo compatível: 50 testes unitários e nove cenários E2E focados aprovados, incluindo apresentação automática nativa no desktop, seleção por teclado/movimento reduzido, toque, diagnóstico, três larguras compactas nas duas orientações e contêiner transformado com redução de altura a 450 pixels. Tipos, lint, formatação e build aprovados. A suíte E2E completa não foi repetida nesta revisão.

### Legendas proporcionais ao conteúdo

As informações de componentes sem medição dedicada abrem em um cartão com altura automática: no celular, junto à borda inferior; no desktop, no canto inferior direito. O painel fotovoltaico deixa de ocupar a altura inteira da tela. O fundo permanece parcialmente visível e o cabeçalho não repete a introdução genérica do histórico.

Sensores, histórico e diagnóstico usam uma área de conteúdo com rolagem própria. Cabeçalho com botão de fechar e rodapé “Voltar ao painel” permanecem fora dessa rolagem; no celular, o painel fica limitado a 78% da altura da tela. Também é possível sair por Esc ou toque fora. O conteúdo é preservado durante a animação de saída para evitar mudanças bruscas de tamanho, e o foco retorna ao controle de origem.

Validação: tipos, lint, formatação, build e 50 testes unitários aprovados. Seis cenários E2E focados aprovados: legendas em 440 × 956 e 320 × 568, legenda curta no desktop, teclado móvel, diagnóstico e filtros/CSV. Os testes verificam tamanho limitado, botão de retorno de pelo menos 44 pixels, fechamento por botão/X/toque fora/Esc e controles de saída visíveis após rolar um painel longo.
