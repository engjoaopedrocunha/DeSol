import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  X,
} from "lucide-react";
import {
  componentFromObject,
  formatValue,
  healthLabels,
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

const COMPACT_VIEWER_QUERY = "(max-width: 767px), (max-width: 1000px) and (max-height: 500px)";

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
  onActivate?: (id: ComponentId) => void;
  onInspect: (report: SceneReport | null) => void;
  telemetry: ViewerTelemetry;
};
export default function ModelViewer({
  selected,
  onSelect,
  onActivate,
  onInspect,
  telemetry,
}: Props) {
  const mountPoint = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const viewer = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [compact, setCompact] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const callbacks = useRef({ selected, onSelect, onActivate, onInspect, fullscreen });
  callbacks.current = { selected, onSelect, onActivate, onInspect, fullscreen };
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [hovered, setHovered] = useState<ComponentId | null>(null);
  const [reference, setReference] = useState<"exterior" | "basin">("exterior");

  const touring = fullscreen && rotating && status === "ready" && !detailsOpen;
  const closeExpanded = async () => {
    try {
      if (document.fullscreenElement === viewer.current) await document.exitFullscreen();
      setFullscreen(false);
      setDetailsOpen(false);
      actions.current?.reset();
    } catch {
      setFullscreenError("Não foi possível sair da tela cheia. Tente novamente.");
    }
  };
  useLayoutEffect(() => {
    const element = document.createElement("div");
    element.className = "dt-dashboard dt-viewer-mount";
    setMount(element);
    return () => element.remove();
  }, []);
  useLayoutEffect(() => {
    if (!mount || !mountPoint.current) return;
    // Keep the renderer mounted while escaping transformed/clipped preview containers.
    if (fullscreen && document.fullscreenElement !== viewer.current) {
      if (!mountPoint.current.style.height)
        mountPoint.current.style.height = `${mount.getBoundingClientRect().height}px`;
      if (mount.parentElement !== document.body) document.body.appendChild(mount);
    } else {
      if (mount.parentElement !== mountPoint.current) mountPoint.current.appendChild(mount);
      mountPoint.current.style.height = "";
    }
  }, [mount, fullscreen]);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_VIEWER_QUERY);
    const changed = () => setCompact(media.matches);
    changed();
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const element = viewer.current;
    const previouslyFocused = returnFocus.current ?? document.activeElement;
    closeButton.current?.focus({ preventScroll: true });
    const syncViewport = () =>
      element?.style.setProperty(
        "--dt-expanded-height",
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      );
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      element?.style.removeProperty("--dt-expanded-height");
      if (previouslyFocused instanceof HTMLElement)
        previouslyFocused.focus({ preventScroll: true });
    };
  }, [fullscreen]);
  useEffect(() => {
    if (fullscreen && detailsOpen) actions.current?.focus(selected);
  }, [fullscreen, detailsOpen, selected]);
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
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [fullscreen]);
  useEffect(() => {
    const changed = () => {
      const entered = document.fullscreenElement === viewer.current;
      setFullscreen(entered);
      setFocused(false);
      if (entered) actions.current?.rotate(!window.matchMedia(COMPACT_VIEWER_QUERY).matches);
      else actions.current?.reset();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Tab" && callbacks.current.fullscreen && viewer.current) {
        const elements = [
          ...viewer.current.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select, [tabindex='0']",
          ),
        ].filter(
          (element) =>
            element.getBoundingClientRect().height > 0 &&
            getComputedStyle(element).visibility !== "hidden",
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (event.key === "Escape" && callbacks.current.fullscreen) {
        if (!document.fullscreenElement) {
          setFullscreen(false);
          setDetailsOpen(false);
          actions.current?.reset();
          return;
        }
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
    if (!mount || !container) return;
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
              copy.emissive.set("#e5ee6c");
              copy.emissiveIntensity = 0.025;
            } else if (copy instanceof THREE.MeshBasicMaterial)
              copy.color.lerp(new THREE.Color("#e5ee6c"), 0.3);
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
        if (model) {
          if (currentFocus) focusComponent(currentFocus.id, currentFocus.presentation);
          else reset();
        }
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
          else callbacks.current.onActivate?.(hit);
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
        if (!canvasRect.width || !canvasRect.height) return;
        const calloutRect = callout.current?.getBoundingClientRect();
        const docked =
          getComputedStyle(viewer.current!).getPropertyValue("--dt-docked").trim() === "1";
        const panelWidth = Math.min(
          presentation ? 340 : 420,
          canvasRect.width * (presentation ? 0.36 : 0.38),
        );
        camera.clearViewOffset();
        const frame = bestComponentFrame(
          box,
          camera.aspect,
          { width: canvasRect.width, height: canvasRect.height },
          calloutRect && !docked
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
            minDistance: radius * (docked ? 0.7 : 0.24),
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
        // Fit the actual canvas on phones; headers and tools have their own rows.
        if (
          window.matchMedia("(max-width: 767px), (max-width: 1000px) and (max-height: 500px)")
            .matches
        ) {
          const direction = camera.position.clone().normalize();
          for (let attempt = 0; attempt < 3; attempt++) {
            camera.lookAt(0, 0, 0);
            camera.updateMatrixWorld();
            let extent = 0;
            const bounds = new THREE.Box3().setFromObject(model!);
            for (const x of [bounds.min.x, bounds.max.x])
              for (const y of [bounds.min.y, bounds.max.y])
                for (const z of [bounds.min.z, bounds.max.z]) {
                  const point = new THREE.Vector3(x, y, z).project(camera);
                  extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
                }
            const fittedDistance = (camera.position.length() * extent) / 0.82;
            camera.position.copy(direction).multiplyScalar(fittedDistance);
          }
        }
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
  }, [retry, mount]);

  const surface = (
    <section
      ref={viewer}
      className={`dt-viewer ${fullscreen ? "dt-viewer-fullscreen" : ""} ${compact && detailsOpen ? "dt-viewer-details-open" : ""}`}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? true : undefined}
      aria-label="Visualização do dessalinizador"
    >
      <div className="dt-viewer-top">
        <span>
          <Box size={15} /> Dessalinizador solar
        </span>
        <span className="dt-viewer-badge">
          {status === "ready" ? "Modelo interativo" : "Referência do equipamento"}
        </span>
        {fullscreen && (
          <button
            ref={closeButton}
            className="dt-close-expanded"
            aria-label="Fechar visualização expandida"
            onClick={() => void closeExpanded()}
          >
            <X size={20} />
          </button>
        )}
      </div>
      {fullscreen && compact && (
        <div
          className="dt-mobile-viewer-tabs"
          role="group"
          aria-label="Conteúdo da visualização expandida"
        >
          <button aria-pressed={!detailsOpen} onClick={() => setDetailsOpen(false)}>
            Modelo 3D
          </button>
          <button aria-pressed={detailsOpen} onClick={() => setDetailsOpen(true)}>
            Detalhes
          </button>
        </div>
      )}
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
            tabIndex={0}
          >
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
            {compact && (
              <div className="dt-mobile-component-summary">
                {isSensor(selected) ? (
                  <strong>
                    {formatValue(telemetry.readings[selected])}
                    <small>{selected === "gateway" ? "" : sensors[selected].unit}</small>
                  </strong>
                ) : (
                  <span>Componente do equipamento</span>
                )}
                <span>
                  {telemetry.mode === "demo"
                    ? "DEMO · Simulação"
                    : isSensor(selected)
                      ? healthLabels[telemetry.health[selected]]
                      : "Sem medição dedicada"}
                </span>
              </div>
            )}
            <div className="dt-full-component-details">
              <ComponentCallout
                selected={selected}
                telemetry={telemetry}
                touring={touring}
                remaining={remaining}
                position={available.indexOf(selected) + 1}
                count={available.length}
                onPause={() => actions.current?.focus(selected)}
                onResume={() => {
                  setDetailsOpen(false);
                  actions.current?.rotate(true);
                }}
                onNext={nextComponent}
                onReset={() => {
                  setDetailsOpen(false);
                  actions.current?.reset();
                }}
              />
            </div>
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
          <MousePointer2 size={14} /> Arraste para girar · toque ou clique nas peças
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
              if (fullscreen) {
                await closeExpanded();
                return;
              }
              returnFocus.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setDetailsOpen(false);
              setFocused(false);
              if (mountPoint.current && viewer.current)
                mountPoint.current.style.height = `${viewer.current.getBoundingClientRect().height}px`;
              if (compact) {
                actions.current?.reset();
                setFullscreen(true);
                return;
              }
              try {
                if (viewer.current?.requestFullscreen) await viewer.current.requestFullscreen();
                else {
                  setFullscreen(true);
                  actions.current?.rotate(true);
                }
              } catch {
                setFullscreen(true);
                actions.current?.rotate(true);
              }
            }}
            aria-label="Alternar tela cheia"
            aria-pressed={fullscreen}
            title="Tela cheia"
          >
            <Maximize2 size={17} />
          </button>
        </div>
      </div>
    </section>
  );
  return (
    <>
      <div ref={mountPoint} className="dt-viewer-slot" />
      {mount && createPortal(surface, mount)}
    </>
  );
}
