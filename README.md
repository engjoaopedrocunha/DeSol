# Pixel Perfect Copy

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/91f6b0e5-48d8-4b83-af3e-53131d4cc3d8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Gêmeo digital do dessalinizador solar (r33)

A página inicial incorpora o GLB fornecido da revisão 33, com navegação 360°, seleção das peças e dos quatro papéis de sensores, histórico, eventos e relatórios CSV. O estilo DeSol, as outras rotas e o painel anterior foram preservados.

Sem configuração de API, a página inicia em **DEMO: dados simulados — sem telemetria real**. O menu de cenários permite demonstrar gateway offline e leitura inválida. Nada disso confirma hardware instalado ou potabilidade.

Requisitos: Node.js 22.12+ (ou 24) e Bun 1.3.14+. No Fedora, caso o instalador pelo GitHub falhe, instale o Bun pelo npm: `npm install -g bun`.

```sh
bun install --frozen-lockfile
bun run dev -- --port 3000
```

Abra `http://localhost:3000` no mesmo computador que executa o servidor e mantenha o terminal aberto. O lockfile usa o registro público com as versões e hashes de integridade preservados; não depende do cache privado da Lovable.

Verificação:

```sh
bun run build
bun run test
bunx tsc --noEmit
bunx playwright install chromium
bun run test:e2e
```

Para usar o Chromium já instalado no Fedora: `CHROMIUM_PATH=/usr/bin/chromium bun run test:e2e` (ajuste o caminho ao executável disponível).

O cartão ESP32 aceita o JSON do [sketch original](firmware/desol_esp32/desol_esp32.ino), sem alterar a pasta `firmware`. Configure `DESOL_ESP32_BASE_URL=http://<IP-da-placa>` em `.env.local`, reinicie o servidor e abra o painel local. Consulte o [guia de integração e execução](docs/esp32-integration.md). O horário exibido é o de recebimento pelo servidor; o sketch não fornece a idade da medição. O site hospedado precisa de um gateway/backend para alcançar os dados da rede privada.

Para telemetria por backend HTTPS, configure `.env.local` conforme [a documentação completa do gêmeo digital](docs/digital-twin.md). Tokens ficam somente no backend.
