import { SamBoxPrompt, SamPointPrompt, AutoDetectedPiece } from '../../types/studio.types';
import { smoothPolygonChaikin, Point2D } from './polygonUtils';

/**
 * Cliente de Inferencia para Segment Anything Model (SAM).
 * Soporta endpoint real (FastAPI / ONNX Runtime) con fallback de simulación automotriz.
 */
export class SamSegmentationService {
  private apiEndpoint: string;

  constructor(apiEndpoint: string = '/api/segment') {
    this.apiEndpoint = apiEndpoint;
  }

  /**
   * MODO 1: Segmentación asistida por Bounding Box
   */
  async segmentWithBox(box: SamBoxPrompt, imageWidth: number, imageHeight: number): Promise<Point2D[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}/sam-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box: [box.x1, box.y1, box.x2, box.y2] })
      });

      if (response.ok) {
        const data = await response.json();
        return data.polygon;
      }
    } catch {
      // Fallback a motor de simulación local
    }

    return this.simulateVehiclePartFromBox(box);
  }

  /**
   * MODO 1 (Variante): Segmentación asistida por clics positivos/negativos
   */
  async segmentWithPoints(points: SamPointPrompt[], imageWidth: number, imageHeight: number): Promise<Point2D[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}/sam-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      });

      if (response.ok) {
        const data = await response.json();
        return data.polygon;
      }
    } catch {
      // Fallback
    }

    // Si hay puntos, crea un box aproximado
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const box: SamBoxPrompt = {
      x1: Math.min(...xs) - 40,
      y1: Math.min(...ys) - 30,
      x2: Math.max(...xs) + 40,
      y2: Math.max(...ys) + 30
    };
    return this.simulateVehiclePartFromBox(box);
  }

  /**
   * MODO 2: Auto-Segmentación Automática de Piezas de Carrocería
   * Detecta cofre, puertas, rines, techo y vidrios sin intervención humana.
   */
  async autoSegmentVehicle(canvasWidth: number, canvasHeight: number): Promise<AutoDetectedPiece[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}/sam-auto`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        return data.pieces;
      }
    } catch {
      // Fallback
    }

    return this.getSimulatedAutomotivePartCatalog(canvasWidth, canvasHeight);
  }

  /**
   * Generador geométrico realista que emula la máscara de SAM sobre un Bounding Box
   */
  private simulateVehiclePartFromBox(box: SamBoxPrompt): Point2D[] {
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;
    const rx = Math.max(15, (box.x2 - box.x1) / 2);
    const ry = Math.max(15, (box.y2 - box.y1) / 2);

    const rawPoints: Point2D[] = [];
    const steps = 18;

    for (let i = 0; i < steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      // Modulación para imitar el corte angulado de paneles automotrices
      const organicFactor = 0.94 + 0.10 * Math.cos(theta * 2) - 0.04 * Math.sin(theta * 4);
      rawPoints.push({
        x: cx + Math.cos(theta) * rx * organicFactor,
        y: cy + Math.sin(theta) * ry * organicFactor
      });
    }

    // Suavizado con Chaikin para contornos fluidos
    return smoothPolygonChaikin(rawPoints, 2);
  }

  /**
   * Catálogo de piezas automotrices para el Modo 2 (Auto SAM)
   */
  private getSimulatedAutomotivePartCatalog(w: number, h: number): AutoDetectedPiece[] {
    const scaleX = w / 1024;
    const scaleY = h / 640;

    const parts: AutoDetectedPiece[] = [
      {
        id: 'piece_hood',
        name: 'Cofre Delantero',
        category: 'hood',
        polygon: smoothPolygonChaikin([
          { x: 180 * scaleX, y: 320 * scaleY },
          { x: 310 * scaleX, y: 295 * scaleY },
          { x: 410 * scaleX, y: 310 * scaleY },
          { x: 395 * scaleX, y: 370 * scaleY },
          { x: 220 * scaleX, y: 385 * scaleY }
        ], 2)
      },
      {
        id: 'piece_door_front',
        name: 'Puerta Delantera',
        category: 'door',
        polygon: smoothPolygonChaikin([
          { x: 420 * scaleX, y: 280 * scaleY },
          { x: 580 * scaleX, y: 285 * scaleY },
          { x: 570 * scaleX, y: 470 * scaleY },
          { x: 410 * scaleX, y: 460 * scaleY }
        ], 2)
      },
      {
        id: 'piece_door_rear',
        name: 'Puerta Trasera',
        category: 'door',
        polygon: smoothPolygonChaikin([
          { x: 585 * scaleX, y: 288 * scaleY },
          { x: 740 * scaleX, y: 295 * scaleY },
          { x: 730 * scaleX, y: 465 * scaleY },
          { x: 575 * scaleX, y: 470 * scaleY }
        ], 2)
      },
      {
        id: 'piece_fender_front',
        name: 'Salpicadera Delantera',
        category: 'body',
        polygon: smoothPolygonChaikin([
          { x: 170 * scaleX, y: 330 * scaleY },
          { x: 240 * scaleX, y: 320 * scaleY },
          { x: 415 * scaleX, y: 375 * scaleY },
          { x: 405 * scaleX, y: 450 * scaleY },
          { x: 280 * scaleX, y: 450 * scaleY },
          { x: 160 * scaleX, y: 420 * scaleY }
        ], 2)
      },
      {
        id: 'piece_wheel_front',
        name: 'Rin Delantero',
        category: 'wheel',
        polygon: smoothPolygonChaikin([
          { x: 270 * scaleX, y: 410 * scaleY },
          { x: 370 * scaleX, y: 410 * scaleY },
          { x: 370 * scaleX, y: 520 * scaleY },
          { x: 270 * scaleX, y: 520 * scaleY }
        ], 3)
      }
    ];

    return parts;
  }
}

export const samService = new SamSegmentationService();
