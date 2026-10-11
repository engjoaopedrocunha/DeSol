import {
  Box3,
  BoxGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Light,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type Material,
} from "three";

/** Local, reversible presentation corrections for the supplied r33 export. */
export function correctModelAssembly(model: Group) {
  const corrections: string[] = [];
  const gutter = model.getObjectByName("BASIN_runoff_gutter_short_wall_full_length");
  if (gutter instanceof Mesh) {
    // This mesh's vertices already describe the +X gutter. Its exported object matrix
    // rotates it onto the front wall and stretches it away from the existing drain.
    gutter.position.set(0, 0, 0);
    gutter.quaternion.identity();
    gutter.scale.set(1, 1, 1);
    gutter.updateMatrix();
    corrections.push("Calha alinhada aos suportes, tampas e dreno da parede +X");
  }
  const gasket = model.getObjectByName("ELEC_IP65_sealing_gasket");
  if (gasket instanceof Mesh) {
    // The exported 10 mm seal left two 4 mm gaps between the case and its lid.
    gasket.scale.x = 3;
    gasket.updateMatrix();
    corrections.push("Junta IP65 encostada na caixa e na tampa existentes");
  }
  model.updateMatrixWorld(true);
  const foot = model.getObjectByName("BASE_rubber_foot_07_052");
  if (foot) {
    const ground = new Box3().setFromObject(foot).min.y;
    for (const name of ["FILTER_support_foot_137", "FILTER_support_foot_168"]) {
      const support = model.getObjectByName(name);
      if (!(support instanceof Mesh)) continue;
      const box = new Box3().setFromObject(support);
      const gap = box.min.y - ground;
      if (gap > 0.001) {
        support.scale.y *= (box.max.y - ground) / (box.max.y - box.min.y);
        support.position.y -= gap / 2;
        support.updateMatrix();
        corrections.push(`${name}: apoio prolongado até o plano dos pés da unidade`);
      }
    }
  }
  // A visible saddle closes the small air gap below the existing pyranometer.
  // This is a proposed mechanical support, not a claim about installed hardware.
  const sensor = model.getObjectByName("SENSOR_solar_irradiance_pyranometer");
  const header = model.getObjectByName("PIPE_upper_perforated_cooling_header");
  if (sensor && header && !model.getObjectByName("SENSOR_solar_irradiance_mount_saddle")) {
    const a = new Box3().setFromObject(sensor);
    const b = new Box3().setFromObject(header);
    const c = a.getCenter(new Vector3());
    const saddle = new Mesh(
      new BoxGeometry(0.07, a.min.y - b.max.y + 0.008, 0.08),
      new MeshPhysicalMaterial({ color: "#707982", metalness: 0.95, roughness: 0.32 }),
    );
    saddle.name = "SENSOR_solar_irradiance_mount_saddle";
    saddle.position.set(c.x, (a.min.y + b.max.y) / 2, c.z - 0.012);
    model.add(saddle);
    corrections.push("Suporte visual do piranômetro conectado ao tubo superior");
  }
  model.updateMatrixWorld(true);
  return corrections;
}

type Surface =
  "powder" | "metal" | "rubber" | "glass" | "water" | "tank" | "solar" | "calcite" | "pcb" | "led";
function surfaceFor(mesh: Mesh, material: Material): Surface {
  const name = `${mesh.name} ${material.name}`;
  if (/visible_medium/.test(name)) return "calcite";
  if (/SENSOR_case_telemetry_online_indicator/.test(name)) return "led";
  if (/PCB/.test(name)) return "pcb";
  if (/PV_CELL|PV_dark_cell_bed/.test(name)) return "solar";
  if (/dome|tempered_glass|sealed_window/.test(name)) return "glass";
  if (/WATER_|reservoir_water/.test(name)) return "water";
  if (/translucent|closed_canister/.test(name)) return "tank";
  if (
    /rubber|gasket|sheath|cable|conduit|antenna|black_lower_plinth|lower_seam|perforation|filter_radial|pressure_sealed_coupler|mineralizer_cap/.test(
      name,
    )
  )
    return "rubber";
  if (
    /white|enclosure|front_lid|secondary_case|housing|closed_cap|TANK_left_opaque_mount/.test(name)
  )
    return "powder";
  return "metal";
}

function texture(kind: "grain" | "brushed" | "solar" | "calcite" | "water") {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 180 + noise(x, y) * 65,
        g = r,
        b = r;
      if (kind === "brushed") r = g = b = 150 + noise(0, y) * 65 + noise(x, y) * 12;
      if (kind === "water")
        r =
          g =
          b =
            128 + 18 * Math.sin((x / size) * Math.PI * 8 + Math.sin((y / size) * Math.PI * 4));
      if (kind === "solar") {
        const busbar = x % 85 < 2;
        const finger = y % 9 === 0;
        r = busbar ? 150 : finger ? 61 : 15 + noise(x, y) * 7;
        g = busbar ? 167 : finger ? 79 : 28 + noise(x, y) * 9;
        b = busbar ? 176 : finger ? 104 : 48 + noise(x, y) * 12;
      }
      if (kind === "calcite") {
        let nearest = 10;
        const cx = Math.floor(x / 16),
          cy = Math.floor(y / 16);
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const px = (cx + i + noise(cx + i, cy + j)) * 16;
            const py = (cy + j + noise(cy + j, cx + i)) * 16;
            nearest = Math.min(nearest, Math.hypot(x - px, y - py));
          }
        r = 235 - nearest * 7;
        g = r - 5;
        b = r - 13;
      }
      const offset = (y * size + x) * 4;
      data.set([r, g, b, 255], offset);
    }
  }
  const map = new DataTexture(data, size, size, RGBAFormat);
  map.name = `desol-${kind}`;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  if (kind === "solar" || kind === "calcite") map.colorSpace = SRGBColorSpace;
  map.repeat.setScalar(kind === "solar" ? 1 : kind === "calcite" ? 3 : kind === "water" ? 2 : 10);
  map.needsUpdate = true;
  return map;
}

