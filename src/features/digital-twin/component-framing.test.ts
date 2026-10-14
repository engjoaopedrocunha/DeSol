import { Box3, PerspectiveCamera, Sphere, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { bestComponentFrame } from "./component-framing";

describe("enquadramento individual dos componentes", () => {
  it("escolhe um ângulo novo que enquadra a peça alongada por inteiro", () => {
    const bounds = new Box3(new Vector3(-2, -0.5, -0.25), new Vector3(2, 0.5, 0.25));
    const frame = bestComponentFrame(
      bounds,
      16 / 9,
      { width: 1600, height: 900 },
      {
        left: 1160,
        top: 70,
        right: 1570,
        bottom: 430,
      },
    );
    expect(Math.abs(frame.direction.x)).toBeLessThan(0.5);
    expect(frame.direction.y).toBeGreaterThan(0.3);
    expect(frame.distance).toBeGreaterThan(bounds.getBoundingSphere(new Sphere()).radius);
    expect(["left", "right"]).toContain(frame.side);

    const center = bounds.getBoundingSphere(new Sphere()).center;
    const camera = new PerspectiveCamera(40, 16 / 9, 0.01, 1000);
    camera.position.copy(center).addScaledVector(frame.direction, frame.distance);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
        }
  });

  it("abre espaço para o balão no celular e mantém distância suficiente para a peça completa", () => {
    const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const frame = bestComponentFrame(
      bounds,
      390 / 844,
      { width: 390, height: 844 },
      {
        left: 72,
        top: 60,
        right: 368,
        bottom: 380,
      },
    );
    const radius = bounds.getBoundingSphere(new Sphere()).radius;
    expect(frame.distance).toBeGreaterThanOrEqual((radius / Math.sin(Math.PI / 9)) * 1.8);

    const center = bounds.getBoundingSphere(new Sphere()).center;
    const camera = new PerspectiveCamera(40, 390 / 844, 0.01, 1000);
    camera.position.copy(center).addScaledVector(frame.direction, frame.distance);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
        }
  });
  it.each([
    [320, 210],
    [390, 245],
    [558, 166],
  ])("preserva o contexto de um sensor pequeno no canvas %dx%d", (width, height) => {
    const bounds = new Box3(new Vector3(-0.02, -0.02, -0.02), new Vector3(0.02, 0.02, 0.02));
    const frame = bestComponentFrame(
      bounds,
      width / height,
      { width, height },
      { left: width, right: width, top: 0, bottom: 0 },
      { minDistance: 1.4 },
    );
    expect(frame.distance).toBeGreaterThan(1.35);
    const camera = new PerspectiveCamera(40, width / height, 0.01, 100);
    camera.position.copy(frame.direction).multiplyScalar(frame.distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new Vector3(x, y, z).project(camera);
          expect(Math.abs(point.x)).toBeLessThan(0.8);
          expect(Math.abs(point.y)).toBeLessThan(0.8);
        }
  });
});
