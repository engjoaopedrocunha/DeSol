import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Box3, PerspectiveCamera, Sphere, Vector3, MathUtils } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { correctModelAssembly } from "../src/features/digital-twin/model-finish";

const cameraScreenshot = {
  style: ".dt-viewer-top, .dt-viewer-bottom, .dt-hover-label { visibility: hidden !important; }",
};

async function projectedSensors(width: number, height: number) {
  const data = readFileSync(
    new URL("../public/models/dessalinizador-solar-r33.glb", import.meta.url),
  );
  const model = (
    await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      "",
    )
  ).scene;
  correctModelAssembly(model);
  const bounds = new Box3().setFromObject(model);
  model.position.sub(bounds.getCenter(new Vector3()));
  model.updateMatrixWorld(true);
  const radius = bounds.getBoundingSphere(new Sphere()).radius;
  const camera = new PerspectiveCamera(40, width / height, radius / 100, radius * 100);
  const distance =
    (radius / Math.sin(MathUtils.degToRad(20))) *
    (camera.aspect < 1 ? 1 / camera.aspect : 1) *
    0.85;
  camera.position.set(distance * 0.6, distance * 0.5, distance * 0.75);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return [
    ["SENSOR_solar_irradiance_dome", "Irradiância solar"],
    ["SENSOR_water_level_indicator", "Nível de água"],
    ["SENSOR_product_water_flow_detector", "Vazão de água produzida"],
    ["SENSOR_case_telemetry_online_indicator", "Controlador ESP32 / LoRa"],
  ].map(([name, label]) => {
    const object = model.getObjectByName(name!)!;
    const p = new Box3().setFromObject(object).getCenter(new Vector3()).project(camera);
    return { label: label!, x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
  });
}

