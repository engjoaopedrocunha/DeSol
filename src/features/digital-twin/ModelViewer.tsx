import { useEffect, useRef, useState } from "react";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  RotateCcw,
  Rotate3D,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  componentFromObject,
  inspectSceneNames,
  isSensor,
  parts,
  sensors,
  type ComponentId,
} from "./model";
import { loadModelBytes } from "./model-loader";
import { bestComponentFrame } from "./component-framing";
import { correctModelAssembly, finishModelSurfaces } from "./model-finish";
import { componentDirections, componentFocusBounds, componentVisibility } from "./component-view";
import ComponentCallout, { type ViewerTelemetry } from "./ComponentCallout";
import { nextPresentedComponent, presentationOrder, useComponentTour } from "./presentation";

export type SceneReport = ReturnType<typeof inspectSceneNames>;
type Controls = {
  reset: () => void;
  rotate: (enabled: boolean) => void;
  highlight: (id: ComponentId | null) => void;
  zoom: (factor: number) => void;
  move: (azimuth: number, polar: number) => void;
  focus: (id: ComponentId, presentation?: boolean) => void;
  chooseSide: (id: ComponentId) => void;
};
type Props = {
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
  onInspect: (report: SceneReport | null) => void;
  telemetry: ViewerTelemetry;
};
export default function ModelViewer({ selected, onSelect, onInspect, telemetry }: Props) {
  const viewer = useRef<HTMLElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  const connector = useRef<SVGSVGElement>(null);
  const leader = useRef<SVGPolylineElement>(null);
  const anchor = useRef<SVGCircleElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const [available, setAvailable] = useState<ComponentId[]>([]);
  const [fullscreenError, setFullscreenError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const actions = useRef<Controls | undefined>(undefined);
  const callbacks = useRef({ selected, onSelect, onInspect, fullscreen });
  callbacks.current = { selected, onSelect, onInspect, fullscreen };
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [hovered, setHovered] = useState<ComponentId | null>(null);
  const [reference, setReference] = useState<"exterior" | "basin">("exterior");

  const touring = fullscreen && rotating && status === "ready";
  const remaining = useComponentTour({ enabled: touring, selected, available, onSelect });
  const nextComponent = () => {
    const next = nextPresentedComponent(selected, available);
    if (next) onSelect(next);
  };
  const examine = (id: ComponentId) => {
    onSelect(id);
    actions.current?.focus(id);
  };
  useEffect(() => {
    actions.current?.highlight(selected);
    if (!fullscreen) actions.current?.chooseSide(selected);
  }, [selected, fullscreen]);
  useEffect(() => {
    if (touring) actions.current?.focus(selected, true);
  }, [selected, touring]);
  useEffect(() => {
    const changed = () => {
      const entered = document.fullscreenElement === viewer.current;
      setFullscreen(entered);
      setFocused(false);
      if (entered) actions.current?.rotate(true);
      else actions.current?.reset();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.fullscreenElement === viewer.current) {
        void document
          .exitFullscreen()
          .catch(() => setFullscreenError("Use o botão de tela cheia para sair da apresentação."));
      }
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const controller = new AbortController();
    setStatus("loading");
    setRotating(false);
    setHovered(null);
    setFocused(false);
    setAvailable([]);
    callbacks.current.onInspect(null);
    const initialize = async () => {
      const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }, bytes] =
        await Promise.all([
          import("three"),
          import("three/addons/loaders/GLTFLoader.js"),
          import("three/addons/controls/OrbitControls.js"),
          import("three/addons/environments/RoomEnvironment.js"),
          loadModelBytes("/models/dessalinizador-solar-r33.glb", controller.signal),
        ]);
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
      } catch {
        throw new Error(
          "WebGL não está disponível neste navegador. Consulte a referência e os sensores pelo menu.",
        );
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false;
      container.appendChild(renderer.domElement);
      renderer.domElement.setAttribute(
        "aria-label",
        "Modelo 3D do dessalinizador. Use o menu de sensores e os controles de câmera para navegação por teclado.",
      );
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#141b24");
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const environment = pmrem.fromScene(room, 0.04);
      room.dispose();
      pmrem.dispose();
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.65;
      scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x293645, 0.4));
      const keyLight = new THREE.DirectionalLight(0xfff1df, 2);
      keyLight.position.set(-3, 6, 4);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.setScalar(window.innerWidth < 600 ? 512 : 1024);
      keyLight.shadow.normalBias = 0.006;
      keyLight.shadow.bias = -0.0001;
      keyLight.shadow.radius = 4;
      keyLight.shadow.intensity = 0.65;
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xb7d8ff, 0.9);
      rimLight.position.set(3, 3, -4);
      scene.add(rimLight);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.2;
      orbit.enablePan = false;
      orbit.maxPolarAngle = Math.PI * 0.49;
      orbit.autoRotateSpeed = 0.6;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const motionChanged = () => {
        if (reducedMotion.matches) {
          orbit.autoRotate = false;
          setRotating(false);
        }
      };
      reducedMotion.addEventListener("change", motionChanged);
      let model: InstanceType<typeof THREE.Group> | undefined = undefined;
      const stage = new THREE.Group();
      scene.add(stage);
      let disposeFinish: () => void = () => undefined;
      let currentFocus: { id: ComponentId; presentation: boolean } | undefined;
      let frame = 0;
      let transition:
        | {
            start: number;
            fromPosition: InstanceType<typeof THREE.Vector3>;
            toPosition: InstanceType<typeof THREE.Vector3>;
            fromTarget: InstanceType<typeof THREE.Vector3>;
            toTarget: InstanceType<typeof THREE.Vector3>;
            resumeRotation: boolean;
          }
        | undefined;
      const stopMotion = () => {
        currentFocus = undefined;
        transition = undefined;
        orbit.autoRotate = false;
        setRotating(false);
      };
      orbit.addEventListener("start", stopMotion);
      let needsRender = true;
      const requestRender = () => {
        needsRender = true;
      };
      orbit.addEventListener("change", requestRender);
      let highlighted: {
        mesh: InstanceType<typeof THREE.Mesh>;
        original: InstanceType<typeof THREE.Material> | InstanceType<typeof THREE.Material>[];
        temporary: InstanceType<typeof THREE.Material>[];
      }[] = [];
      const restoreMaterials = () => {
        for (const item of highlighted) {
          item.mesh.material = item.original;
          item.temporary.forEach((material) => material.dispose());
        }
        highlighted = [];
      };
      const highlight = (id: ComponentId | null) => {
        needsRender = true;
        restoreMaterials();
        model?.traverse((object) => {
          if (!(object instanceof THREE.Mesh) || componentFromObject(object) !== id) return;
          const original = object.material;
          const temporary = (Array.isArray(original) ? original : [original]).map((material) => {
            const copy = material.clone();
            if (copy instanceof THREE.MeshStandardMaterial) {
              copy.emissive.set("#23b8db");
              copy.emissiveIntensity = 0.025;
            } else if (copy instanceof THREE.MeshBasicMaterial)
              copy.color.lerp(new THREE.Color("#23b8db"), 0.3);
            return copy;
          });
          highlighted.push({ mesh: object, original, temporary });
          object.material = Array.isArray(original) ? temporary : temporary[0]!;
        });
      };
      const resize = () => {
        needsRender = true;
        const width = container.clientWidth,
          height = container.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (model && currentFocus) focusComponent(currentFocus.id, currentFocus.presentation);
        // Resizing clears the WebGL buffer, including when entering fullscreen.
        if (model) renderer.render(scene, camera);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let down = { x: 0, y: 0 };
      const findHit = (event: PointerEvent): ComponentId | null => {
        if (!model) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const candidates = raycaster
          .intersectObject(model, true)
          .filter((hit) => hit.object.visible)
          .map((hit) => componentFromObject(hit.object))
          .filter((id): id is ComponentId => !!id);
        return candidates.find(isSensor) ?? candidates[0] ?? null;
      };
      const pointerDown = (event: PointerEvent) => {
        down = { x: event.clientX, y: event.clientY };
      };
      const pointerMove = (event: PointerEvent) => {
        if (event.buttons) return;
        const hit = findHit(event);
        setHovered(hit);
        renderer.domElement.style.cursor = hit ? "pointer" : "grab";
        highlight(hit ?? callbacks.current.selected);
      };
      const pointerUp = (event: PointerEvent) => {
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
        const hit = findHit(event);
        if (hit) {
          callbacks.current.onSelect(hit);
          if (callbacks.current.fullscreen) focusComponent(hit);
        }
      };
      const pointerLeave = () => {
        setHovered(null);
        highlight(callbacks.current.selected);
      };
      const contextLost = (event: Event) => {
        event.preventDefault();
        setMessage("A sessão WebGL foi interrompida. Tente recarregar o visualizador.");
        setStatus("error");
      };
      renderer.domElement.addEventListener("pointerdown", pointerDown);
      renderer.domElement.addEventListener("pointermove", pointerMove);
      renderer.domElement.addEventListener("pointerup", pointerUp);
      renderer.domElement.addEventListener("pointerleave", pointerLeave);
      renderer.domElement.addEventListener("webglcontextlost", contextLost);
      const disposeModel = (root: InstanceType<typeof THREE.Group>) => {
        const geometries = new Set<InstanceType<typeof THREE.BufferGeometry>>();
        const materials = new Set<InstanceType<typeof THREE.Material>>();
        const textures = new Set<InstanceType<typeof THREE.Texture>>();
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(
            (material) => materials.add(material),
          );
        });
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value instanceof THREE.Texture) textures.add(value);
          });
          material.dispose();
        });
        geometries.forEach((geometry) => geometry.dispose());
        textures.forEach((texture) => texture.dispose());
      };
      cleanup = () => {
        cancelAnimationFrame(frame);
        controller.abort();
        observer.disconnect();
        actions.current = undefined;
        reducedMotion.removeEventListener("change", motionChanged);
        renderer.domElement.removeEventListener("pointerdown", pointerDown);
        renderer.domElement.removeEventListener("pointermove", pointerMove);
        renderer.domElement.removeEventListener("pointerup", pointerUp);
        renderer.domElement.removeEventListener("pointerleave", pointerLeave);
        renderer.domElement.removeEventListener("webglcontextlost", contextLost);
        restoreMaterials();
        orbit.removeEventListener("change", requestRender);
        orbit.removeEventListener("start", stopMotion);
        orbit.dispose();
        if (model) disposeModel(model);
        disposeModel(stage);
        disposeFinish();
        keyLight.shadow.dispose();
        environment.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      const gltf = await new GLTFLoader().parseAsync(bytes, "/models/");
      if (disposed) {
        disposeModel(gltf.scene);
        return;
      }
      model = gltf.scene;
      const names: string[] = [];
      model.traverse((object) => {
        if (object.name) names.push(object.name);
      });
      const report = inspectSceneNames(names);
      callbacks.current.onInspect(report);
      if (report.missingNames.length)
        console.warn("GLB r33: objetos esperados não encontrados", report.missingNames);
      console.info("GLB r33: cena carregada", {
        objects: report.objectCount,
        mappedComponents: report.found,
      });
      console.info("GLB r33: ajustes de apresentação", correctModelAssembly(model));
      disposeFinish = finishModelSurfaces(
        model,
        Math.min(renderer.capabilities.getMaxAnisotropy(), 4),
      );
      const bounds = new THREE.Box3().setFromObject(model);
      if (bounds.isEmpty()) throw new Error("O GLB não contém geometria visível.");
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.sub(center);
      scene.add(model);
      const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.1);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(radius * 80, radius * 80),
        new THREE.MeshStandardMaterial({ color: "#0d1520", roughness: 1 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = bounds.min.y - center.y - 0.003;
      floor.receiveShadow = true;
      stage.add(floor);
      scene.fog = new THREE.Fog("#141b24", radius * 5, radius * 18);
      Object.assign(keyLight.shadow.camera, {
        left: -radius,
        right: radius,
        top: radius,
        bottom: -radius,
        near: 0.1,
        far: 20,
      });
      keyLight.shadow.camera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
      orbit.minDistance = radius * 0.6;
      orbit.maxDistance = radius * 7;
      const componentBounds = componentFocusBounds(model);
      setAvailable(presentationOrder.filter((id) => componentBounds.has(id)));
      const projected = new THREE.Vector3();
      const chooseSide = (id: ComponentId) => {
        const box = componentBounds.get(id);
        if (!box) return;
        box.getCenter(projected).project(camera);
        setSide(projected.x > 0 ? "left" : "right");
        needsRender = true;
      };
      const updateConnector = () => {
        if (!callbacks.current.fullscreen || !callout.current || !connector.current) return;
        const box = componentBounds.get(callbacks.current.selected);
        if (!box) return;
        camera.updateMatrixWorld();
        box.getCenter(projected).project(camera);
        const visible =
          projected.z >= -1 &&
          projected.z <= 1 &&
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1;
        connector.current.style.visibility = visible ? "visible" : "hidden";
        if (!visible) return;
        const rect = container.getBoundingClientRect();
        const panel = callout.current.getBoundingClientRect();
        const x = ((projected.x + 1) * rect.width) / 2;
        const y = ((1 - projected.y) * rect.height) / 2;
        const panelOnLeft = panel.left + panel.width / 2 < rect.left + rect.width / 2;
        const endX = (panelOnLeft ? panel.right : panel.left) - rect.left;
        const endY = panel.top - rect.top + Math.min(100, panel.height / 2);
        const elbowX = endX + (panelOnLeft ? 24 : -24);
        leader.current?.setAttribute("points", `${x},${y} ${elbowX},${endY} ${endX},${endY}`);
        anchor.current?.setAttribute("cx", String(x));
        anchor.current?.setAttribute("cy", String(y));
      };
      const focusComponent = (id: ComponentId, presentation = false) => {
        const box = componentBounds.get(id);
        if (!box) return;
        currentFocus = { id, presentation };
        transition = undefined;
        orbit.autoRotate = false;
        if (!presentation) setRotating(false);
        orbit.enableDamping = false;
        orbit.update();
        orbit.enableDamping = true;
        const target = box.getCenter(new THREE.Vector3());
        const canvasRect = container.getBoundingClientRect();
        const calloutRect = callout.current?.getBoundingClientRect();
        const panelWidth =
          canvasRect.width <= 700
            ? Math.min(300, canvasRect.width - 28)
            : Math.min(presentation ? 340 : 420, canvasRect.width * (presentation ? 0.36 : 0.38));
        if (canvasRect.width <= 700) {
          const panelBottom = 64 + Math.min(canvasRect.height * 0.38, canvasRect.height - 180);
          camera.setViewOffset(
            canvasRect.width,
            canvasRect.height,
            0,
            (78 - panelBottom) / 2,
            canvasRect.width,
            canvasRect.height,
          );
        } else camera.clearViewOffset();
        const frame = bestComponentFrame(
          box,
          camera.aspect,
          { width: canvasRect.width, height: canvasRect.height },
          calloutRect
            ? {
                left: canvasRect.width - panelWidth - 24,
                top: calloutRect.top - canvasRect.top,
                right: canvasRect.width - 24,
                bottom: calloutRect.bottom - canvasRect.top,
              }
            : {
                left: canvasRect.width,
                top: 0,
                right: canvasRect.width,
                bottom: canvasRect.height * 0.4,
              },
          {
            preferredDirection: componentDirections[id],
            visibility: componentVisibility(model!, id, box),
            minDistance: radius * 0.24,
          },
        );
        setSide(frame.side);
        orbit.minDistance = radius * 0.04;
        orbit.maxDistance = Math.max(radius * 7, frame.distance * 1.05);
        const destination = target.clone().addScaledVector(frame.direction, frame.distance);
        if (reducedMotion.matches) {
          camera.position.copy(destination);
          orbit.target.copy(target);
          orbit.update();
        } else {
          transition = {
            start: performance.now(),
            fromPosition: camera.position.clone(),
            toPosition: destination,
            fromTarget: orbit.target.clone(),
            toTarget: target,
            resumeRotation: presentation,
          };
        }
        setFocused(!presentation);
        highlight(id);
        needsRender = true;
      };
      const reset = () => {
        currentFocus = undefined;
        camera.clearViewOffset();
        transition = undefined;
        setFocused(false);
        orbit.minDistance = radius * 0.6;
        orbit.maxDistance = radius * 7;
        orbit.autoRotate = false;
        setRotating(false);
        orbit.enableDamping = false;
        orbit.update();
        const distance =
          (radius / Math.sin(THREE.MathUtils.degToRad(40 / 2))) *
          (camera.aspect < 1 ? 1 / camera.aspect : 1) *
          0.85;
        camera.position.set(distance * 0.6, distance * 0.5, distance * 0.75);
        camera.near = radius / 100;
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        orbit.target.set(0, 0, 0);
        orbit.update();
        orbit.enableDamping = true;
      };
      reset();
      highlight(callbacks.current.selected);
      actions.current = {
        reset,
        highlight,
        focus: focusComponent,
        chooseSide,
        move: (azimuth, polar) => {
          currentFocus = undefined;
          transition = undefined;
          orbit.autoRotate = false;
          setRotating(false);
          orbit.enableDamping = false;
          orbit.update();
          const spherical = new THREE.Spherical().setFromVector3(
            camera.position.clone().sub(orbit.target),
          );
          spherical.theta += azimuth;
          spherical.phi = THREE.MathUtils.clamp(spherical.phi + polar, 0.05, orbit.maxPolarAngle);
          camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(spherical));
          orbit.update();
          orbit.enableDamping = true;
        },
        rotate: (enabled) => {
          transition = undefined;
          if (enabled) reset();
          orbit.autoRotate = enabled && !reducedMotion.matches;
          setRotating(orbit.autoRotate);
        },
        zoom: (factor) => {
          currentFocus = undefined;
          transition = undefined;
          const offset = camera.position.clone().sub(orbit.target);
          offset.setLength(
            THREE.MathUtils.clamp(offset.length() * factor, orbit.minDistance, orbit.maxDistance),
          );
          camera.position.copy(orbit.target).add(offset);
          orbit.update();
        },
      };
      setStatus("ready");
      const animate = () => {
        if (disposed) return;
        frame = requestAnimationFrame(animate);
        if (!document.hidden) {
          if (transition) {
            const progress = Math.min((performance.now() - transition.start) / 650, 1);
            const eased = progress * progress * (3 - 2 * progress);
            camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
            orbit.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
            needsRender = true;
            if (progress === 1) {
              orbit.autoRotate = transition.resumeRotation && !reducedMotion.matches;
              transition = undefined;
            }
          }
          const changed = orbit.update();
          if (needsRender || changed) {
            renderer.render(scene, camera);
            updateConnector();
            needsRender = false;
          }
        }
      };
      animate();
    };
    initialize().catch((error: unknown) => {
      if (disposed) return;
      cleanup?.();
      cleanup = undefined;
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o modelo 3D.");
      setStatus("error");
    });
    return () => {
      disposed = true;
      controller.abort();
      cleanup?.();
    };
  }, [retry]);

  return (
    <section
      ref={viewer}
      className={`dt-viewer ${fullscreen ? "dt-viewer-fullscreen" : ""}`}
      aria-label="Visualização do dessalinizador"
    >
      <div className="dt-viewer-top">
        <span>
          <Box size={15} /> Dessalinizador solar <b>r33</b>
        </span>
        <span className="dt-viewer-badge">
          {status === "ready" ? "Modelo interativo" : "Referência do equipamento"}
        </span>
      </div>
      <div
        ref={host}
        className="dt-canvas"
        tabIndex={status === "ready" ? 0 : -1}
        role="group"
        aria-label="Câmera 3D: setas para girar, mais e menos para zoom, Home para restaurar"
        onKeyDown={(event) => {
          const controls = actions.current;
          if (!controls) return;
          if (event.key === "ArrowLeft") controls.move(-0.15, 0);
          else if (event.key === "ArrowRight") controls.move(0.15, 0);
          else if (event.key === "ArrowUp") controls.move(0, -0.12);
          else if (event.key === "ArrowDown") controls.move(0, 0.12);
          else if (event.key === "+" || event.key === "=") controls.zoom(0.8);
          else if (event.key === "-") controls.zoom(1.25);
          else if (event.key === "Home") controls.reset();
          else return;
          event.preventDefault();
        }}
        style={{ visibility: status === "ready" ? "visible" : "hidden" }}
      />
      {status !== "ready" && (
        <div className="dt-model-fallback">
          <img
            loading="lazy"
            src={`/images/digital-twin/${reference === "exterior" ? "exterior-r33" : "basin-r33"}.png`}
            alt={
              reference === "exterior"
                ? "Referência técnica do dessalinizador solar fechado, com painel, tanque e filtro"
                : "Referência da cuba interna e da lâmina de água sob a tampa"
            }
          />
          <div className="dt-fallback-caption" role="status">
            {status === "loading" ? (
              <>
                <LoaderCircle className="animate-spin" size={18} /> Carregando o modelo 3D…
              </>
            ) : (
              <>
                <strong>Visualização 3D indisponível</strong>
                <span>{message}</span>
                <button onClick={() => setRetry((r) => r + 1)}>Tentar novamente</button>
                <button
                  onClick={() => setReference((r) => (r === "exterior" ? "basin" : "exterior"))}
                >
                  Ver referência {reference === "exterior" ? "interna" : "externa"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {fullscreenError && (
        <div className="dt-fullscreen-error" role="alert">
          {fullscreenError}
        </div>
      )}
      {fullscreen && status === "ready" && (
        <>
          <svg ref={connector} className="dt-callout-connector" aria-hidden="true">
            <polyline ref={leader} fill="none" />
            <circle ref={anchor} r="5" />
          </svg>
          <div
            ref={callout}
            className={`dt-component-callout dt-callout-${side} ${focused ? "dt-callout-focused" : ""}`}
            aria-label="Detalhes do componente em tela cheia"
          >
            <ComponentCallout
              selected={selected}
              telemetry={telemetry}
              touring={touring}
              remaining={remaining}
              position={available.indexOf(selected) + 1}
              count={available.length}
              onPause={() => actions.current?.focus(selected)}
              onResume={() => actions.current?.rotate(true)}
              onNext={nextComponent}
              onReset={() => actions.current?.reset()}
            />
            <label className="dt-callout-select">
              Selecionar componente
              <select
                aria-label="Selecionar componente em tela cheia"
                value={selected}
                onChange={(event) => examine(event.target.value as ComponentId)}
              >
                {available.map((id) => (
                  <option key={id} value={id}>
                    {isSensor(id) ? sensors[id].label : parts[id].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
      {hovered && status === "ready" && !fullscreen && (
        <div className="dt-hover-label">
          {isSensor(hovered) ? sensors[hovered].label : parts[hovered].label}
        </div>
      )}
      <div className="dt-viewer-bottom">
        <span>
          <MousePointer2 size={14} /> Arraste para girar · clique nas peças
        </span>
        <div className="dt-camera-controls">
          <button
            disabled={status !== "ready"}
            onClick={() => actions.current?.move(-0.2, 0)}
            aria-label="Girar câmera para a esquerda"
            title="Girar para a esquerda"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            disabled={status !== "ready"}
            onClick={() => actions.current?.move(0.2, 0)}
            aria-label="Girar câmera para a direita"
            title="Girar para a direita"
          >
            <ChevronRight size={17} />
          </button>
          <button
            disabled={status !== "ready"}
            onClick={() => actions.current?.zoom(0.8)}
            aria-label="Aproximar câmera"
            title="Aproximar"
          >
            <ZoomIn size={17} />
          </button>
          <button
            disabled={status !== "ready"}
            onClick={() => actions.current?.zoom(1.25)}
            aria-label="Afastar câmera"
            title="Afastar"
          >
            <ZoomOut size={17} />
          </button>
          <button
            disabled={status !== "ready"}
            onClick={() => actions.current?.rotate(!rotating)}
            aria-label="Rotação automática"
            aria-pressed={rotating}
            title="Rotação automática (respeita redução de movimento)"
          >
            <Rotate3D size={17} />
          </button>
          <button
            disabled={status !== "ready"}
            onClick={() => actions.current?.reset()}
            aria-label="Restaurar câmera"
            title="Restaurar câmera"
          >
            <RotateCcw size={17} />
          </button>
          <button
            onClick={async () => {
              setFullscreenError("");
              try {
                if (document.fullscreenElement === viewer.current) {
                  await document.exitFullscreen();
                  if (!document.fullscreenElement) {
                    setFullscreen(false);
                    actions.current?.reset();
                  }
                } else if (viewer.current?.requestFullscreen)
                  await viewer.current.requestFullscreen();
                else
                  setFullscreenError(
                    "Este navegador não oferece tela cheia. Use os controles de câmera e o painel de sensores.",
                  );
              } catch {
                setFullscreenError(
                  "Não foi possível entrar em tela cheia. Verifique a permissão de tela cheia do navegador.",
                );
              }
            }}
            aria-label="Alternar tela cheia"
            title="Tela cheia"
          >
            <Maximize2 size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
