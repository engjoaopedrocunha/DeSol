import { Box3, Mesh, Raycaster, Vector3, type Group } from "three";
import { componentFromObject, type ComponentId } from "./model";

/** Preferred exterior sides in the GLB's Y-up world coordinates. */
export const componentDirections: Record<ComponentId, Vector3> = {
  solar_irradiance: new Vector3(-0.2, 0.85, 0.6).normalize(),
  water_level: new Vector3(-1, 0.35, 0.45).normalize(),
  production_flow: new Vector3(0.6, 0.4, 1).normalize(),
  gateway: new Vector3(1, 0.3, 0.1).normalize(),
  roof: new Vector3(0.3, 1, 0.7).normalize(),
  basin_and_gutter: new Vector3(-0.2, 1, 0.3).normalize(),
  solar_panel: new Vector3(0.2, 0.9, 0.8).normalize(),
  external_tank: new Vector3(-1, 0.4, 0.5).normalize(),
  cooling: new Vector3(-0.8, 0.6, -0.9).normalize(),
  electronics: new Vector3(1, 0.35, 0.1).normalize(),
  collection_and_filter: new Vector3(0.5, 0.5, 1).normalize(),
  body: new Vector3(0.6, 0.5, 1).normalize(),
};

export function componentFocusBounds(model: Group) {
  const bounds = new Map<ComponentId, Box3>();
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!(object instanceof Mesh) || !object.visible) return;
    const id = componentFromObject(object);
    if (!id) return;
    // Feeder cables remain visible, but must not move the focal point to a remote subsystem.
    if (id === "electronics" && !/^(ELEC_IP65_|ELEC_ESP32_|COMMS_)/.test(object.name)) return;
    if (id === "solar_panel" && object.name === "PV_power_cable_to_IP65") return;
    const box = bounds.get(id) ?? new Box3();
    box.union(new Box3().setFromObject(object));
    bounds.set(id, box);
  });
  return bounds;
}

/** Seven sightlines distinguish an exterior view from a camera buried behind a wall. */
export function componentVisibility(model: Group, id: ComponentId, bounds: Box3) {
  const obstacles: Mesh[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh) || !object.visible) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => !material.transparent && material.opacity > 0.9))
      obstacles.push(object);
  });
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const samples = [center];
  for (const axis of ["x", "y", "z"] as const)
    for (const sign of [-1, 1]) {
      const point = center.clone();
      point[axis] += size[axis] * 0.35 * sign;
      samples.push(point);
    }
  const ray = new Raycaster();
  return (position: Vector3) => {
    let visible = 0;
    for (const point of samples) {
      const delta = point.clone().sub(position);
      ray.set(position, delta.clone().normalize());
      ray.far = Math.max(0, delta.length() - 0.002);
      const first = ray.intersectObjects(obstacles, false)[0];
      if (!first || componentFromObject(first.object) === id) visible++;
    }
    return visible / samples.length;
  };
}
