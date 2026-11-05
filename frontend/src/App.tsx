import React, { useState, useRef } from 'react';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { LayersPanel } from './components/LayersPanel';
import { PaintInspector } from './components/PaintInspector';
import { CanvasManager } from './core/canvasManager';
import { samService } from './core/sam/samService';
import { EditorTool, PieceLayer, PaintFinish } from './types/studio.types';
import './App.css';

const TEST_VEHICLE_ANGLES = [
  { id: 'angle_rear', label: 'Foto Trasera (Volkswagen Golf VIII)', src: '/assets/test_car/angle_180_rear.jpg' },
  { id: 'angle_front', label: 'Foto Frontal', src: '/assets/test_car/angle_0_front.jpg' },
  { id: 'angle_side', label: 'Foto Lateral', src: '/assets/test_car/angle_90_side.jpg' },
  { id: 'angle_front34', label: 'Perspectiva 3/4 Delantera', src: '/assets/test_car/angle_45_front34.jpg' },
  { id: 'angle_rear34', label: 'Perspectiva 3/4 Trasera', src: '/assets/test_car/angle_135_rear34.jpg' }
];

export const App: React.FC = () => {
  const [currentAngleId, setCurrentAngleId] = useState(TEST_VEHICLE_ANGLES[0].id);
  const [activeTool, setActiveTool] = useState<EditorTool>('sam_box');
  const [currentColor, setCurrentColor] = useState('#C8102E'); // Rojo Rayo Deportivo
  const [currentFinish, setCurrentFinish] = useState<PaintFinish>('metallic');
  const [layers, setLayers] = useState<PieceLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isProcessingSam, setIsProcessingSam] = useState(false);

  const canvasManagerRef = useRef<CanvasManager | null>(null);

  const currentVehicleImage = TEST_VEHICLE_ANGLES.find((a) => a.id === currentAngleId)?.src || TEST_VEHICLE_ANGLES[0].src;

  /**
   * MODO 2: Disparo de Auto-Segmentación SAM
   * Detecta y crea automáticamente capas independientes para todas las partes principales
   */
  const handleTriggerAutoSam = async () => {
    const manager = canvasManagerRef.current;
    if (!manager) return;

    try {
      setIsProcessingSam(true);
      const detectedPieces = await samService.autoSegmentVehicle(980, 600);

      // Limpiar capas previas si es necesario
      for (const piece of detectedPieces) {
        manager.isolatePieceLayer(piece.polygon, piece.name, {
          color: currentColor,
          finish: currentFinish,
          opacity: 0.88
        });
      }

      const all = manager.getAllLayers();
      setLayers([...all]);
      if (all.length > 0) {
        setSelectedLayerId(all[all.length - 1].id);
      }
    } catch (err) {
      console.error('Error en Auto-SAM:', err);
    } finally {
      setIsProcessingSam(false);
    }
  };

  const handleChangeColor = (newColor: string) => {
    setCurrentColor(newColor);
    if (selectedLayerId && canvasManagerRef.current) {
      canvasManagerRef.current.updateLayerShader(selectedLayerId, { color: newColor });
      setLayers([...canvasManagerRef.current.getAllLayers()]);
    }
  };

  const handleChangeFinish = (newFinish: PaintFinish) => {
    setCurrentFinish(newFinish);
    if (selectedLayerId && canvasManagerRef.current) {
      canvasManagerRef.current.updateLayerShader(selectedLayerId, { finish: newFinish });
      setLayers([...canvasManagerRef.current.getAllLayers()]);
    }
  };

  const handleChangeOpacity = (layerId: string, opacity: number) => {
    if (canvasManagerRef.current) {
      canvasManagerRef.current.updateLayerShader(layerId, { opacity });
      setLayers([...canvasManagerRef.current.getAllLayers()]);
    }
  };

  const handleToggleVisibility = (layerId: string) => {
    if (canvasManagerRef.current) {
      canvasManagerRef.current.toggleLayerVisibility(layerId);
      setLayers([...canvasManagerRef.current.getAllLayers()]);
    }
  };

  const handleRemoveLayer = (layerId: string) => {
    if (canvasManagerRef.current) {
      canvasManagerRef.current.removeLayer(layerId);
      setLayers([...canvasManagerRef.current.getAllLayers()]);
      if (selectedLayerId === layerId) setSelectedLayerId(null);
    }
  };

  const handleExport = () => {
    const canvas = (canvasManagerRef.current as any)?.canvas;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1.0 });
    const link = document.createElement('a');
    link.download = `el-rayo-autodesign-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const activeLayer = layers.find((l) => l.id === selectedLayerId);

  return (
    <div className="studio-root">
      <Header
        vehicleAngles={TEST_VEHICLE_ANGLES}
        currentAngleId={currentAngleId}
        onChangeAngle={setCurrentAngleId}
        onExport={handleExport}
        isProcessing={isProcessingSam}
      />

      <div className="studio-body">
        <Toolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          onTriggerAutoSam={handleTriggerAutoSam}
          isProcessing={isProcessingSam}
        />

        <main className="studio-canvas-area">
          <CanvasWorkspace
            imageSrc={currentVehicleImage}
            activeTool={activeTool}
            currentColor={currentColor}
            currentFinish={currentFinish}
            selectedLayerId={selectedLayerId}
            onLayersUpdate={setLayers}
            onSelectLayer={setSelectedLayerId}
            onCanvasManagerReady={(m) => {
              canvasManagerRef.current = m;
            }}
            isProcessingSam={isProcessingSam}
            setIsProcessingSam={setIsProcessingSam}
          />
        </main>

        <aside className="studio-sidebar-right">
          <LayersPanel
            layers={layers}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onToggleVisibility={handleToggleVisibility}
            onRemoveLayer={handleRemoveLayer}
            onChangeOpacity={handleChangeOpacity}
          />

          <PaintInspector
            currentColor={activeLayer?.color || currentColor}
            currentFinish={activeLayer?.finish || currentFinish}
            onChangeColor={handleChangeColor}
            onChangeFinish={handleChangeFinish}
            activeLayerName={activeLayer?.name || null}
          />
        </aside>
      </div>
    </div>
  );
};

export default App;
