export interface Point2D {
  x: number;
  y: number;
}

/**
 * Suaviza un polígono mediante el algoritmo de corte de esquinas de Chaikin.
 * Convierte trazos quebrados o rústicos en contornos curvos aerodinámicos.
 */
export function smoothPolygonChaikin(points: Point2D[], iterations: number = 2): Point2D[] {
  if (points.length < 3) return points;

  let current = [...points];

  for (let it = 0; it < iterations; it++) {
    const next: Point2D[] = [];
    const n = current.length;

    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];

      // Q = 75% P0 + 25% P1
      const q: Point2D = {
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y
      };

      // R = 25% P0 + 75% P1
      const r: Point2D = {
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y
      };

      next.push(q);
      next.push(r);
    }

    current = next;
  }

  return current;
}

/**
 * Convierte un arreglo de puntos a comando Path SVG
 */
export function pointsToSvgPath(points: Point2D[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  d += ' Z';
  return d;
}