test("GLB real, quatro sensores clicáveis, rotação e reset", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "DEMO: informações sobre os dados simulados" }),
  ).toBeVisible();
  await expect(page.locator(".dt-model-meta")).toHaveCount(0);
  await expect(page.locator(".dt-chart-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Diagnóstico", exact: true }).click();
  await expect(page.locator(".dt-model-meta")).toContainText("4/4 papéis de sensor encontrados");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Detalhes de Nível de água", exact: true }).click();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".dt-canvas").scrollIntoViewIfNeeded();
  let box = (await page.locator(".dt-canvas canvas").boundingBox())!;
  for (const sensor of await projectedSensors(box.width, box.height)) {
    await page.locator(".dt-canvas").scrollIntoViewIfNeeded();
    box = (await page.locator(".dt-canvas canvas").boundingBox())!;
    await page.mouse.click(box.x + sensor.x, box.y + sensor.y);
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: sensor.label, level: 2, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.locator(".dt-canvas").scrollIntoViewIfNeeded();
  box = (await page.locator(".dt-canvas canvas").boundingBox())!;
  await page.mouse.move(5, 5);
  const before = await page
    .locator(".dt-canvas")
    .screenshot({ ...cameraScreenshot, path: "test-results/camera-initial.png" });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.mouse.move(5, 5);
  const after = await page.locator(".dt-canvas").screenshot(cameraScreenshot);
  expect(before.equals(after)).toBe(false);
  await page.getByRole("button", { name: "Restaurar câmera" }).click();
  expect(
    before.equals(
      await page
        .locator(".dt-canvas")
        .screenshot({ ...cameraScreenshot, path: "test-results/camera-reset.png" }),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Aproximar câmera" }).click();
  expect(before.equals(await page.locator(".dt-canvas").screenshot(cameraScreenshot))).toBe(false);
  await page.getByRole("button", { name: "Restaurar câmera" }).click();
  await page.getByRole("button", { name: "Rotação automática", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rotação automática", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Rotação automática", exact: true }).click();
  await page.getByRole("button", { name: "Restaurar câmera" }).click();
  expect(errors).toEqual([]);
});

test("histórico sob demanda filtra leituras e exporta CSV sem depender do 3D", async ({ page }) => {
  await page.route("**/models/dessalinizador-solar-r33.glb", (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "DEMO: informações sobre os dados simulados" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Histórico e exportação", exact: true }).click();
  await expect(page.locator(".dt-chart-card")).toHaveCount(4);
  await page.getByLabel("Filtrar por sensor", { exact: true }).selectOption("solar_irradiance");
  await expect(page.locator(".dt-chart-card")).toHaveCount(1);
  await page.getByLabel("Início do período em UTC").fill("2026-10-09T12:30");
  await page.getByLabel("Fim do período em UTC").fill("2026-10-09T13:00");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar CSV/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("desol-demo-solar_irradiance.csv");
  const text = readFileSync((await download.path())!, "utf8");
  expect(text.split("\r\n")).toHaveLength(4);
  expect(text).toContain('"demo"');
});

test("GLB 404 oferece recuperação sem perder telemetria e relatórios", async ({ page }) => {
  await page.route("**/models/dessalinizador-solar-r33.glb", (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.goto("/");
  await expect(page.getByText("Visualização 3D indisponível", { exact: true })).toBeVisible();
  await expect(page.getByText(/HTTP 404/)).toBeVisible();
  await page.getByRole("button", { name: "Histórico e exportação", exact: true }).click();
  await expect(page.getByRole("button", { name: /Exportar CSV/ })).toBeEnabled();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.unroute("**/models/dessalinizador-solar-r33.glb");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
});

test("API offline não vira DEMO silenciosamente e mantém modelo clicável", async ({ page }) => {
  await page.route("**/api/digital-twin/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      status: route.request().url().endsWith("/config") ? 200 : 503,
      body: route.request().url().endsWith("/config")
        ? JSON.stringify({ mode: "real", deviceId: "test-device", sampleIntervalSeconds: 60 })
        : JSON.stringify({ error: "Offline" }),
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("API indisponível");
  await expect(page.locator(".dt-metric-card .dt-status-unknown")).toHaveCount(4);
  await page.getByRole("button", { name: "Detalhes de Nível de água", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Nível de água", level: 2, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Exportar CSV/ })).toBeDisabled();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Explorar DEMO" }).click();
  await expect(
    page.getByRole("button", { name: "DEMO: informações sobre os dados simulados" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Histórico e exportação", exact: true }).click();
  await expect(page.getByRole("button", { name: /Exportar CSV/ })).toBeEnabled();
});

test("mobile, teclado e redução de movimento", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const sensor = page.getByRole("button", { name: "Detalhes de Nível de água", exact: true });
  await sensor.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Nível de água", level: 2, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sensor).toBeFocused();
  await page.locator(".dt-canvas").focus();
  const beforeKey = await page.locator(".dt-canvas").screenshot(cameraScreenshot);
  await page.keyboard.press("ArrowLeft");
  const afterKey = await page.locator(".dt-canvas").screenshot(cameraScreenshot);
  expect(beforeKey.equals(afterKey)).toBe(false);
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Rotação automática", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rotação automática", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: "test-results/digital-twin-mobile.png", fullPage: true });
});

test("toque no celular permite arrastar a câmera e selecionar sensores", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
  const before = await page.locator(".dt-canvas").screenshot(cameraScreenshot);
  const box = (await page.locator(".dt-canvas").boundingBox())!;
  const session = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + i * 15, y }],
    });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(before.equals(await page.locator(".dt-canvas").screenshot(cameraScreenshot))).toBe(false);
  await page.getByRole("button", { name: "Detalhes de Vazão produzida", exact: true }).tap();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Vazão de água produzida", level: 2, exact: true }),
  ).toBeVisible();
  await context.close();
});

test("WebGL indisponível mantém alternativa textual", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.getByText(/WebGL não está disponível/)).toBeVisible();
  await page.getByRole("button", { name: "Detalhes de Vazão produzida", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Vazão de água produzida", level: 2, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Exportar CSV/ })).toBeEnabled();
});

