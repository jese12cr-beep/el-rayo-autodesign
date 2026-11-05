import React from 'react';
import { MousePointer, Scan, Wand2, PenTool, Hand, Pipette } from 'lucide-react';
import { EditorTool } from '../types/studio.types';

interface ToolbarProps {
  activeTool: EditorTool;
  onSelectTool: (tool: EditorTool) => void;
  onTriggerAutoSam: () => void;
  isProcessing: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  onTriggerAutoSam,
  isProcessing
}) => {
  return (
    <aside className="photoshop-toolbar">
      <div className="toolbar-group">
        <button
          className={`tool-button ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => onSelectTool('select')}
          title="Selección y Capas (V)"
        >
          <MousePointer size={18} />
          <span className="tool-tip">Selección</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'sam_box' ? 'active' : ''}`}
          onClick={() => onSelectTool('sam_box')}
          title="Trazado Asistido SAM Box (B)"
        >
          <Scan size={18} />
          <span className="tool-tip">SAM Box</span>
        </button>

        <button
          className={`tool-button sam-auto-btn ${isProcessing ? 'loading' : ''}`}
          onClick={onTriggerAutoSam}
          disabled={isProcessing}
          title="Auto-Segmentación IA Completa (M)"
        >
          <Wand2 size={18} />
          <span className="tool-tip">Auto SAM</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'pen' ? 'active' : ''}`}
          onClick={() => onSelectTool('pen')}
          title="Pluma Bézier CAD (P)"
        >
          <PenTool size={18} />
          <span className="tool-tip">Pluma</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="tool-button"
          title="Cuentagotas OEM (I)"
          onClick={() => alert('Cuentagotas: Haz clic en cualquier parte del vehículo para muestrear tono')}
        >
          <Pipette size={18} />
          <span className="tool-tip">Muestreo</span>
        </button>

        <button
          className={`tool-button ${activeTool === 'pan' ? 'active' : ''}`}
          onClick={() => onSelectTool('pan')}
          title="Mano / Desplazar Lienzo (H)"
        >
          <Hand size={18} />
          <span className="tool-tip">Mano</span>
        </button>
      </div>
    </aside>
  );
};
