/**
 * El Rayo AutoDesign Studio - 2.5D Mesh Warping Interactive Engine (JavaScript)
 * Module 4:
 * - Real-time Delaunay / Quad Mesh Warping for decals, logos, and racing stripes.
 * - Interactive draggable control vertices on Fabric.js canvas.
 * - Piecewise affine transformation mapping texture to body contours.
 */

class InteractiveMeshWarper {
  constructor(fabricCanvas) {
    this.canvas = fabricCanvas;
    this.rows = 4;
    this.cols = 4;
    this.vertices = [];
    this.controlHandles = [];
    this.gridLines = [];
    this.decalImage = null;
    this.meshCanvas = null;
    this.meshCtx = null;
    this.meshFabricObj = null;
    this.anchoredPartId = null;
    this.isActive = false;

    this._initOffscreenMeshCanvas();
  }

  _initOffscreenMeshCanvas() {
    this.meshCanvas = document.createElement('canvas');
    this.meshCanvas.width = 600;
    this.meshCanvas.height = 400;
    this.meshCtx = this.meshCanvas.getContext('2d');
  }

  /**
   * Load decal PNG image and initialize deformation mesh around it.
   */
  loadDecal(imageSrc, width = 360, height = 200, originX = 350, originY = 220) {
    console.log("InteractiveMeshWarper::loadDecal", imageSrc);
    this.isActive = true;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.decalImage = img;
      this.initGrid(this.rows, this.cols, width, height, originX, originY);
      this.renderWarpedDecal();
    };
    img.src = imageSrc;
  }

  /**
   * Construct control vertices and visual handles.
   */
  initGrid(rows, cols, width, height, originX, originY) {
    this.rows = rows;
    this.cols = cols;
    this.clearHandles();

    this.vertices = [];
    let id = 0;
    for (let r = 0; r < rows; r++) {
      const v = r / (rows - 1);
      const y = originY + v * height;
      for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1);
        const x = originX + u * width;
        this.vertices.push({
          id: id++,
          row: r,
          col: c,
          u: u,
          v: v,
          x: x,
          y: y
        });
      }
    }

    this._createHandleObjects();
    this._renderGridLines();
  }

  _createHandleObjects() {
    const warper = this;
    this.vertices.forEach(v => {
      // Create glowing cyan control handle
      const circle = new fabric.Circle({
        left: v.x,
        top: v.y,
        radius: 6,
        fill: '#00F2FE',
        stroke: '#FFFFFF',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        hasControls: false,
        hasBorders: false,
        hoverCursor: 'move',
        vertexId: v.id
      });

      circle.on('moving', function(e) {
        v.x = this.left;
        v.y = this.top;
        warper._renderGridLines();
        warper.renderWarpedDecal();
      });

      this.controlHandles.push(circle);
      this.canvas.add(circle);
    });
  }

  _renderGridLines() {
    // Clear old lines
    this.gridLines.forEach(line => this.canvas.remove(line));
    this.gridLines = [];

    const lineStyle = {
      stroke: 'rgba(0, 242, 254, 0.45)',
      strokeWidth: 1.5,
      strokeDashArray: [4, 4],
      selectable: false,
      evented: false
    };

    // Horizontal lines
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const v1 = this.vertices[r * this.cols + c];
        const v2 = this.vertices[r * this.cols + (c + 1)];
        const line = new fabric.Line([v1.x, v1.y, v2.x, v2.y], lineStyle);
        this.gridLines.push(line);
        this.canvas.add(line);
        this.canvas.sendToBack(line);
      }
    }

    // Vertical lines
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows - 1; r++) {
        const v1 = this.vertices[r * this.cols + c];
        const v2 = this.vertices[(r + 1) * this.cols + c];
        const line = new fabric.Line([v1.x, v1.y, v2.x, v2.y], lineStyle);
        this.gridLines.push(line);
        this.canvas.add(line);
        this.canvas.sendToBack(line);
      }
    }
  }

  /**
   * Piecewise affine warp of the decal image onto the offscreen canvas.
   */
  renderWarpedDecal() {
    if (!this.decalImage || !this.isActive) return;

    const ctx = this.meshCtx;
    const cw = this.canvas.getWidth();
    const ch = this.canvas.getHeight();

    if (this.meshCanvas.width !== cw || this.meshCanvas.height !== ch) {
      this.meshCanvas.width = cw;
      this.meshCanvas.height = ch;
    }

    ctx.clearRect(0, 0, cw, ch);

    const imgW = this.decalImage.width;
    const imgH = this.decalImage.height;

    // Render each quad as 2 triangles
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const p00 = this.vertices[r * this.cols + c];
        const p10 = this.vertices[r * this.cols + (c + 1)];
        const p01 = this.vertices[(r + 1) * this.cols + c];
        const p11 = this.vertices[(r + 1) * this.cols + (c + 1)];

        // Triangle 1: p00, p10, p01
        this._renderTriangle(ctx, this.decalImage,
          p00.u * imgW, p00.v * imgH,
          p10.u * imgW, p10.v * imgH,
          p01.u * imgW, p01.v * imgH,
          p00.x, p00.y, p10.x, p10.y, p01.x, p01.y
        );

        // Triangle 2: p10, p11, p01
        this._renderTriangle(ctx, this.decalImage,
          p10.u * imgW, p10.v * imgH,
          p11.u * imgW, p11.v * imgH,
          p01.u * imgW, p01.v * imgH,
          p10.x, p10.y, p11.x, p11.y, p01.x, p01.y
        );
      }
    }

    // Update or add Fabric.js image
    const dataUrl = this.meshCanvas.toDataURL();
    if (this.meshFabricObj) {
      this.meshFabricObj.setSrc(dataUrl, () => {
        this.canvas.renderAll();
      });
    } else {
      fabric.Image.fromURL(dataUrl, (fabImg) => {
        this.meshFabricObj = fabImg;
        this.meshFabricObj.set({
          selectable: false,
          evented: false
        });
        this.canvas.add(this.meshFabricObj);
        // Place below control handles
        this.canvas.bringToFront(this.meshFabricObj);
        this.controlHandles.forEach(h => this.canvas.bringToFront(h));
        this.canvas.renderAll();
      });
    }
  }

  /**
   * Affine transformation mapping between triangle UV and screen coordinates.
   */
  _renderTriangle(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
    ctx.save();
    // Clip path to destination triangle
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();

    // Compute Affine Matrix
    const denom = (sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0);
    if (Math.abs(denom) < 1e-5) {
      ctx.restore();
      return;
    }

    const m11 = - (sy0 * (dx2 - dx1) - sy1 * dx2 + sy2 * dx1 + (sy1 - sy2) * dx0) / denom;
    const m12 = (sy1 * dy2 - sy0 * (dy2 - dy1) - sy2 * dy1 - (sy1 - sy2) * dy0) / denom;
    const m21 = (sx0 * (dx2 - dx1) - sx1 * dx2 + sx2 * dx1 + (sx1 - sx2) * dx0) / denom;
    const m22 = - (sx1 * dy2 - sx0 * (dy2 - dy1) - sx2 * dy1 - (sx1 - sx2) * dy0) / denom;
    const dx = (sx0 * (sy2 * dx1 - sy1 * dx2) + sy0 * (sx1 * dx2 - sx2 * dx1) + (sx2 * sy1 - sx1 * sy2) * dx0) / denom;
    const dy = (sx0 * (sy2 * dy1 - sy1 * dy2) + sy0 * (sx1 * dy2 - sx2 * dy1) + (sx2 * sy1 - sx1 * sy2) * dy0) / denom;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  /**
   * Apply automated curvature deformation (Curvatura de Puerta, Salpicadera, Cofre)
   */
  applyPresetCurvature(preset) {
    console.log("InteractiveMeshWarper::applyPresetCurvature", preset);
    this.vertices.forEach(v => {
      if (preset === "door_convex") {
        // Curve outward in the center
        const bulge = 35 * Math.sin(Math.PI * v.v) * Math.sin(Math.PI * v.u);
        v.y += bulge;
      } else if (preset === "hood_scoop") {
        const bulge = 25 * Math.sin(Math.PI * v.u);
        v.y -= bulge;
      } else if (preset === "fender_curve") {
        v.x += 30 * Math.sin(Math.PI * v.u) * (1 - v.v);
      }
      // Update visual handles
      const handle = this.controlHandles[v.id];
      if (handle) {
        handle.set({ left: v.x, top: v.y });
      }
    });

    this._renderGridLines();
    this.renderWarpedDecal();
  }

  setGridResolution(res) {
    const sizeMap = [3, 4, 6];
    const n = sizeMap[res] || 4;
    this.initGrid(n, n, 360, 200, 350, 220);
    this.renderWarpedDecal();
  }

  clearHandles() {
    this.controlHandles.forEach(h => this.canvas.remove(h));
    this.controlHandles = [];
    this.gridLines.forEach(l => this.canvas.remove(l));
    this.gridLines = [];
  }
}
