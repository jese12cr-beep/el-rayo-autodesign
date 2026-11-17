/* El Rayo — Motor de Pintura Automotriz WebGL2 Multi-Pieza (1280x720, preserveDrawingBuffer: true) */

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
uniform sampler2D u_mask;      // Alpha de máscara combinada
uniform sampler2D u_tintMap;   // RGB = color objetivo por pixel/pieza, A = opacidad de máscara local
uniform sampler2D u_finishMap; // R = finishIdx/3.0, G = metallic, B = specular, A = contrast/2.5
uniform float u_usePartMaps;
uniform vec3 u_color;
uniform float u_contrast;
uniform float u_metallic;
uniform float u_specular;
uniform float u_opacity;
uniform float u_finish; // 0.0=gloss, 1.0=metallic, 2.0=pearl, 3.0=matte
uniform float u_meanLum;
uniform vec2 u_resolution;

float flakeNoise(vec2 p) {
  vec2 cell = floor(p);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  return h - 0.5;
}

void main() {
  vec4 origSample = texture(u_image, v_uv);
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
      finishVal = floor(finSample.r * 3.0 + 0.5);
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

  // Luminancia perceptual Rec.709
  float lum = dot(orig, vec3(0.2126, 0.7152, 0.0722));

  // Normalización dinámica adaptada al vehículo (funciona igual en blancos, negros o color)
  float normLum = clamp((lum - u_meanLum) * contrastVal + 0.52, 0.14, 0.88);

  float targetLum = dot(targetColor, vec3(0.2126, 0.7152, 0.0722));
  float shadeGain = mix(0.65, 1.48, smoothstep(0.14, 0.88, normLum));
  vec3 basePaint = targetColor * (normLum * 1.55 + 0.08 * shadeGain);

  // Preserva líneas de volumen en colores oscuros (ej. Negro Obsidiana, Azul Medianoche)
  vec3 deepTint = targetColor * (0.24 + normLum * 0.95);
  basePaint = mix(deepTint, basePaint, smoothstep(0.04, 0.45, targetLum));

  // Acabado Perlado Tricapa
  if (abs(finishVal - 2.0) < 0.25) {
    float pearlFactor = smoothstep(0.25, 0.78, normLum);
    vec3 pearlShift = mix(vec3(0.92, 0.96, 1.06), vec3(1.06, 0.97, 0.88), v_uv.x * 0.6 + v_uv.y * 0.4);
    basePaint = mix(basePaint, basePaint * pearlShift + vec3(0.05 * pearlFactor), 0.35);
  }

  // Ruido procedural metálico (micro-partícula aluminio/perla)
  if (abs(finishVal - 1.0) < 0.25 || abs(finishVal - 2.0) < 0.25) {
    float flake = flakeNoise(gl_FragCoord.xy * 0.92);
    float sparkleMask = smoothstep(0.22, 0.84, normLum);
    float intensity = (abs(finishVal - 2.0) < 0.25 ? 0.10 : 0.16) * metallicVal;
    basePaint += flake * intensity * sparkleMask;
  }

  // Preservación de reflejos especulares blancos del barniz
  float rawSpec = smoothstep(0.78, 0.98, lum);
  float finishSpecScale = 1.0;
  if (abs(finishVal - 3.0) < 0.25) {
    finishSpecScale = 0.28;
    basePaint = mix(basePaint, vec3(dot(basePaint, vec3(0.299, 0.587, 0.114))), 0.06);
  } else if (abs(finishVal - 0.0) < 0.25) {
    finishSpecScale = 1.15;
  }

  float specMix = clamp(rawSpec * specularVal * finishSpecScale, 0.0, 0.95);
  vec3 painted = mix(clamp(basePaint, 0.0, 1.0), vec3(0.99, 0.995, 1.0), specMix);

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
      metallic: 0.60,
      specular: 0.85,
      opacity: 0.92
    };

    this.hasImage = false;
    this.usePartMaps = false;
    this.meanLum = 0.48;
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
      resolution: gl.getUniformLocation(program, "u_resolution")
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
    const xStart = Math.round(dx + dw * 0.22);
    const xEnd = Math.round(dx + dw * 0.78);
    const yStart = Math.round(dy + dh * 0.28);
    const yEnd = Math.round(dy + dh * 0.78);
    let lumSum = 0;
    let lumCount = 0;
    for (let y = yStart; y < yEnd; y += 6) {
      for (let x = xStart; x < xEnd; x += 6) {
        const idx = (y * this.width + x) << 2;
        const l = (0.2126 * px[idx] + 0.7152 * px[idx + 1] + 0.0722 * px[idx + 2]) / 255.0;
        lumSum += l;
        lumCount++;
      }
    }
    this.meanLum = lumCount > 0 ? Math.max(0.16, Math.min(0.80, lumSum / lumCount)) : 0.48;

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
    if (this.isWebGL2 && this.gl && maskCanvas) {
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    }
    this.render();
  }

  /**
   * Compone pintura base de carrocería + sobrescrituras de color/acabado por pieza individual.
   * Permite pintar ej. carrocería azul metálico + cofre negro mate al mismo tiempo en un solo paso GPU.
   */
  composePartPaints({ fullMaskCanvas, fullPaint, partPaintsMap, detectedParts }) {
    const tctx = this.tintCtx;
    const fctx = this.finishCtx;
    const sctx = this.partScratchCtx;

    tctx.clearRect(0, 0, this.width, this.height);
    fctx.clearRect(0, 0, this.width, this.height);

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
      const alphaOp = Math.max(0, Math.min(1, paintSpec.opacity ?? 0.92));

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

      const fR = Math.round((finishToIndex(paintSpec.finish) / 3) * 255);
      const fG = Math.round(Math.max(0, Math.min(1, paintSpec.metallic ?? 0.6)) * 255);
      const fB = Math.round(Math.max(0, Math.min(1, paintSpec.specular ?? 0.85)) * 255);
      const fA = Math.round(Math.max(0.2, Math.min(1, (paintSpec.contrast ?? 1.25) / 2.5)) * 255);

      sctx.clearRect(0, 0, this.width, this.height);
      sctx.fillStyle = `rgba(${fR}, ${fG}, ${fB}, ${(fA / 255).toFixed(3)})`;
      sctx.fillRect(0, 0, this.width, this.height);
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(maskC, 0, 0, this.width, this.height);
      sctx.globalCompositeOperation = "source-over";
      fctx.drawImage(this.partScratchCanvas, 0, 0);
    };

    if (fullMaskCanvas && fullPaint) {
      drawLayer(fullMaskCanvas, fullPaint);
    }

    for (const part of detectedParts || []) {
      const customPaint = partPaintsMap.get(part.id);
      if (customPaint && part.maskCanvas) {
        drawLayer(part.maskCanvas, customPaint);
      }
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
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
