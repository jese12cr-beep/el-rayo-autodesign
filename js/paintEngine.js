/* El Rayo — Motor de Pintura Automotriz WebGL2 (1280x720, preserveDrawingBuffer: true) */

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
uniform vec3 u_color;
uniform float u_contrast;
uniform float u_metallic;
uniform float u_specular;
uniform float u_opacity;
uniform float u_finish; // 0.0=gloss, 1.0=metallic, 2.0=pearl, 3.0=matte
uniform vec2 u_resolution;

float flakeNoise(vec2 p) {
  vec2 cell = floor(p);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  return h - 0.5;
}

void main() {
  vec4 origSample = texture(u_image, v_uv);
  vec3 orig = origSample.rgb;
  float mask = clamp(texture(u_mask, v_uv).r, 0.0, 1.0);

  if (mask <= 0.002) {
    outColor = origSample;
    return;
  }

  // Luminancia perceptual Rec.709
  float lum = dot(orig, vec3(0.2126, 0.7152, 0.0722));

  // Normalización dinámica para funcionar igual en autos blancos, negros o de color
  float normLum = clamp((lum - 0.5) * u_contrast + 0.52, 0.14, 0.88);

  // Curva tonal que respeta volumen de carrocería y evita lavado en colores oscuros o claros
  float targetLum = dot(u_color, vec3(0.2126, 0.7152, 0.0722));
  float shadeGain = mix(0.65, 1.48, smoothstep(0.14, 0.88, normLum));
  vec3 basePaint = u_color * (normLum * 1.55 + 0.08 * shadeGain);

  // En colores muy oscuros preservamos definición de líneas sin volverlos grises
  vec3 deepTint = u_color * (0.24 + normLum * 0.95);
  basePaint = mix(deepTint, basePaint, smoothstep(0.04, 0.45, targetLum));

  // Acabado Perlado Tricapa: ligera iridiscencia cálida/fría en ángulos medios
  if (abs(u_finish - 2.0) < 0.25) {
    float pearlFactor = smoothstep(0.25, 0.78, normLum);
    vec3 pearlShift = mix(vec3(0.92, 0.96, 1.06), vec3(1.06, 0.97, 0.88), v_uv.x * 0.6 + v_uv.y * 0.4);
    basePaint = mix(basePaint, basePaint * pearlShift + vec3(0.05 * pearlFactor), 0.35);
  }

  // Ruido procedural metálico en acabado metallic y perlado
  if (abs(u_finish - 1.0) < 0.25 || abs(u_finish - 2.0) < 0.25) {
    float flake = flakeNoise(gl_FragCoord.xy * 0.92);
    float sparkleMask = smoothstep(0.22, 0.84, normLum);
    float intensity = (abs(u_finish - 2.0) < 0.25 ? 0.10 : 0.16) * u_metallic;
    basePaint += flake * intensity * sparkleMask;
  }

  // Preservación de reflejos especulares blancos del barniz
  float rawSpec = smoothstep(0.78, 0.98, lum);
  float finishSpecScale = 1.0;
  if (abs(u_finish - 3.0) < 0.25) {
    // Mate satinado suaviza reflejos extremos
    finishSpecScale = 0.28;
    basePaint = mix(basePaint, vec3(dot(basePaint, vec3(0.299, 0.587, 0.114))), 0.06);
  } else if (abs(u_finish - 0.0) < 0.25) {
    finishSpecScale = 1.15;
  }

  float specMix = clamp(rawSpec * u_specular * finishSpecScale, 0.0, 0.95);
  vec3 painted = mix(clamp(basePaint, 0.0, 1.0), vec3(0.99, 0.995, 1.0), specMix);

  float blendAlpha = clamp(mask * u_opacity, 0.0, 1.0);
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

    this.options = {
      hex: "#DC2626",
      finish: "metallic",
      contrast: 1.25,
      metallic: 0.60,
      specular: 0.85,
      opacity: 0.92
    };

    this.hasImage = false;
    this.lastDrawRect = { x: 0, y: 0, w: width, h: height };
    this.isWebGL2 = false;
    this.gl = null;
    this.program = null;
    this.imageTex = null;
    this.maskTex = null;
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
    const blank = new Uint8Array(4);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);

    this.uniforms = {
      image: gl.getUniformLocation(program, "u_image"),
      mask: gl.getUniformLocation(program, "u_mask"),
      color: gl.getUniformLocation(program, "u_color"),
      contrast: gl.getUniformLocation(program, "u_contrast"),
      metallic: gl.getUniformLocation(program, "u_metallic"),
      specular: gl.getUniformLocation(program, "u_specular"),
      opacity: gl.getUniformLocation(program, "u_opacity"),
      finish: gl.getUniformLocation(program, "u_finish"),
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

    if (this.isWebGL2 && this.gl) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.stageCanvas);
    }

    this.render();
    return this.stageCtx.getImageData(0, 0, this.width, this.height);
  }

  updateMask(maskCanvas) {
    this.fallbackMaskCanvas = maskCanvas;
    if (this.isWebGL2 && this.gl && maskCanvas) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    }
    this.render();
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
    this.render();
  }

  _finishIndex() {
    switch (this.options.finish) {
      case "gloss": return 0.0;
      case "metallic": return 1.0;
      case "pearl": return 2.0;
      case "matte": return 3.0;
      default: return 1.0;
    }
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
      if (this.fallbackMaskCanvas) {
        ctx.save();
        ctx.globalAlpha = this.options.opacity * 0.65;
        ctx.globalCompositeOperation = "color";
        ctx.fillStyle = this.options.hex;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();
      }
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

    const [r, g, b] = hexToRgbNorm(this.options.hex);
    gl.uniform3f(this.uniforms.color, r, g, b);
    gl.uniform1f(this.uniforms.contrast, this.options.contrast);
    gl.uniform1f(this.uniforms.metallic, this.options.metallic);
    gl.uniform1f(this.uniforms.specular, this.options.specular);
    gl.uniform1f(this.uniforms.opacity, this.options.opacity);
    gl.uniform1f(this.uniforms.finish, this._finishIndex());
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
