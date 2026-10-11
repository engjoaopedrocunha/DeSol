import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Box3, PerspectiveCamera, Sphere, Vector3, MathUtils } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

test("GLB real, quatro sensores clicáveis, rotação, reset, filtros e CSV", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("Dados simulados — sem telemetria real", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dt-model-meta")).toContainText("4/4 papéis de sensor encontrados");
  await expect(page.locator(".dt-chart-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Nível de água", exact: true }).click();
  await page.locator(".dt-canvas").scrollIntoViewIfNeeded();
  const box = (await page.locator(".dt-canvas canvas").boundingBox())!;
  for (const sensor of await projectedSensors(box.width, box.height)) {
    await page.mouse.click(box.x + sensor.x, box.y + sensor.y);
    await expect(page.locator(".dt-selected-panel h3")).toHaveText(sensor.label);
  }
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
  expect(errors).toEqual([]);
});

test("GLB 404 oferece recuperação sem perder telemetria e relatórios", async ({ page }) => {
  await page.route("**/models/dessalinizador-solar-r33.glb", (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.goto("/");
  await expect(page.getByText("Visualização 3D indisponível", { exact: true })).toBeVisible();
  await expect(page.getByText(/HTTP 404/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Exportar CSV/ })).toBeEnabled();
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
  await expect(page.getByRole("button", { name: /Exportar CSV/ })).toBeDisabled();
  await page.getByRole("button", { name: "Nível de água", exact: true }).click();
  await expect(page.locator(".dt-selected-panel h3")).toHaveText("Nível de água");
  await page.getByRole("button", { name: "Explorar DEMO" }).click();
  await expect(
    page.getByText("Dados simulados — sem telemetria real", { exact: true }),
  ).toBeVisible();
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
  const sensor = page.getByRole("button", { name: "Nível de água", exact: true });
  await sensor.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dt-selected-panel h3")).toHaveText("Nível de água");
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
  await page.getByRole("button", { name: "Vazão produzida", exact: true }).tap();
  await expect(page.locator(".dt-selected-panel h3")).toHaveText("Vazão de água produzida");
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
  await page.getByRole("button", { name: "Vazão produzida", exact: true }).click();
  await expect(page.locator(".dt-selected-panel h3")).toHaveText("Vazão de água produzida");
  await expect(page.getByRole("button", { name: /Exportar CSV/ })).toBeEnabled();
});

test("cenários DEMO mostram falhas e alertas explicitamente simulados", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Cenário de demonstração", { exact: true }).selectOption("gateway-offline");
  await expect(page.locator(".dt-metric-card").last()).toContainText("Desconectado");
  await expect(page.locator(".dt-events")).toContainText(
    "Simulação: comunicação do gateway interrompida",
  );
  await page.getByLabel("Cenário de demonstração", { exact: true }).selectOption("bad-reading");
  await expect(page.locator(".dt-invalid-reading")).toHaveText("Leitura inválida · simulação");
  await expect(page.locator(".dt-selected-panel")).toContainText("DEMO_INVALID_READING");
  await page.getByLabel("Cenário de demonstração", { exact: true }).selectOption("nominal");
  await expect(page.locator(".dt-invalid-reading")).toHaveCount(0);
  await expect(page.locator(".dt-metric-card").first()).toContainText("725,4");
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

test("tela cheia no celular mantém a peça abaixo do balão e reenquadra ao girar a tela", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("Modelo interativo", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Alternar tela cheia" }).click();
  const panel = page.getByLabel("Detalhes do componente em tela cheia");
  await panel.getByLabel("Selecionar componente em tela cheia").selectOption("water_level");
  await expect(panel.getByRole("heading")).toHaveText("Nível de água");
  const anchor = page.locator(".dt-callout-connector circle");
  await expect
    .poll(async () => {
      const canvas = (await page.locator(".dt-canvas").boundingBox())!;
      const card = (await panel.boundingBox())!;
      return Number(await anchor.getAttribute("cy")) + canvas.y - card.y - card.height;
    })
    .toBeGreaterThan(24);
  await page.screenshot({ path: "test-results/digital-twin-mobile-detail.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(async () => {
      const canvas = (await page.locator(".dt-canvas").boundingBox())!;
      return Math.hypot(
        Number(await anchor.getAttribute("cx")) - canvas.width / 2,
        Number(await anchor.getAttribute("cy")) - canvas.height / 2,
      );
    })
    .toBeLessThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
