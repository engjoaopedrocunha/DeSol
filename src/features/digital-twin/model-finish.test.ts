import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { Box3, DataTexture, Mesh, MeshPhysicalMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { correctModelAssembly, finishModelSurfaces } from "./model-finish";
import { componentDirections, componentFocusBounds, componentVisibility } from "./component-view";
import { bestComponentFrame } from "./component-framing";
import { componentFromObject, sensorIds } from "./model";

async function loadModel() {
  const bytes = readFileSync("public/models/dessalinizador-solar-r33.glb");
  return (await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, "")).scene;
}

describe("acabamento e montagem do GLB r33 real", () => {
  it("mantém contato entre os encaixes do caminho hidráulico representado", async () => {
    const model = await loadModel();
    correctModelAssembly(model);
    const connections = [
      ["BASIN_gutter_collection_drain_fitting", "BASIN_gutter_freshwater_drain_to_existing_outlet"],
      ["BASIN_gutter_freshwater_drain_to_existing_outlet", "BASIN_gutter_outlet_union_inside_wall"],
      ["BASIN_gutter_outlet_union_inside_wall", "OUTLET_internal_collection_flange"],
      ["OUTLET_internal_collection_flange", "OUTLET_stainless_outgoing_water_line"],
      ["OUTLET_stainless_outgoing_water_line", "SENSOR_product_water_flow_detector"],
      ["OUTLET_stainless_outgoing_water_line", "FILTER_mineralizer_cap_A"],
      ["FILTER_mineralizer_cap_A", "FILTER_calcite_mineralizer_closed_canister"],
      ["FILTER_calcite_mineralizer_closed_canister", "FILTER_mineralizer_cap_B"],
      ["FILTER_mineralizer_cap_B", "FILTER_purified_output_port"],
      ["TANK_upper_bulkhead_gland", "PIPE_cooling_supply_continuous_sealed"],
      ["PIPE_cooling_supply_continuous_sealed", "PIPE_header_hose_union"],
      ["PIPE_header_hose_union", "PIPE_upper_perforated_cooling_header"],
    ];
    for (const [a, b] of connections) {
      const first = new Box3().setFromObject(model.getObjectByName(a!)!);
      const second = new Box3().setFromObject(model.getObjectByName(b!)!);
      // Bounding-volume sanity check at 1 mm tolerance, not hydraulic certification.
      expect(first.expandByScalar(0.001).intersectsBox(second), `${a} → ${b}`).toBe(true);
    }
  });

  it("fecha a junta IP65 e concentra a câmera na eletrônica, sem o cabo remoto", async () => {
    const model = await loadModel();
    correctModelAssembly(model);
    const gasket = new Box3().setFromObject(model.getObjectByName("ELEC_IP65_sealing_gasket")!);
    for (const name of ["ELEC_IP65_front_lid", "ELEC_IP65_sealed_control_enclosure"])
      expect(gasket.intersectsBox(new Box3().setFromObject(model.getObjectByName(name)!))).toBe(
        true,
      );
    const bounds = componentFocusBounds(model);
    expect(bounds.size).toBe(12);
    expect(bounds.get("electronics")!.min.x).toBeGreaterThan(0.8);
  });
  it("alinha a calha na parede +X, encontrando as tampas, suportes e dreno existentes", async () => {
    const model = await loadModel();
    correctModelAssembly(model);
    const box = (name: string) => new Box3().setFromObject(model.getObjectByName(name)!);
    const gutter = box("BASIN_runoff_gutter_short_wall_full_length");
    const size = gutter.getSize(new Vector3());
    expect(size.x).toBeCloseTo(0.186, 4);
    expect(size.z).toBeCloseTo(1.236, 4);
    expect(gutter.min.x).toBeCloseTo(0.644, 4);
    for (const name of [
      "BASIN_runoff_gutter_endcap_front",
      "BASIN_runoff_gutter_endcap_rear",
      "BASIN_gutter_collection_drain_fitting",
      "BASIN_runoff_integral_wall_bracket_00",
      "BASIN_runoff_integral_wall_bracket_04",
    ])
      expect(gutter.intersectsBox(box(name)), name).toBe(true);
  });

  it("apoia o filtro no chão e o piranômetro no tubo, sem duplicar a montagem", async () => {
    const model = await loadModel();
    correctModelAssembly(model);
    correctModelAssembly(model);
    const box = (name: string) => new Box3().setFromObject(model.getObjectByName(name)!);
    const ground = box("BASE_rubber_foot_07_052").min.y;
    for (const name of ["FILTER_support_foot_137", "FILTER_support_foot_168"])
      expect(box(name).min.y).toBeCloseTo(ground, 4);
    const saddle = box("SENSOR_solar_irradiance_mount_saddle");
    expect(saddle.intersectsBox(box("SENSOR_solar_irradiance_pyranometer"))).toBe(true);
    expect(saddle.intersectsBox(box("PIPE_upper_perforated_cooling_header"))).toBe(true);
    let mounts = 0;
    model.traverse((o) => {
      if (o.name === "SENSOR_solar_irradiance_mount_saddle") mounts++;
    });
    expect(mounts).toBe(1);
  });

  it("diferencia isolamento não metálico, vidro, água e células solares texturizadas", async () => {
    const model = await loadModel();
    correctModelAssembly(model);
    const dispose = finishModelSurfaces(model);
    const material = (name: string) =>
      (model.getObjectByName(name) as Mesh).material as MeshPhysicalMaterial;
    expect(material("BODY_sealed_white_thermal_enclosure").metalness).toBe(0);
    expect(material("ROOF_closed_tinted_tempered_glass").transparent).toBe(true);
    expect(material("ROOF_closed_tinted_tempered_glass").ior).toBe(1.5);
    expect(material("WATER_internal_saline_shallow_volume_40mm").transparent).toBe(true);
    expect((material("PV_CELL_00_00").map as DataTexture).image.width).toBe(256);
    expect(material("BODY_sealed_white_thermal_enclosure").bumpMap).not.toBeNull();
    expect(model.getObjectByName("LGT_key_daylight")?.visible).toBe(false);
    dispose();
  });

  it.each(sensorIds)("encontra vista externa desobstruída do sensor %s", async (id) => {
    const model = await loadModel();
    correctModelAssembly(model);
    const dispose = finishModelSurfaces(model);
    const bounds = new Box3();
    model.traverse((o) => {
      if (o instanceof Mesh && componentFromObject(o) === id)
        bounds.union(new Box3().setFromObject(o));
    });
    const visibility = componentVisibility(model, id, bounds);
    const frame = bestComponentFrame(
      bounds,
      1.6,
      { width: 1440, height: 900 },
      { left: 1076, top: 72, right: 1416, bottom: 680 },
      { preferredDirection: componentDirections[id], minDistance: 0.45, visibility },
    );
    const position = bounds
      .getCenter(new Vector3())
      .addScaledVector(frame.direction, frame.distance);
    expect(visibility(position)).toBeGreaterThanOrEqual(0.7);
    if (id === "water_level") expect(frame.direction.x).toBeLessThan(0);
    if (id === "gateway") expect(frame.direction.x).toBeGreaterThan(0);
    dispose();
  });
});