test("resumo enxuto, diagnóstico e exceções explicitamente simuladas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Modo de demonstração", { exact: true })).toBeVisible();
  await expect(page.locator(".dt-metric-card")).toHaveCount(4);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".dt-inspector, .dt-mode-banner, .dt-model-meta")).toHaveCount(0);
  await expect(page.getByText("Acumulado diário não disponível")).toBeVisible();
  const main = page.locator("main");
  const expandedWidth = (await main.boundingBox())!.width;
  await page.getByRole("button", { name: "Recolher menu" }).click();
  expect((await main.boundingBox())!.width).toBeGreaterThan(expandedWidth);
  await expect(
    page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: "Painel" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expandir menu" }).click();
  const scenario = async (value: string) => {
    await page.getByRole("button", { name: "Diagnóstico", exact: true }).click();
    await page.getByLabel("Cenário de demonstração", { exact: true }).selectOption(value);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
  };
  await scenario("gateway-offline");
  await expect(page.getByText("Atenção · simulação", { exact: true })).toBeVisible();
  await expect(page.locator(".dt-metric-card").last()).toContainText("Desconectado");
  await scenario("bad-reading");
  await expect(page.getByText("Falha simulada", { exact: true })).toBeVisible();
  await expect(page.locator(".dt-metric-card").first()).toContainText("Inválida · simulação");
  await page.getByRole("button", { name: "Detalhes de Irradiância", exact: true }).click();
  await expect(page.locator(".dt-selected-panel")).toContainText("DEMO_INVALID_READING");
  await expect(page.locator(".dt-events")).toContainText("Simulação: leitura inválida");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await scenario("nominal");
  await expect(page.locator(".dt-metric-card").first()).toContainText("725,4");
  await expect(page.getByText("Modo de demonstração", { exact: true })).toBeVisible();
});

