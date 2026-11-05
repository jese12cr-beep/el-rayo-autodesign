import React from 'react';
import { Palette, Sparkles } from 'lucide-react';
import { PaintFinish } from '../types/studio.types';

interface PaintInspectorProps {
  currentColor: string;
  currentFinish: PaintFinish;
  onChangeColor: (color: string) => void;
  onChangeFinish: (finish: PaintFinish) => void;
  activeLayerName: string | null;
}

const OEM_PALETTE = [
  { name: 'Rojo Rayo Deportivo', hex: '#C8102E' },
  { name: 'Azul Eléctrico Cobalto', hex: '#1558C4' },
  { name: 'Negro Obsidiana', hex: '#111317' },
  { name: 'Blanco Glaciar Puro', hex: '#F8FAFC' },
  { name: 'Plata Titanio Metal', hex: '#94A3B8' },
  { name: 'Amarillo Daytona Racing', hex: '#EAB308' },
  { name: 'Verde Nürburgring Mate', hex: '#3B4D3C' },
  { name: 'Naranja Furia Perlado', hex: '#EA580C' }
];

export const PaintInspector: React.FC<PaintInspectorProps> = ({
  currentColor,
  currentFinish,
  onChangeColor,
  onChangeFinish,
  activeLayerName
}) => {
  return (
    <div className="paint-inspector">
      <div className="panel-header">
        <div className="header-title">
          <Palette size={16} />
          <span>Shader de Pintura OEM</span>
        </div>
        {activeLayerName && <span className="active-target-badge">{activeLayerName}</span>}
      </div>

      <div className="inspector-section">
        <label className="section-label">Paleta Automotriz de Taller</label>
        <div className="swatches-grid">
          {OEM_PALETTE.map((item) => (
            <button
              key={item.hex}
              className={`swatch-btn ${currentColor.toLowerCase() === item.hex.toLowerCase() ? 'active' : ''}`}
              style={{ backgroundColor: item.hex }}
              onClick={() => onChangeColor(item.hex)}
              title={item.name}
            >
              {currentColor.toLowerCase() === item.hex.toLowerCase() && (
                <span className="swatch-check">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="inspector-section">
        <label className="section-label">Tono Personalizado (HEX)</label>
        <div className="hex-input-group">
          <input
            type="color"
            value={currentColor}
            onChange={(e) => onChangeColor(e.target.value)}
            className="native-color-picker"
          />
          <input
            type="text"
            value={currentColor.toUpperCase()}
            onChange={(e) => onChangeColor(e.target.value)}
            className="hex-text-input"
          />
        </div>
      </div>

      <div className="inspector-section">
        <label className="section-label">
          <Sparkles size={14} />
          <span>Acabado / Barniz de Chapa</span>
        </label>
        <div className="finish-buttons-grid">
          {(['metallic', 'pearl', 'solid', 'matte'] as PaintFinish[]).map((fin) => (
            <button
              key={fin}
              className={`finish-btn ${currentFinish === fin ? 'active' : ''}`}
              onClick={() => onChangeFinish(fin)}
            >
              {fin === 'metallic' && 'Metálico'}
              {fin === 'pearl' && 'Perlado Tricapa'}
              {fin === 'solid' && 'Sólido Gloss'}
              {fin === 'matte' && 'Mate Satinado'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
