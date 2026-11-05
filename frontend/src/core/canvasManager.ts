import { fabric } from 'fabric';
import { PieceLayer, PaintShaderOptions } from '../types/studio.types';
import './filters/AutomotivePaintFilter';

export class CanvasManager {
  private canvas: fabric.Canvas;
  private baseImage: fabric.Image | null = null;
  private layers: Map<string, PieceLayer> = new Map();

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas;
  }

  /**
   * Carga y escala la imagen principal del vehículo en el lienzo
   */
  async loadBaseVehicle(imageUrl: string): Promise<fabric.Image> {
    return new Promise((resolve, reject) => {
      fabric.Image.fromURL(
        imageUrl,
        (img) => {
          if (!img) {
            reject(new Error('No se pudo cargar la imagen del vehículo'));
            return;
          }

          const canvasW = this.canvas.getWidth();
          const canvasH = this.canvas.getHeight();

          const scale = Math.min(
            (canvasW * 0.94) / (img.width || 1),
            (canvasH * 0.94) / (img.height || 1)
          );

          img.set({
            originX: 'center',
            originY: 'center',
            left: canvasW / 2,
            top: canvasH / 2,
            scaleX: scale,
            scaleY: scale,
            selectable: false,
            evented: false,
            hoverCursor: 'default'
          });

          this.baseImage = img;
          this.canvas.add(img);
          this.canvas.sendToBack(img);
          this.canvas.renderAll();
          resolve(img);
        },
        { crossOrigin: 'anonymous' }
      );
    });
  }

  /**
   * FUNCIÓN NÚCLEO: Aísla una pieza del auto creando una nueva capa con clipPath
   * @param points - Puntos poligonales generados por SAM
   * @param name - Nombre descriptivo de la pieza
   * @param shader - Opciones iniciales de pintura (color, finish, opacity)
   */
  isolatePieceLayer(
    points: Array<{ x: number; y: number }>,
    name: string,
    shader: PaintShaderOptions
  ): PieceLayer | null {
    if (!this.baseImage) return null;

    // 1. Crear el clipPath vectorial.
    // absolutePositioned: true asegura que el polígono use coordenadas absolutas del Canvas
    const clipPolygon = new fabric.Polygon(points, {
      absolutePositioned: true
    });

    let createdLayer: PieceLayer | null = null;

    // 2. Clonar la imagen base para mantener idéntica alineación y resolución
    this.baseImage.clone((cloned: fabric.Image) => {
      cloned.set({
        clipPath: clipPolygon,
        selectable: true,
        hasControls: false, // Bloquear tiradores de escala para prevenir desalineación
        hasBorders: true,
        borderColor: '#C8102E',
        borderDashArray: [3, 3],
        lockMovementX: true,
        lockMovementY: true,
        hoverCursor: 'pointer',
        name: name
      });

      // 3. Instanciar filtro de pintura fotorrealista
      // @ts-ignore
      const paintFilter = new fabric.Image.filters.AutomotivePaint({
        color: shader.color,
        finish: shader.finish,
        opacity: shader.opacity
      });

      cloned.filters = [paintFilter];
      cloned.applyFilters();

      this.canvas.add(cloned);
      this.canvas.setActiveObject(cloned);
      this.canvas.renderAll();

      const layerId = `layer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      createdLayer = {
        id: layerId,
        name,
        fabricObject: cloned,
        color: shader.color,
        finish: shader.finish,
        opacity: shader.opacity,
        visible: true,
        locked: true,
        points
      };

      this.layers.set(layerId, createdLayer);
    });

    return createdLayer;
  }

  /**
   * Actualiza el color o acabado (shader) de una capa existente
   */
  updateLayerShader(layerId: string, shader: Partial<PaintShaderOptions>): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    if (shader.color !== undefined) layer.color = shader.color;
    if (shader.finish !== undefined) layer.finish = shader.finish;
    if (shader.opacity !== undefined) layer.opacity = shader.opacity;

    // @ts-ignore
    const updatedFilter = new fabric.Image.filters.AutomotivePaint({
      color: layer.color,
      finish: layer.finish,
      opacity: layer.opacity
    });

    layer.fabricObject.filters = [updatedFilter];
    layer.fabricObject.applyFilters();
    this.canvas.renderAll();
  }

  /**
   * Alterna la visibilidad de una pieza
   */
  toggleLayerVisibility(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    layer.visible = !layer.visible;
    layer.fabricObject.set('visible', layer.visible);
    this.canvas.renderAll();
    return layer.visible;
  }

  /**
   * Elimina una capa del canvas
   */
  removeLayer(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    this.canvas.remove(layer.fabricObject);
    this.layers.delete(layerId);
    this.canvas.renderAll();
  }

  /**
   * Obtiene la lista actual de capas ordenadas
   */
  getAllLayers(): PieceLayer[] {
    return Array.from(this.layers.values());
  }

  getBaseImage(): fabric.Image | null {
    return this.baseImage;
  }
}
