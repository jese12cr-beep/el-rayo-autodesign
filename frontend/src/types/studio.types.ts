import { fabric } from 'fabric';

export type PaintFinish = 'solid' | 'metallic' | 'pearl' | 'matte';

export interface PieceLayer {
  id: string;
  name: string;
  fabricObject: fabric.Image;
  color: string;
  finish: PaintFinish;
  opacity: number;
  visible: boolean;
  locked: boolean;
  points: Array<{ x: number; y: number }>;
}

export interface SamBoxPrompt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SamPointPrompt {
  x: number;
  y: number;
  label: 1 | 0; // 1 = Foreground (part), 0 = Background
}

export type EditorTool = 'select' | 'sam_box' | 'sam_point' | 'sam_auto' | 'pen' | 'pan';

export interface PaintShaderOptions {
  color: string;
  finish: PaintFinish;
  opacity: number;
}

export interface AutoDetectedPiece {
  id: string;
  name: string;
  category: 'body' | 'hood' | 'door' | 'roof' | 'glass' | 'wheel';
  polygon: Array<{ x: number; y: number }>;
}