test("tela cheia apresenta componentes por 12 s e clique foca a peça com telemetria", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Alternar tela cheia" }).click();
  const panel = page.getByLabel("Detalhes do componente em tela cheia");
  await expect(panel).toBeVisible();
  expect(
    await page.evaluate(() => document.fullscreenElement?.classList.contains("dt-viewer")),
  ).toBe(true);
  await expect(panel.getByText("Apresentação 360°", { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading")).toHaveText("Irradiância solar");
  const expectComponentCentered = async (presentation = true) => {
    const viewport = (await page.locator(".dt-canvas canvas").boundingBox())!;
    await expect
      .poll(async () => {
        const dot = page.locator(".dt-callout-connector circle");
        return Math.hypot(
          Number(await dot.getAttribute("cx")) - viewport.width / 2,
          Number(await dot.getAttribute("cy")) - viewport.height / 2,
        );
      })
      .toBeLessThan(3);
    await expect(
      page.getByRole("button", { name: "Rotação automática", exact: true }),
    ).toHaveAttribute("aria-pressed", String(presentation));
    if (presentation) await expect(panel).not.toHaveClass(/dt-callout-focused/);
    else await expect(panel).toHaveClass(/dt-callout-focused/);
  };
  await expectComponentCentered();
  await expect(panel.locator("select option")).toHaveCount(12);
  await expect(panel.getByText("DEMO · Dados simulados", { exact: true })).toBeVisible();
  await expect(page.locator(".dt-callout-connector polyline")).toHaveAttribute("points", /\d/);
  await expect(panel.getByRole("heading")).toHaveText("Nível de água", { timeout: 20_000 });
  await expectComponentCentered();
  await expect(panel.getByText("Apresentação 360°", { exact: true })).toBeVisible();
  await expect(panel.getByText("Última amostra", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restaurar câmera", exact: true }).click();
  const canvas = page.locator(".dt-canvas canvas");
  const box = (await canvas.boundingBox())!;
  const sensor = (await projectedSensors(box.width, box.height))[0]!;
  const before = await page.screenshot({
    style:
      ".dt-component-callout, .dt-callout-connector, .dt-viewer-top, .dt-viewer-bottom { visibility: hidden !important; }",
  });
  await page.mouse.click(box.x + sensor.x, box.y + sensor.y);
  await expect(panel).toHaveClass(/dt-callout-focused/);
  await expect(panel.getByRole("heading")).toHaveText("Irradiância solar");
  await expect(panel.getByText("Componente em foco", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rotação automática", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expectComponentCentered(false);
  const after = await page.screenshot({
    style:
      ".dt-component-callout, .dt-callout-connector, .dt-viewer-top, .dt-viewer-bottom { visibility: hidden !important; }",
  });
  expect(before.equals(after)).toBe(false);
  await page.screenshot({ path: "test-results/digital-twin-fullscreen-focus.png" });
  await panel.getByRole("button", { name: "Retomar apresentação 360°" }).click();
  await expect(panel.getByText("Apresentação 360°", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alternar tela cheia" }).click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(
    page.getByRole("button", { name: "Rotação automática", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("tela cheia respeita redução de movimento e seleção por teclado", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alternar tela cheia" }).click();
  const panel = page.getByLabel("Detalhes do componente em tela cheia");
  await expect(panel).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rotação automática", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await panel.getByLabel("Selecionar componente em tela cheia").selectOption("solar_panel");
  await expect(panel.getByRole("heading")).toHaveText("Painel fotovoltaico");
  await expect(panel).toHaveClass(/dt-callout-focused/);
  await expect(
    panel.getByText("Este componente não possui medição dedicada configurada."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  const fullscreenButton = page.getByRole("button", { name: "Alternar tela cheia" });
  await fullscreenButton.click();
  await expect(panel).toBeVisible();
  await fullscreenButton.click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

for (const width of [320, 390, 430]) {
  test(`modo compatível ${width}px preserva o modelo em telas baixas e separa os detalhes`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 525 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
    const originalCanvas = await page.locator(".dt-canvas canvas").elementHandle();
    const toggle = page.getByRole("button", { name: "Alternar tela cheia" });
    await toggle.click();
    const panel = page.getByLabel("Detalhes do componente em tela cheia");
    const canvas = page.locator(".dt-canvas");
    const tabs = page.getByRole("group", { name: "Conteúdo da visualização expandida" });
    await expect(tabs.getByRole("button", { name: "Modelo 3D" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(panel.getByRole("heading")).toBeHidden();
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(
      page.getByRole("button", { name: "Rotação automática", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      await originalCanvas!.evaluate(
        (element) => element === document.querySelector(".dt-canvas canvas"),
      ),
    ).toBe(true);
    const assertModelSpace = async (landscape = false) => {
      await expect
        .poll(async () => {
          const scene = (await canvas.boundingBox())!;
          const card = (await panel.boundingBox())!;
          const surface = (await page.locator(".dt-viewer-fullscreen").boundingBox())!;
          return (
            surface.x >= -1 &&
            surface.y >= -1 &&
            surface.width <= (landscape ? 844 : width) + 1 &&
            scene.height >= (landscape ? 160 : 210) &&
            (landscape ? card.x >= scene.x + scene.width - 1 : card.y >= scene.y + scene.height - 1)
          );
        })
        .toBe(true);
      const controls = await page
        .locator(".dt-camera-controls button:visible")
        .evaluateAll((buttons) =>
          buttons.every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44;
          }),
        );
      expect(controls).toBe(true);
    };
    await assertModelSpace();
    await page.screenshot({ path: `test-results/compatible-model-${width}.png` });
    await panel.getByLabel("Selecionar componente em tela cheia").selectOption("solar_irradiance");
    await expect(panel.locator(".dt-mobile-component-summary")).toContainText("725,4");
    await tabs.getByRole("button", { name: "Detalhes", exact: true }).click();
    await expect(canvas).toBeHidden();
    await expect(panel.getByRole("heading")).toHaveText("Irradiância solar");
    await expect(panel.getByText("Última amostra", { exact: true })).toBeVisible();
    await panel.getByLabel("Selecionar componente em tela cheia").selectOption("water_level");
    await expect(panel.getByRole("heading")).toHaveText("Nível de água");
    await page.screenshot({ path: `test-results/compatible-details-${width}.png` });
    await tabs.getByRole("button", { name: "Modelo 3D" }).click();
    await expect(canvas).toBeVisible();
    await assertModelSpace();
    expect(
      await originalCanvas!.evaluate(
        (element) => element === document.querySelector(".dt-canvas canvas"),
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 844, height: width });
    await assertModelSpace(true);
    await page.screenshot({ path: `test-results/compatible-landscape-${width}.png` });
    await page.getByRole("button", { name: "Fechar visualização expandida" }).click();
    await expect(panel).toHaveCount(0);
    await expect(toggle).toBeFocused();
    expect(
      await originalCanvas!.evaluate(
        (element) => element === document.querySelector(".dt-canvas canvas"),
      ),
    ).toBe(true);
  });
}

test("modo compatível escapa de contêiner transformado e fecha sem fullscreen nativo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 525 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => {
      document.documentElement.dataset["nativeFullscreenCalled"] = "true";
      return Promise.reject(new Error("Fullscreen unavailable"));
    };
  });
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
  await page.locator("main").evaluate((element) => {
    element.style.transform = "translateZ(0)";
    element.style.overflow = "hidden";
    element.style.contain = "paint";
  });
  const toggle = page.getByRole("button", { name: "Alternar tela cheia" });
  const panel = page.getByLabel("Detalhes do componente em tela cheia");
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(
    await page.evaluate(() => document.documentElement.dataset["nativeFullscreenCalled"]),
  ).toBeUndefined();
  expect(
    await page
      .locator(".dt-viewer-mount")
      .evaluate((element) => element.parentElement === document.body),
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await expect(page.locator(".dt-viewer-fullscreen")).toHaveJSProperty("clientHeight", 525);
  await page.screenshot({ path: "test-results/compatible-transformed-container.png" });
  await page.setViewportSize({ width: 390, height: 450 });
  await expect(page.locator(".dt-viewer-fullscreen")).toHaveJSProperty("clientHeight", 450);
  await expect
    .poll(async () => (await page.locator(".dt-canvas").boundingBox())!.height)
    .toBeGreaterThanOrEqual(200);
  await toggle.click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await toggle.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

for (const viewport of [
  { width: 440, height: 956 },
  { width: 320, height: 568 },
]) {
  test(`legenda curta ${viewport.width}px usa cartão compacto com saída ao alcance`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible();
    const picker = page.getByLabel("Explorar componentes", { exact: true });
    await picker.focus();
    await picker.selectOption("solar_panel");
    const panel = page.getByRole("dialog", { name: "Painel fotovoltaico", exact: true });
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const box = (await panel.boundingBox())!;
        return (
          box.height < viewport.height * 0.6 &&
          box.y >= viewport.height * 0.4 &&
          box.y + box.height <= viewport.height
        );
      })
      .toBe(true);
    await expect(
      panel.getByText("Este componente não possui medição dedicada configurada."),
    ).toBeVisible();
    const close = panel.getByRole("button", { name: "Fechar", exact: true });
    const back = panel.getByRole("button", { name: "Voltar ao painel", exact: true });
    await expect(close).toBeInViewport();
    await expect(back).toBeInViewport();
    const backBox = (await back.boundingBox())!;
    expect(backBox.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/compact-legend-${viewport.width}.png` });
    await back.click();
    await expect(panel).toHaveCount(0);
    await expect(picker).toBeFocused();
    await picker.selectOption("roof");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await picker.selectOption("solar_panel");
    await expect(panel).toBeVisible();
    await page.locator(".dt-drawer-overlay").click({ position: { x: viewport.width / 2, y: 20 } });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Detalhes de Nível de água", exact: true }).click();
    const sensorPanel = page.getByRole("dialog", { name: "Nível de água", exact: true });
    await expect
      .poll(async () => (await sensorPanel.boundingBox())!.height)
      .toBeLessThan(viewport.height * 0.8);
    await sensorPanel.locator(".dt-drawer-body").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(sensorPanel.getByRole("button", { name: "Fechar", exact: true })).toBeInViewport();
    await expect(
      sensorPanel.getByRole("button", { name: "Voltar ao painel", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: `test-results/bounded-sensor-${viewport.width}.png` });
    await page.keyboard.press("Escape");
    await expect(sensorPanel).toHaveCount(0);
  });
}

test("legenda curta no desktop também ocupa apenas a altura do conteúdo", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "DEMO: informações sobre os dados simulados" }),
  ).toBeVisible();
  await page.getByLabel("Explorar componentes", { exact: true }).selectOption("solar_panel");
  const panel = page.getByRole("dialog", { name: "Painel fotovoltaico", exact: true });
  await expect.poll(async () => (await panel.boundingBox())!.height).toBeLessThan(400);
  await expect(panel.getByRole("button", { name: "Voltar ao painel", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
