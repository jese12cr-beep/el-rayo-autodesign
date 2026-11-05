import React from 'react';
import { Download, Sliders, Cpu } from 'lucide-react';

interface HeaderProps {
  vehicleAngles: Array<{ id: string; label: string; src: string }>;
  currentAngleId: string;
  onChangeAngle: (angleId: string) => void;
  onExport: () => void;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  vehicleAngles,
  currentAngleId,
  onChangeAngle,
  onExport,
  isProcessing
}) => {
  return (
    <header className="studio-header">
      <div className="header-brand">
        <div className="brand-logo-badge">⚡ EL RAYO</div>
        <div className="brand-titles">
          <h1>AUTODESIGN STUDIO</h1>
          <span className="brand-subtitle">React + Fabric.js + SAM Industrial Core</span>
        </div>
      </div>

      <div className="header-center">
        <div className="angle-selector-group">
          <label>Ángulo Fotográfico:</label>
          <select
            value={currentAngleId}
            onChange={(e) => onChangeAngle(e.target.value)}
            className="angle-select"
          >
            {vehicleAngles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ai-status-pill">
          <Cpu size={14} className={isProcessing ? 'spin-icon' : ''} />
          <span>{isProcessing ? 'SAM Procesando...' : 'Motor IA SAM: Listo'}</span>
        </div>
      </div>

      <div className="header-actions">
        <button className="header-action-btn export-btn" onClick={onExport}>
          <Download size={15} />
          <span>Exportar 4K</span>
        </button>
      </div>
    </header>
  );
};
