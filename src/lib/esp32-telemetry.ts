import { z } from "zod";

const finite = z.number().finite();

// Exact JSON published by the unchanged sketch's GET /api/dados.
// The LCD I2C variant publishes the same contract; LCD state is not exposed.
export const esp32DeviceTelemetrySchema = z
  .object({
    temperatura: finite.min(-55).max(125).nullable(),
    distancia: finite.min(2).max(400).nullable(),
    nivel: finite.min(0).max(100).nullable(),
    ph: z.null(),
    ph_calibrado: z.literal(false),
    adc_ph: z.number().int().min(0).max(4095),
    tensao_ph: finite.min(0).nullable(),
    salinidade: z.null(),
    tds_calibrado: z.literal(false),
    adc_tds: z.number().int().min(0).max(4095),
    tensao_tds: finite.min(0).nullable(),
    bomba: z.boolean(),
  })
  .strict();

// Receipt time belongs to the bridge, not to a hardware measurement.
export const esp32TelemetrySchema = esp32DeviceTelemetrySchema.extend({
  recebido_em: z.string().datetime(),
});

export type Esp32Telemetry = z.infer<typeof esp32TelemetrySchema>;

export const esp32BridgeConfigSchema = z.object({
  configured: z.boolean(),
});

export type Esp32BridgeConfig = z.infer<typeof esp32BridgeConfigSchema>;
