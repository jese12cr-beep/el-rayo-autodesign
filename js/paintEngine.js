/* El Rayo — Motor PBR WebGL2 Automotriz Multi-Pieza (Clearcoat, Color-Flop, Sparkle & Split Wipe) */

const VERTEX_SHADER_SRC = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform sampler2D u_tintMap;
uniform sampler2D u_finishMap;
uniform float u_usePartMaps;

uniform vec3 u_color;
uniform float u_contrast;
uniform float u_metallic;
uniform float u_specular;
uniform float u_opacity;
uniform float u_finish; // 0=gloss, 1=metallic, 2=pearl, 3=matte, 4=candy
uniform float u_meanLum;
uniform float u_p15Lum;
uniform float u_p85Lum;
uniform vec2 u_resolution;

uniform float u_splitEnabled;
uniform float u_splitPos;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 sampleLumaGrad(vec2 uv) {
  vec2 texel = 1.5 / max(u_resolution, vec2(1.0));
  float lR = dot(texture(u_image, uv + vec2(texel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float lL = dot(texture(u_image, uv - vec2(texel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float lD = dot(texture(u_image, uv + vec2(0.0, texel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float lU = dot(texture(u_image, uv - vec2(0.0, texel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
  return vec2(lR - lL, lD - lU);
}

// Curva fílmica suave que conserva juntas de lámina y sombras profundas sin lavar tonos medios
float automotiveToneCurve(float lum, float p15, float p85, float contrast) {
  float span = max(0.22, p85 - p15);
  float rel = (lum - u_meanLum) / (span * 1.15);
  float curved = 0.52 + (rel * contrast) * 0.34;
  // Compresión suave en extremos evitando corte plano en autos muy oscuros o blancos
  float s = clamp(curved, 0.04, 1.18);
  return mix(s, s * s * (3.0 - 2.0 * min(s, 1.0)), 0.25);
}

void main() {
  vec4 origSample = texture(u_image, v_uv);

  // Comparador en tiempo real Antes / Después (Antes a la izquierda de u_splitPos)
  if (u_splitEnabled > 0.5 && v_uv.x < u_splitPos) {
    outColor = origSample;
    return;
  }

  vec3 orig = origSample.rgb;
  vec3 targetColor = u_color;
  float finishVal = u_finish;
  float metallicVal = u_metallic;
  float specularVal = u_specular;
  float contrastVal = u_contrast;
  float opacityVal = u_opacity;
  float mask = clamp(max(texture(u_mask, v_uv).r, texture(u_mask, v_uv).a), 0.0, 1.0);

  if (u_usePartMaps > 0.5) {
    vec4 tintSample = texture(u_tintMap, v_uv);
    vec4 finSample = texture(u_finishMap, v_uv);
    mask = clamp(tintSample.a, 0.0, 1.0);
    if (mask > 0.002) {
      targetColor = tintSample.rgb;
      finishVal = floor(finSample.r * 4.0 + 0.5);
      metallicVal = finSample.g;
      specularVal = finSample.b;
      contrastVal = max(0.5, finSample.a * 2.5);
      opacityVal = 1.0;
    }
  }

  if (mask <= 0.002) {
    outColor = origSample;
    return;
  }

  float lum = dot(orig, vec3(0.2126, 0.7152, 0.0722));
  float maxC = max(orig.r, max(orig.g, orig.b));
  float minC = min(orig.r, min(orig.g, orig.b));
  float origChroma = maxC - minC;

  // Gradiente superficial local para detectar curvas, juntas (shutlines) y reflejos direccionales
  vec2 grad = sampleLumaGrad(v_uv);
  float edgeEnergy = clamp(length(grad) * 6.5, 0.0, 1.0);

  // Iluminación normalizada adaptada al vehículo
  float toneLum = clamp(automotiveToneCurve(lum, u_p15Lum, u_p85Lum, contrastVal), 0.07, 1.08);
  // Conserva sombras de juntas de cofres/puertas (ambient occlusion natural)
  float panelCreaseAO = smoothstep(0.01, 0.16, lum);
  float targetLum = dot(targetColor, vec3(0.2126, 0.7152, 0.0722));

  // Flop cromático automotriz real: sombras ricas + tono medio OEM + cara iluminada limpia
  vec3 shadowFlop = pow(max(targetColor, vec3(0.015)), vec3(1.32)) * 0.72;
  vec3 facingHighlight = mix(targetColor, sqrt(max(targetColor, vec3(0.001))), 0.28);

  float midWeight = smoothstep(0.10, 0.62, toneLum);
  float highWeight = smoothstep(0.58, 1.04, toneLum);
  vec3 flopAlbedo = mix(shadowFlop, targetColor, midWeight);
  flopAlbedo = mix(flopAlbedo, facingHighlight, highWeight * 0.55);

  // Intensidad física según iluminación del estudio
  float lightMul = mix(0.32, 1.48, clamp(toneLum, 0.0, 1.0));
  vec3 basePaint = flopAlbedo * lightMul;

  // Protección especial de definición para blancos/claros y negros profundos
  vec3 deepDark = targetColor * (0.28 + clamp(toneLum, 0.0, 1.0) * 1.15);
  basePaint = mix(deepDark, basePaint, smoothstep(0.03, 0.35, targetLum));
  basePaint *= mix(0.68, 1.0, panelCreaseAO);

  // Acabado Candy Profundo (u_finish == 4): base metálica luminosa + barniz hiper-saturado
  if (abs(finishVal - 4.0) < 0.25) {
    vec3 candyBoost = pow(max(targetColor, vec3(0.02)), vec3(0.82)) * 1.18;
    float innerGlow = smoothstep(0.30, 0.85, toneLum);
    basePaint = mix(shadowFlop * 0.65, candyBoost * (0.55 + toneLum * 0.95), innerGlow);
  }

  // Acabado Perlado Tricapa (u_finish == 2): cambio iridiscente guiado por normal/curvatura
  if (abs(finishVal - 2.0) < 0.25) {
    float slopeFactor = clamp(grad.x * 4.0 - grad.y * 3.5 + (v_uv.x - 0.5) * 0.6, -1.0, 1.0);
    vec3 pearlWarm = vec3(1.09, 0.98, 0.86);
    vec3 pearlCool = vec3(0.88, 0.97, 1.12);
    vec3 pearlTint = mix(pearlCool, pearlWarm, slopeFactor * 0.5 + 0.5);
    float fresnelBand = smoothstep(0.24, 0.86, toneLum) * (0.35 + 0.65 * edgeEnergy);
    basePaint = mix(basePaint, basePaint * pearlTint + vec3(0.045 * fresnelBand), 0.48);
  }

  // Micro-partículas metálicas bicapa (dos escalas rotadas en zonas iluminadas)
  if (abs(finishVal - 1.0) < 0.25 || abs(finishVal - 2.0) < 0.25 || abs(finishVal - 4.0) < 0.25) {
    vec2 p1 = gl_FragCoord.xy * 0.85;
    vec2 p2 = mat2(0.8, -0.6, 0.6, 0.8) * (gl_FragCoord.xy * 1.65);
    float f1 = hash12(floor(p1)) - 0.5;
    float f2 = hash12(floor(p2)) - 0.5;
    float glint = smoothstep(0.28, 0.49, abs(f1)) * sign(f1) * 0.65 + f2 * 0.35;
    float lightGate = smoothstep(0.26, 0.86, toneLum) * (1.0 - edgeEnergy * 0.45);
    float metWeight = abs(finishVal - 1.0) < 0.25 ? 0.19 : 0.12;
    basePaint += mix(vec3(1.0), targetColor, 0.25) * glint * metWeight * metallicVal * lightGate;
  }

  // Laca / Barniz especular dual-lobe (conserva reflejos de cielo/estudio y suprime en Mate Stealth)
  float neutMask = 1.0 - smoothstep(0.14, 0.52, origChroma);
  float realWorldGlare = smoothstep(0.66, 0.97, lum) * mix(0.42, 1.0, neutMask);
  float curveSpecular = smoothstep(0.78, 0.99, toneLum) * (0.35 + 0.65 * edgeEnergy);
  float combinedSpec = max(realWorldGlare, curveSpecular * 0.55);

  float finishSpecScale = 1.05;
  if (abs(finishVal - 3.0) < 0.25) {
    // Mate Satinado / Stealth PPF: suprime brillos duros y resalta biseles satinados
    finishSpecScale = 0.16;
    float grayBase = dot(basePaint, vec3(0.299, 0.587, 0.114));
    basePaint = mix(basePaint, vec3(grayBase), 0.05) + vec3(edgeEnergy * 0.045 * toneLum);
  } else if (abs(finishVal - 0.0) < 0.25 || abs(finishVal - 4.0) < 0.25) {
    finishSpecScale = 1.25;
  }

  float specMix = clamp(combinedSpec * specularVal * finishSpecScale, 0.0, 0.96);
  vec3 clearcoatColor = mix(vec3(0.97, 0.985, 1.0), facingHighlight, 0.10);
  vec3 painted = mix(clamp(basePaint, 0.0, 1.0), clearcoatColor, specMix);

  float blendAlpha = clamp(mask * opacityVal, 0.0, 1.0);
  outColor = vec4(mix(orig, painted, blendAlpha), origSample.a);
}
`;

export function hexToRgbNorm(hex) {
  const clean = (hex || "#dc2626").replace("#", "").trim();
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [0.86, 0.15, 0.15];
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255
  ];
}

export function finishToIndex(finish) {
  switch (finish) {
    case "gloss": return 0;
    case "metallic": return 1;
    case "pearl": return 2;
    case "matte": return 3;
    case "candy": return 4;
    default: return 1;
  }
}

export class PaintEngine {
  constructor(canvas, width = 1280, height = 720) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    this.stageCanvas = document.createElement("canvas");
    this.stageCanvas.width = width;
    this.stageCanvas.height = height;
    this.stageCtx = this.stageCanvas.getContext("2d", { willReadFrequently: true });

    this.tintCanvas = document.createElement("canvas");
    this.tintCanvas.width = width;
    this.tintCanvas.height = height;
    this.tintCtx = this.tintCanvas.getContext("2d");

    this.finishCanvas = document.createElement("canvas");
    this.finishCanvas.width = width;
    this.finishCanvas.height = height;
    this.finishCtx = this.finishCanvas.getContext("2d");

    this.partScratchCanvas = document.createElement("canvas");
    this.partScratchCanvas.width = width;
    this.partScratchCanvas.height = height;
    this.partScratchCtx = this.partScratchCanvas.getContext("2d");

    this.options = {
      hex: "#DC2626",
      finish: "metallic",
      contrast: 1.25,
      metallic: 0.65,
      specular: 0.88,
      opacity: 0.94
    };

    this.hasImage = false;
    this.usePartMaps = false;
    this.meanLum = 0.48;
    this.p15Lum = 0.18;
    this.p85Lum = 0.78;
    this.splitEnabled = false;
    this.splitPos = 0.5;
    this.lastDrawRect = { x: 0, y: 0, w: width, h: height };
    this.isWebGL2 = false;
    this.gl = null;
    this.program = null;
    this.imageTex = null;
    this.maskTex = null;
    this.tintTex = null;
    this.finishTex = null;
    this.fallbackMaskCanvas = null;

    this._initGL();
  }

  _initGL() {
    const gl = this.canvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      alpha: true,
      antialias: true
    });

    if (!gl) {
      this.isWebGL2 = false;
      return;
    }

    const vs = this._compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      this.isWebGL2 = false;
      return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Error enlazando shader WebGL2:", gl.getProgramInfoLog(program));
      this.isWebGL2 = false;
      return;
    }

    this.gl = gl;
    this.program = program;
    this.isWebGL2 = true;

    const quadVerts = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "a_pos");
    const uvLoc = gl.getAttribLocation(program, "a_uv");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
    this.vao = vao;

    this.imageTex = this._createTexture(gl);
    this.maskTex = this._createTexture(gl);
    this.tintTex = this._createTexture(gl);
    this.finishTex = this._createTexture(gl);

    const blank = new Uint8Array(4);
    [this.imageTex, this.maskTex, this.tintTex, this.finishTex].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);
    });

    this.uniforms = {
      image: gl.getUniformLocation(program, "u_image"),
      mask: gl.getUniformLocation(program, "u_mask"),
      tintMap: gl.getUniformLocation(program, "u_tintMap"),
      finishMap: gl.getUniformLocation(program, "u_finishMap"),
      usePartMaps: gl.getUniformLocation(program, "u_usePartMaps"),
      color: gl.getUniformLocation(program, "u_color"),
      contrast: gl.getUniformLocation(program, "u_contrast"),
      metallic: gl.getUniformLocation(program, "u_metallic"),
      specular: gl.getUniformLocation(program, "u_specular"),
      opacity: gl.getUniformLocation(program, "u_opacity"),
      finish: gl.getUniformLocation(program, "u_finish"),
      meanLum: gl.getUniformLocation(program, "u_meanLum"),
      p15Lum: gl.getUniformLocation(program, "u_p15Lum"),
      p85Lum: gl.getUniformLocation(program, "u_p85Lum"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      splitEnabled: gl.getUniformLocation(program, "u_splitEnabled"),
      splitPos: gl.getUniformLocation(program, "u_splitPos")
    };
  }

  _compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Error compilando shader WebGL2:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  _createTexture(gl) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  setSplitCompare(enabled, posNorm = 0.5) {
    this.splitEnabled = Boolean(enabled);
    this.splitPos = Math.max(0.05, Math.min(0.95, Number(posNorm) || 0.5));
    this.render();
  }

  calibrateToneFromMask(maskCanvas) {
    if (!this.hasImage || !maskCanvas) return;
    const mctx = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!mctx) return;
    const imgData = this.stageCtx.getImageData(0, 0, this.width, this.height).data;
    const mData = mctx.getImageData(0, 0, this.width, this.height).data;
    const samples = [];
    for (let i = 0; i < imgData.length; i += 4 * 11) {
      if (mData[i + 3] > 128) {
        const l = (0.2126 * imgData[i] + 0.7152 * imgData[i + 1] + 0.0722 * imgData[i + 2]) / 255.0;
        samples.push(l);
      }
    }
    if (samples.length < 40) return;
    samples.sort((a, b) => a - b);
    const n = samples.length;
    this.p15Lum = samples[Math.floor(n * 0.15)];
    this.meanLum = samples[Math.floor(n * 0.50)];
    this.p85Lum = samples[Math.min(n - 1, Math.floor(n * 0.85))];
  }

  setImage(img) {
    const ctx = this.stageCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#0c0e12";
    ctx.fillRect(0, 0, this.width, this.height);

    const iw = img.naturalWidth || img.width || this.width;
    const ih = img.naturalHeight || img.height || this.height;
    const scale = Math.min(this.width / iw, this.height / ih);
    const dw = Math.round(iw * scale);
    const dh = Math.round(ih * scale);
    const dx = Math.round((this.width - dw) / 2);
    const dy = Math.round((this.height - dh) / 2);

    ctx.drawImage(img, dx, dy, dw, dh);
    this.lastDrawRect = { x: dx, y: dy, w: dw, h: dh };
    this.hasImage = true;

    const imgData = this.stageCtx.getImageData(0, 0, this.width, this.height);
    const px = imgData.data;
    const xStart = Math.round(dx + dw * 0.20);
    const xEnd = Math.round(dx + dw * 0.80);
    const yStart = Math.round(dy + dh * 0.25);
    const yEnd = Math.round(dy + dh * 0.80);
    const lums = [];
    for (let y = yStart; y < yEnd; y += 6) {
      for (let x = xStart; x < xEnd; x += 6) {
        const idx = (y * this.width + x) << 2;
        lums.push((0.2126 * px[idx] + 0.7152 * px[idx + 1] + 0.0722 * px[idx + 2]) / 255.0);
      }
    }
    if (lums.length) {
      lums.sort((a, b) => a - b);
      this.p15Lum = lums[Math.floor(lums.length * 0.15)];
      this.meanLum = lums[Math.floor(lums.length * 0.50)];
      this.p85Lum = lums[Math.floor(lums.length * 0.85)];
    }

    if (this.isWebGL2 && this.gl) {
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.stageCanvas);
    }

    this.render();
    return imgData;
  }

  updateMask(maskCanvas) {
    this.usePartMaps = false;
    this.fallbackMaskCanvas = maskCanvas;
    if (maskCanvas) this.calibrateToneFromMask(maskCanvas);
    if (this.isWebGL2 && this.gl && maskCanvas) {
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    }
    this.render();
  }

  composePartPaints({ fullMaskCanvas, fullPaint, partPaintsMap, detectedParts }) {
    const tctx = this.tintCtx;
    const fctx = this.finishCtx;
    const sctx = this.partScratchCtx;

    tctx.clearRect(0, 0, this.width, this.height);
    fctx.clearRect(0, 0, this.width, this.height);

    if (fullMaskCanvas) this.calibrateToneFromMask(fullMaskCanvas);

    const hasPartOverrides = partPaintsMap && partPaintsMap.size > 0;
    if (!hasPartOverrides) {
      this.usePartMaps = false;
      this.fallbackMaskCanvas = fullMaskCanvas;
      if (this.isWebGL2 && this.gl && fullMaskCanvas) {
        const gl = this.gl;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fullMaskCanvas);
      }
      if (fullPaint) Object.assign(this.options, fullPaint);
      this.render();
      return;
    }

    const drawLayer = (maskC, paintSpec) => {
      if (!maskC || !paintSpec) return;
      const alphaOp = Math.max(0, Math.min(1, paintSpec.opacity ?? 0.94));

      sctx.clearRect(0, 0, this.width, this.height);
      sctx.globalCompositeOperation = "source-over";
      sctx.globalAlpha = 1;
      sctx.fillStyle = paintSpec.hex || "#DC2626";
      sctx.fillRect(0, 0, this.width, this.height);
      sctx.globalCompositeOperation = "destination-in";
      sctx.globalAlpha = alphaOp;
      sctx.drawImage(maskC, 0, 0, this.width, this.height);
      sctx.globalCompositeOperation = "source-over";
      sctx.globalAlpha = 1;
      tctx.drawImage(this.partScratchCanvas, 0, 0);

      const fR = Math.round((finishToIndex(paintSpec.finish) / 4) * 255);
      const fG = Math.round(Math.max(0, Math.min(1, paintSpec.metallic ?? 0.65)) * 255);
      const fB = Math.round(Math.max(0, Math.min(1, paintSpec.specular ?? 0.88)) * 255);
      const fA = Math.round(Math.max(0.2, Math.min(1, (paintSpec.contrast ?? 1.25) / 2.5)) * 255);

      sctx.clearRect(0, 0, this.width, this.height);
      sctx.fillStyle = `rgba(${fR}, ${fG}, ${fB}, ${(fA / 255).toFixed(3)})`;
      sctx.fillRect(0, 0, this.width, this.height);
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(maskC, 0, 0, this.width, this.height);
      sctx.globalCompositeOperation = "source-over";
      fctx.drawImage(this.partScratchCanvas, 0, 0);
    };

    if (fullMaskCanvas && fullPaint) drawLayer(fullMaskCanvas, fullPaint);
    for (const part of detectedParts || []) {
      const customPaint = partPaintsMap.get(part.id);
      if (customPaint && part.maskCanvas) drawLayer(part.maskCanvas, customPaint);
    }

    this.usePartMaps = true;
    this.fallbackMaskCanvas = fullMaskCanvas;

    if (this.isWebGL2 && this.gl) {
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.tintTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.tintCanvas);
      gl.bindTexture(gl.TEXTURE_2D, this.finishTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.finishCanvas);
    }

    this.render();
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
    this.render();
  }

  render() {
    if (!this.hasImage) {
      if (this.isWebGL2 && this.gl) {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.clearColor(0.047, 0.055, 0.071, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      return;
    }

    if (!this.isWebGL2 || !this.gl) {
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.drawImage(this.stageCanvas, 0, 0);
      return;
    }

    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.uniform1i(this.uniforms.image, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.uniforms.mask, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tintTex);
    gl.uniform1i(this.uniforms.tintMap, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.finishTex);
    gl.uniform1i(this.uniforms.finishMap, 3);

    const [r, g, b] = hexToRgbNorm(this.options.hex);
    gl.uniform1f(this.uniforms.usePartMaps, this.usePartMaps ? 1.0 : 0.0);
    gl.uniform3f(this.uniforms.color, r, g, b);
    gl.uniform1f(this.uniforms.contrast, this.options.contrast);
    gl.uniform1f(this.uniforms.metallic, this.options.metallic);
    gl.uniform1f(this.uniforms.specular, this.options.specular);
    gl.uniform1f(this.uniforms.opacity, this.options.opacity);
    gl.uniform1f(this.uniforms.finish, Number(finishToIndex(this.options.finish)));
    gl.uniform1f(this.uniforms.meanLum, this.meanLum);
    gl.uniform1f(this.uniforms.p15Lum, this.p15Lum);
    gl.uniform1f(this.uniforms.p85Lum, this.p85Lum);
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);
    gl.uniform1f(this.uniforms.splitEnabled, this.splitEnabled ? 1.0 : 0.0);
    gl.uniform1f(this.uniforms.splitPos, this.splitPos);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
