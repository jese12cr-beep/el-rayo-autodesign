/**
 * El Rayo AutoDesign Studio - WebGL & Fabric.js 2D Vector Engine
 * Integrates:
 * - Module 2: SAM Vector masks rendering & part interaction
 * - Module 3: Real-time Automotive Paint Shaders & Blend Modes
 * - Module 4: 2.5D Interactive Grid Mesh Warper for Decals & Stripes
 */

let fabricCanvas = null;
let currentImageObject = null;
let partObjects = {};
let paintShader = null;
let meshWarper = null;
let activePartId = null;

window.addEventListener('DOMContentLoaded', () => {
  console.log("El Rayo AutoDesign Studio - Canvas Engine initialized.");

  const canvasElem = document.getElementById('rayoCanvas');
  const container = document.getElementById('canvas-container');

  // Initialize Fabric.js Canvas
  fabricCanvas = new fabric.Canvas('rayoCanvas', {
    selection: true,
    preserveObjectStacking: true,
    backgroundColor: 'transparent'
  });

  // Initialize Paint Shader and 2.5D Mesh Warper
  paintShader = new AutomotivePaintShader(fabricCanvas);
  meshWarper = new InteractiveMeshWarper(fabricCanvas);

  function resizeCanvas() {
    if (fabricCanvas && container) {
      fabricCanvas.setWidth(container.clientWidth);
      fabricCanvas.setHeight(container.clientHeight);
      fabricCanvas.renderAll();
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Part selection listener inside Canvas
  fabricCanvas.on('selection:created', onObjectSelected);
  fabricCanvas.on('selection:updated', onObjectSelected);
});

function onObjectSelected(e) {
  const activeObj = e.selected ? e.selected[0] : null;
  if (activeObj && activeObj.partId) {
    activePartId = activeObj.partId;
    console.log("Canvas part selected:", activePartId);

    activeObj.set({
      stroke: '#00F2FE',
      strokeWidth: 3
    });
    fabricCanvas.requestRenderAll();
  }
}

// Global API called from Python via QWebEngineView.page().runJavaScript()
window.RayoEngine = {
  // 1. Ingest car workshop photo
  loadVehicleImage: function(imageSrc) {
    console.log("RayoEngine::loadVehicleImage", imageSrc);
    const defaultSvg = document.getElementById('carSvg');
    if (defaultSvg) {
      defaultSvg.style.display = 'none';
    }

    fabric.Image.fromURL(imageSrc, function(img) {
      if (currentImageObject) {
        fabricCanvas.remove(currentImageObject);
      }
      currentImageObject = img;

      const canvasW = fabricCanvas.getWidth();
      const canvasH = fabricCanvas.getHeight();
      const scale = Math.min((canvasW * 0.88) / img.width, (canvasH * 0.85) / img.height);

      img.set({
        originX: 'center',
        originY: 'center',
        left: canvasW / 2,
        top: canvasH / 2,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false
      });

      fabricCanvas.add(img);
      fabricCanvas.sendToBack(img);
      fabricCanvas.requestRenderAll();
    });
  },

  // 2. Render SAM Segmented Vector Masks
  renderSegmentedMasks: function(masksData) {
    console.log("RayoEngine::renderSegmentedMasks", masksData);

    for (const pid in partObjects) {
      fabricCanvas.remove(partObjects[pid]);
    }
    partObjects = {};

    for (const partId in masksData) {
      const part = masksData[partId];
      if (!part.svg_path) continue;

      try {
        const pathObj = new fabric.Path(part.svg_path, {
          fill: part.color_hint || 'rgba(0, 242, 254, 0.25)',
          opacity: 0.45,
          stroke: part.color_hint || '#00F2FE',
          strokeWidth: 1.5,
          selectable: true,
          hasControls: true,
          partId: partId
        });

        partObjects[partId] = pathObj;
        fabricCanvas.add(pathObj);
      } catch (err) {
        console.warn("Error parsing SVG path for", partId, err);
      }
    }
    fabricCanvas.requestRenderAll();
  },

  // 3. Highlight specific part from Inspector selection
  highlightPart: function(partId) {
    activePartId = partId;
    console.log("RayoEngine::highlightPart", partId);
    if (partObjects[partId]) {
      fabricCanvas.setActiveObject(partObjects[partId]);
      partObjects[partId].set({
        stroke: '#FFFFFF',
        strokeWidth: 3,
        opacity: 0.7
      });
      fabricCanvas.requestRenderAll();
      setTimeout(() => {
        if (partObjects[partId]) {
          partObjects[partId].set({
            stroke: '#00F2FE',
            strokeWidth: 1.5,
            opacity: 0.45
          });
          fabricCanvas.requestRenderAll();
        }
      }, 900);
    }
  },

  // 4. Module 3: Apply Realistic Paint Shaders
  setPaintShader: function(config) {
    console.log("RayoEngine::setPaintShader", config);
    // Update HUD indicator
    const hud = document.getElementById('hud-shader');
    if (hud && config.finish_id) {
      hud.innerText = `SHADER: ${config.finish_id.toUpperCase()} (${(config.blend_mode || 'OVERLAY').toUpperCase()})`;
    }

    // Apply to selected part or all body panels
    const target = partObjects[activePartId] || fabricCanvas.getActiveObject();
    if (target && target.partId) {
      paintShader.applyShaderToMask(target, config);
    } else {
      // Apply to all parts if none specifically active
      for (const pid in partObjects) {
        if (pid !== "vidrios" && pid !== "rines") {
          paintShader.applyShaderToMask(partObjects[pid], config);
        }
      }
    }
  },

  // 5. Module 4: 2.5D Mesh Warper (Decals, Stripes, Logos)
  loadDecalGraphic: function(decalSrc) {
    console.log("RayoEngine::loadDecalGraphic", decalSrc);
    if (meshWarper) {
      meshWarper.loadDecal(decalSrc, 320, 180, 420, 240);
    }
  },

  applyMeshWarpPreset: function(presetName) {
    console.log("RayoEngine::applyMeshWarpPreset", presetName);
    if (meshWarper) {
      meshWarper.applyPresetCurvature(presetName);
    }
  },

  setMeshGridResolution: function(gridIdx) {
    console.log("RayoEngine::setMeshGridResolution", gridIdx);
    const hud = document.getElementById('hud-warp');
    const labels = ["3x3", "4x4", "6x6"];
    if (hud) hud.innerText = `MALLA 2.5D: ${labels[gridIdx] || '4x4'} BEZIER`;

    if (meshWarper) {
      meshWarper.setGridResolution(gridIdx);
    }
  },

  setAngle: function(angleId) {
    console.log("RayoEngine::setAngle", angleId);
  }
};
