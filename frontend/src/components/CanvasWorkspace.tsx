import React, { useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import { CanvasManager } from '../core/canvasManager';
import { samService } from '../core/sam/samService';
import { EditorTool, PieceLayer, PaintFinish } from '../types/studio.types';

interface CanvasWorkspaceProps {
  imageSrc: string;
  activeTool: EditorTool;
  currentColor: string;
  currentFinish: PaintFinish;
  selectedLayerId: string | null;
  onLayersUpdate: (layers: PieceLayer[]) => void;
  onSelectLayer: (layerId: string | null) => void;
  onCanvasManagerReady: (manager: CanvasManager) => void;
  isProcessingSam: boolean;
  setIsProcessingSam: (processing: boolean) => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  imageSrc,
  activeTool,
  currentColor,
  currentFinish,
  selectedLayerId,
  onLayersUpdate,
  onSelectLayer,
  onCanvasManagerReady,
  isProcessingSam,
  setIsProcessingSam
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const managerRef = useRef<CanvasManager | null>(null);

  // Estados de interacción para Bounding Box Prompt (SAM)
  const isMouseDownRef = useRef(false);
  const boxOriginRef = useRef<{ x: number; y: number } | null>(null);
  const previewBoxRef = useRef<fabric.Rect | null>(null);

  // Inicializar Fabric.js Canvas
  useEffect(() => {
    if (!canvasElementRef.current || !containerRef.current) return;

    const canvas = new fabric.Canvas(canvasElementRef.current, {
      width: 980,
      height: 600,
      backgroundColor: '#E4E7EB',
      preserveObjectStacking: true,
      selection: activeTool === 'select'
    });

    fabricCanvasRef.current = canvas;
    const manager = new CanvasManager(canvas);
    managerRef.current = manager;
    onCanvasManagerReady(manager);

    // Cargar imagen base del vehículo
    manager.loadBaseVehicle(imageSrc).catch(console.error);

    // Eventos de selección
    canvas.on('selection:created', (e) => {
      const activeObj = e.selected?.[0];
      if (activeObj) {
        const layers = manager.getAllLayers();
        const found = layers.find(l => l.fabricObject === activeObj);
        if (found) onSelectLayer(found.id);
      }
    });

    canvas.on('selection:cleared', () => {
      onSelectLayer(null);
    });

    return () => {
      canvas.dispose();
    };
  }, [imageSrc]);

  // Sincronizar modo de selección según la herramienta activa
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.selection = activeTool === 'select';
    fabricCanvasRef.current.defaultCursor =
      activeTool === 'sam_box' ? 'crosshair' :
      activeTool === 'sam_point' ? 'cell' :
      activeTool === 'pan' ? 'grab' : 'default';
  }, [activeTool]);

  /**
   * Manejador de Prompts Interactivos de SAM (Modo 1)
   */
  const handleMouseDown = useCallback((opt: fabric.IEvent) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (activeTool === 'sam_box') {
      isMouseDownRef.current = true;
      const pointer = canvas.getPointer(opt.e);
      boxOriginRef.current = { x: pointer.x, y: pointer.y };

      const rect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'rgba(200, 16, 46, 0.12)',
        stroke: '#C8102E',
        strokeWidth: 2,
        strokeDashArray: [4, 3],
        selectable: false,
        evented: false
      });

      previewBoxRef.current = rect;
      canvas.add(rect);
    }
  }, [activeTool]);

  const handleMouseMove = useCallback((opt: fabric.IEvent) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isMouseDownRef.current || !boxOriginRef.current || !previewBoxRef.current) return;

    const pointer = canvas.getPointer(opt.e);
    const x = Math.min(boxOriginRef.current.x, pointer.x);
    const y = Math.min(boxOriginRef.current.y, pointer.y);
    const w = Math.abs(boxOriginRef.current.x - pointer.x);
    const h = Math.abs(boxOriginRef.current.y - pointer.y);

    previewBoxRef.current.set({ left: x, top: y, width: w, height: h });
    canvas.renderAll();
  }, []);

  const handleMouseUp = useCallback(async () => {
    const canvas = fabricCanvasRef.current;
    const manager = managerRef.current;
    if (!canvas || !manager || !isMouseDownRef.current || !previewBoxRef.current) return;

    isMouseDownRef.current = false;
    const rect = previewBoxRef.current;
    const box = {
      x1: rect.left || 0,
      y1: rect.top || 0,
      x2: (rect.left || 0) + (rect.width || 0),
      y2: (rect.top || 0) + (rect.height || 0)
    };

    // Remover la caja guía del canvas
    canvas.remove(rect);
    previewBoxRef.current = null;
    canvas.renderAll();

    // Validar dimensión mínima de caja
    if (Math.abs(box.x2 - box.x1) < 15 || Math.abs(box.y2 - box.y1) < 15) return;

    try {
      setIsProcessingSam(true);

      // 1. Inferencia SAM con Bounding Box
      const polygon = await samService.segmentWithBox(box, canvas.getWidth(), canvas.getHeight());

      // 2. Aislamiento automático con clipPath en Fabric.js
      manager.isolatePieceLayer(
        polygon,
        `Pieza SAM (${Math.round(box.x1)}, ${Math.round(box.y1)})`,
        {
          color: currentColor,
          finish: currentFinish,
          opacity: 0.88
        }
      );

      onLayersUpdate(manager.getAllLayers());
    } catch (err) {
      console.error('Error al procesar segmentación SAM:', err);
    } finally {
      setIsProcessingSam(false);
    }
  }, [currentColor, currentFinish, onLayersUpdate, setIsProcessingSam]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  return (
    <div className="canvas-viewport" ref={containerRef}>
      <div className="canvas-wrapper">
        <canvas ref={canvasElementRef} />

        {isProcessingSam && (
          <div className="sam-inferencing-overlay">
            <div className="spinner-sam"></div>
            <span>IA Segmentando Pieza con SAM...</span>
          </div>
        )}
      </div>
    </div>
  );
};
