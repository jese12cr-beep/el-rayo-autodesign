import React from 'react';
import { Eye, EyeOff, Lock, Unlock, Trash2, Layers } from 'lucide-react';
import { PieceLayer } from '../types/studio.types';

interface LayersPanelProps {
  layers: PieceLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onChangeOpacity: (layerId: string, opacity: number) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onRemoveLayer,
  onChangeOpacity
}) => {
  return (
    <div className="layers-panel">
      <div className="panel-header">
        <div className="header-title">
          <Layers size={16} />
          <span>Capas & Piezas ({layers.length})</span>
        </div>
      </div>

      <div className="layers-list">
        {layers.length === 0 ? (
          <div className="empty-layers-hint">
            <p>No hay piezas segmentadas.</p>
            <small>Usa <strong>SAM Box</strong> o <strong>Auto SAM</strong> para aislar piezas.</small>
          </div>
        ) : (
          layers.map((layer) => {
            const isSelected = layer.id === selectedLayerId;
            return (
              <div
                key={layer.id}
                className={`layer-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectLayer(layer.id)}
              >
                <button
                  className="layer-btn-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  title={layer.visible ? 'Ocultar pieza' : 'Mostrar pieza'}
                >
                  {layer.visible ? <Eye size={15} /> : <EyeOff size={15} color="#94A3B8" />}
                </button>

                <div
                  className="layer-color-badge"
                  style={{ backgroundColor: layer.color }}
                  title={`Color: ${layer.color} (${layer.finish})`}
                />

                <div className="layer-info">
                  <span className="layer-name">{layer.name}</span>
                  <span className="layer-finish-tag">{layer.finish}</span>
                </div>

                <button
                  className="layer-btn-icon delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLayer(layer.id);
                  }}
                  title="Eliminar capa"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {selectedLayerId && (
        <div className="layer-footer-controls">
          <label className="slider-label">
            <span>Opacidad de Pintura:</span>
            <span>
              {Math.round(
                (layers.find((l) => l.id === selectedLayerId)?.opacity || 0.88) * 100
              )}
              %
            </span>
          </label>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.02"
            value={layers.find((l) => l.id === selectedLayerId)?.opacity || 0.88}
            onChange={(e) => onChangeOpacity(selectedLayerId, parseFloat(e.target.value))}
            className="opacity-slider"
          />
        </div>
      )}
    </div>
  );
};
