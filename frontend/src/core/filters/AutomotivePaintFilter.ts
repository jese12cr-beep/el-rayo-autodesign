import { fabric } from 'fabric';
import { PaintFinish } from '../../types/studio.types';

export interface AutomotivePaintFilterOptions {
  color?: string;
  finish?: PaintFinish;
  opacity?: number;
}

/**
 * Filtro de pintura automotriz de grado industrial para Fabric.js.
 * Utiliza luminancia relativa y algoritmo compuesto Multiply + Overlay para
 * preservar la textura, sombras de pliegues y reflejos especulares de la chapa.
 */
export const AutomotivePaintFilter = fabric.util.createClass(fabric.Image.filters.BaseFilter, {
  type: 'AutomotivePaint',

  initialize: function (options?: AutomotivePaintFilterOptions) {
    options = options || {};
    this.color = options.color || '#C8102E';
    this.finish = options.finish || 'metallic';
    this.opacity = options.opacity !== undefined ? options.opacity : 0.88;
  },

  applyTo2d: function (options: { imageData: ImageData }) {
    const imageData = options.imageData;
    const data = imageData.data;
    const len = data.length;

    // Convertir color HEX a RGB
    const hex = (this.color || '#C8102E').replace('#', '');
    const tr = parseInt(hex.substring(0, 2), 16) || 200;
    const tg = parseInt(hex.substring(2, 4), 16) || 16;
    const tb = parseInt(hex.substring(4, 6), 16) || 46;

    const opacity = this.opacity !== undefined ? this.opacity : 0.88;
    const finish = this.finish || 'metallic';

    // Función auxiliar Overlay
    const overlay = (base: number, target: number): number => {
      return base < 128
        ? (2 * base * target) / 255
        : 255 - (2 * (255 - base) * (255 - target)) / 255;
    };

    for (let i = 0; i < len; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue; // Píxel recortado fuera de la máscara

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 1. Extraer Luminancia Relativa (Rec. 709)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // 2. Multiply: tiñe sombras y ranuras de la chapa
      const multR = (r * tr) / 255;
      const multG = (g * tg) / 255;
      const multB = (b * tb) / 255;

      // 3. Overlay: restaura contraste y volumen automotriz
      const overR = overlay(r, tr);
      const overG = overlay(g, tg);
      const overB = overlay(b, tb);

      // Fusión ponderada: 45% multiply + 55% overlay
      let outR = multR * 0.45 + overR * 0.55;
      let outG = multG * 0.45 + overG * 0.55;
      let outB = multB * 0.45 + overB * 0.55;

      // 4. Modulación según acabado (Shader)
      if (finish === 'metallic') {
        // Alza de micro-brillo metálico en altas luces
        if (lum > 135) {
          const flake = Math.pow((lum - 135) / 120, 2) * 58;
          outR = Math.min(255, outR + flake);
          outG = Math.min(255, outG + flake);
          outB = Math.min(255, outB + flake);
        }
      } else if (finish === 'pearl') {
        // Resplandor cálido en reflejos especulares
        if (lum > 125) {
          const pearl = ((lum - 125) / 130) * 42;
          outR = Math.min(255, outR + pearl * 1.12);
          outG = Math.min(255, outG + pearl * 0.96);
          outB = Math.min(255, outB + pearl * 0.76);
        }
      } else if (finish === 'matte') {
        // Atenuación suave de brillos especulares
        if (lum > 175) {
          const damp = (lum - 175) * 0.38;
          outR = Math.max(0, outR - damp);
          outG = Math.max(0, outG - damp);
          outB = Math.max(0, outB - damp);
        }
      }

      // 5. Interpolar entre original y tintado
      data[i] = Math.round(r * (1 - opacity) + outR * opacity);
      data[i + 1] = Math.round(g * (1 - opacity) + outG * opacity);
      data[i + 2] = Math.round(b * (1 - opacity) + outB * opacity);
    }
  }
});

// Registrar filtro en Fabric.js
(fabric.Image.filters as any).AutomotivePaint = AutomotivePaintFilter;