/** Add planar UVs only where the GLB export omitted them. Geometry is otherwise preserved. */
function ensureUV(mesh: Mesh) {
  if (mesh.geometry.getAttribute("uv")) return;
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const nx = Math.abs(normals?.getX(i) ?? 0);
    const ny = Math.abs(normals?.getY(i) ?? 1);
    const nz = Math.abs(normals?.getZ(i) ?? 0);
    uv[i * 2] = nx > ny && nx > nz ? positions.getZ(i) : positions.getX(i);
    uv[i * 2 + 1] = ny > nx && ny > nz ? positions.getZ(i) : positions.getY(i);
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
}

export function finishModelSurfaces(model: Group, anisotropy = 4) {
  const maps = {
    grain: texture("grain"),
    brushed: texture("brushed"),
    solar: texture("solar"),
    calcite: texture("calcite"),
    water: texture("water"),
  };
  Object.values(maps).forEach((map) => {
    map.anisotropy = anisotropy;
  });
  const cache = new Map<string, MeshPhysicalMaterial>();
  const originals = new Set<Material>();
  model.traverse((object) => {
    // Blender's exported studio lights are replaced by a single calibrated web rig.
    if (object instanceof Light) object.visible = false;
    if (!(object instanceof Mesh)) return;
    ensureUV(object);
    const replace = (original: Material) => {
      originals.add(original);
      const surface = surfaceFor(object, original);
      const dark = /BASIN_|dark_|black_|gunmetal|support_foot/.test(
        `${object.name} ${original.name}`,
      );
      const key = `${surface}-${dark}`;
      if (cache.has(key)) return cache.get(key)!;
      const m = new MeshPhysicalMaterial({
        name: `desol-${key}`,
        side: DoubleSide,
        roughness: 0.42,
        metalness: 0,
      });
      if (surface === "powder") {
        m.color.set("#e5e7e5");
        m.roughness = 0.58;
        m.bumpMap = maps.grain;
        m.bumpScale = 0.00035;
      } else if (surface === "metal") {
        m.color.set(dark ? "#28323b" : "#aeb8bf");
        m.metalness = 0.92;
        m.roughness = dark ? 0.44 : 0.29;
        m.roughnessMap = maps.brushed;
        m.bumpMap = maps.brushed;
        m.bumpScale = 0.00007;
      } else if (surface === "rubber") {
        m.color.set("#20262c");
        m.roughness = 0.78;
        m.bumpMap = maps.grain;
        m.bumpScale = 0.00015;
      } else if (surface === "glass" || surface === "tank") {
        m.color.set(surface === "glass" ? "#91abb7" : "#e2eeee");
        m.roughness = surface === "glass" ? 0.075 : 0.18;
        m.ior = surface === "glass" ? 1.5 : 1.58;
        m.transmission = 0.2;
        m.thickness = 0.008;
        m.transparent = true;
        m.opacity = surface === "glass" ? 0.6 : 0.38;
        m.depthWrite = false;
        m.clearcoat = 1;
        m.clearcoatRoughness = 0.09;
      } else if (surface === "water") {
        m.color.set("#497c85");
        m.roughness = 0.13;
        m.ior = 1.333;
        m.transparent = true;
        m.opacity = 0.62;
        m.depthWrite = false;
        m.bumpMap = maps.water;
        m.bumpScale = 0.0005;
        m.clearcoat = 0.8;
      } else if (surface === "solar") {
        m.color.set("#ffffff");
        m.map = maps.solar;
        m.metalness = 0.3;
        m.roughness = 0.28;
        m.clearcoat = 1;
        m.clearcoatRoughness = 0.16;
      } else if (surface === "calcite") {
        m.color.set("#ffffff");
        m.map = maps.calcite;
        m.bumpMap = maps.grain;
        m.bumpScale = 0.001;
        m.roughness = 0.86;
      } else if (surface === "pcb") {
        m.color.set("#174d38");
        m.roughness = 0.5;
      } else {
        // A muted indicator is not a fabricated hardware-online signal.
        m.color.set("#46635c");
        m.roughness = 0.3;
      }
      cache.set(key, m);
      return m;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(replace)
      : replace(object.material);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.castShadow = materials.every((m) => !m.transparent);
    object.receiveShadow = object.castShadow;
    object.renderOrder = materials.some((m) => m.transparent) ? 1 : 0;
    if (/reflection_ring/.test(object.name)) object.visible = false;
  });
  originals.forEach((material) => material.dispose());
  // The caller owns mesh materials; these shared procedural maps need one disposal.
  return () => Object.values(maps).forEach((map) => map.dispose());
}
