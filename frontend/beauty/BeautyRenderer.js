/**
 * BeautyRenderer — GPU (WebGL) modular shader pipeline.
 * Maps to OpenGL ES on Android WebView / Metal via ANGLE on iOS WKWebView.
 * Vulkan: future WebGPU backend (placeholder method marked).
 *
 * @module beauty/BeautyRenderer
 */

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** Pass 1: color grade + soft glow + sharpen-ish unsharp */
const FRAG_GRADE = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_sharpen;
uniform float u_softLight;
uniform float u_glow;
uniform float u_whitening;
uniform float u_tone;
uniform float u_lut;
uniform float u_natural;

vec3 softLightBlend(vec3 base, vec3 blend) {
  return (1.0 - 2.0 * blend) * base * base + 2.0 * blend * base;
}

void main() {
  vec4 c = texture2D(u_tex, v_uv);
  vec3 col = c.rgb;

  // Whitening / tone (lift shadows toward warm porcelain)
  col = mix(col, col * vec3(1.05, 1.02, 1.0) + vec3(0.04), u_whitening * 0.55);
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), -u_tone * 0.25);
  col += vec3(0.02, 0.01, 0.0) * u_tone;

  // Contrast / saturation
  col = (col - 0.5) * (1.0 + u_contrast * 0.8) + 0.5;
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(g), col, 1.0 + u_saturation * 0.7);

  // Soft light + glow
  vec3 soft = softLightBlend(col, vec3(0.92, 0.88, 0.85));
  col = mix(col, soft, u_softLight * 0.65);
  col += vec3(u_glow * 0.08);

  // Simple sharpen via neighbor delta approx (single sample cheat + center boost)
  vec3 sharp = col * (1.0 + u_sharpen * 0.35);
  col = mix(col, sharp, u_sharpen);

  // LUT-ish warm teal-orange push
  col = mix(col, col * vec3(1.06, 1.0, 0.94), u_lut * 0.5);

  // Natural beauty subtle polish
  col = mix(col, col * 1.03 + 0.01, u_natural * 0.35);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Pass 2: face-masked skin smooth (box blur under oval mask from uniforms) */
const FRAG_SKIN = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_smooth;
uniform float u_maskX;
uniform float u_maskY;
uniform float u_maskRx;
uniform float u_maskRy;
uniform float u_eyeBright;
uniform float u_darkCircle;
uniform float u_lip;
uniform float u_teeth;
uniform vec2 u_eyeL;
uniform vec2 u_eyeR;
uniform vec2 u_mouth;
uniform float u_hasFace;

float faceMask(vec2 uv) {
  vec2 d = (uv - vec2(u_maskX, u_maskY)) / max(vec2(u_maskRx, u_maskRy), vec2(0.001));
  float e = dot(d, d);
  return clamp(1.0 - smoothstep(0.55, 1.15, e), 0.0, 1.0) * u_hasFace;
}

float circle(vec2 uv, vec2 c, float r) {
  return clamp(1.0 - smoothstep(r * 0.5, r, length(uv - c)), 0.0, 1.0);
}

void main() {
  vec4 src = texture2D(u_tex, v_uv);
  float m = faceMask(v_uv);

  // 5-tap blur for skin
  vec3 blur = src.rgb;
  blur += texture2D(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb;
  blur += texture2D(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb;
  blur += texture2D(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb;
  blur += texture2D(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb;
  blur += texture2D(u_tex, v_uv + u_texel).rgb;
  blur += texture2D(u_tex, v_uv - u_texel).rgb;
  blur /= 7.0;

  vec3 col = mix(src.rgb, blur, m * u_smooth * 0.85);

  // Bright eyes
  float el = circle(v_uv, u_eyeL, 0.045);
  float er = circle(v_uv, u_eyeR, 0.045);
  col += vec3(0.08) * (el + er) * u_eyeBright * u_hasFace;

  // Dark circle reduction under eyes
  float dl = circle(v_uv, u_eyeL + vec2(0.0, 0.035), 0.05);
  float dr = circle(v_uv, u_eyeR + vec2(0.0, 0.035), 0.05);
  col = mix(col, col * 1.08 + 0.02, (dl + dr) * 0.5 * u_darkCircle * u_hasFace);

  // Lip tint / teeth blobs removed — landmark circles floated and looked fake.
  // Keep uniforms for ABI compatibility; intensities are ignored.

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile: ' + log);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Shader link: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

export class BeautyRenderer {
  constructor() {
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {WebGLRenderingContext|null} */
    this.gl = null;
    this._gradeProg = null;
    this._skinProg = null;
    this._quad = null;
    this._texA = null;
    this._texB = null;
    this._fbo = null;
    this._w = 0;
    this._h = 0;
    this._backend = 'webgl'; // webgl | webgpu(future)
  }

  /**
   * PLACEHOLDER — future Vulkan/WebGPU path.
   * @returns {Promise<boolean>}
   */
  async initVulkanBackend() {
    // MARK: future WebGPU / Vulkan interop — not implemented
    return false;
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  init(width, height) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
    } else {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this._w = width;
    this._h = height;

    const gl =
      this.canvas.getContext('webgl', {
        alpha: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
      }) || this.canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL unavailable — BeautyRenderer requires GPU');

    this.gl = gl;
    this._gradeProg = link(gl, VERT, FRAG_GRADE);
    this._skinProg = link(gl, VERT, FRAG_SKIN);
    this._quad = this._createQuad(gl);
    this._texA = this._createTex(gl);
    this._texB = this._createTex(gl);
    this._fbo = gl.createFramebuffer();
    this._allocTex(this._texA, width, height);
    this._allocTex(this._texB, width, height);
    return this;
  }

  _createQuad(gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // pos.xy, uv.xy
    // eslint-disable-next-line
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW
    );
    return buf;
  }

  _createTex(gl) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  _allocTex(tex, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  _bindQuad(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    const pos = gl.getAttribLocation(prog, 'a_pos');
    const uv = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
  }

  /**
   * Upload video/canvas frame into texA.
   * @param {TexImageSource} source
   */
  uploadSource(source) {
    const gl = this.gl;
    const w = this._w;
    const h = this._h;
    if (source.videoWidth && (source.videoWidth !== w || source.videoHeight !== h)) {
      // keep process size stable; draw scaled via texImage2D stretch
    }
    gl.bindTexture(gl.TEXTURE_2D, this._texA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (_e) {
      return false;
    }
    return true;
  }

  /**
   * Landmark-guided face oval + feature points (normalized 0–1, origin top-left like MediaPipe).
   * @param {Float32Array|null} landmarks  [x0,y0,x1,y1,...] normalized
   */
  _faceUniformsFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 10) {
      return {
        hasFace: 0,
        maskX: 0.5,
        maskY: 0.45,
        maskRx: 0.28,
        maskRy: 0.36,
        eyeL: [0.38, 0.42],
        eyeR: [0.62, 0.42],
        mouth: [0.5, 0.62],
      };
    }
    // MediaPipe indices (approximate): 10 forehead, 152 chin, 33/263 eyes, 13 lips
    const idx = (i) => [landmarks[i * 2], landmarks[i * 2 + 1]];
    const get = (i, fb) => (i * 2 + 1 < landmarks.length ? idx(i) : fb);
    const forehead = get(10, [0.5, 0.28]);
    const chin = get(152, [0.5, 0.78]);
    const leftEye = get(33, [0.38, 0.42]);
    const rightEye = get(263, [0.62, 0.42]);
    const mouth = get(13, [0.5, 0.62]);
    const leftCheek = get(234, [0.28, 0.52]);
    const rightCheek = get(454, [0.72, 0.52]);
    const cx = (leftCheek[0] + rightCheek[0]) * 0.5;
    const cy = (forehead[1] + chin[1]) * 0.5;
    const rx = Math.max(0.12, Math.abs(rightCheek[0] - leftCheek[0]) * 0.55);
    const ry = Math.max(0.16, Math.abs(chin[1] - forehead[1]) * 0.55);
    return {
      hasFace: 1,
      maskX: cx,
      maskY: cy,
      maskRx: rx,
      maskRy: ry,
      eyeL: leftEye,
      eyeR: rightEye,
      mouth,
    };
  }

  /**
   * Run GPU passes. Output drawn to this.canvas.
   * @param {Record<string, number>} intensities 0..1
   * @param {Float32Array|null} landmarks
   */
  render(intensities, landmarks) {
    const gl = this.gl;
    if (!gl) return;
    const I = intensities || {};
    const face = this._faceUniformsFromLandmarks(landmarks);

    // Pass skin → texB via FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texB, 0);
    gl.viewport(0, 0, this._w, this._h);
    gl.useProgram(this._skinProg);
    this._bindQuad(this._skinProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texA);
    gl.uniform1i(gl.getUniformLocation(this._skinProg, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(this._skinProg, 'u_texel'), 1 / this._w, 1 / this._h);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_smooth'), I.skinSmoothing || 0);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_maskX'), face.maskX);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_maskY'), face.maskY);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_maskRx'), face.maskRx);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_maskRy'), face.maskRy);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_eyeBright'), I.brightEyes || 0);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_darkCircle'), I.darkCircles || 0);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_lip'), 0);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_teeth'), 0);
    gl.uniform2f(gl.getUniformLocation(this._skinProg, 'u_eyeL'), face.eyeL[0], face.eyeL[1]);
    gl.uniform2f(gl.getUniformLocation(this._skinProg, 'u_eyeR'), face.eyeR[0], face.eyeR[1]);
    gl.uniform2f(gl.getUniformLocation(this._skinProg, 'u_mouth'), face.mouth[0], face.mouth[1]);
    gl.uniform1f(gl.getUniformLocation(this._skinProg, 'u_hasFace'), face.hasFace);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass grade → screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this._w, this._h);
    gl.useProgram(this._gradeProg);
    this._bindQuad(this._gradeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texB);
    gl.uniform1i(gl.getUniformLocation(this._gradeProg, 'u_tex'), 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_contrast'), I.contrast || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_saturation'), I.saturation || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_sharpen'), I.sharpen || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_softLight'), I.softLight || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_glow'), I.glow || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_whitening'), I.skinWhitening || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_tone'), I.skinTone || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_lut'), I.colorLut || 0);
    gl.uniform1f(gl.getUniformLocation(this._gradeProg, 'u_natural'), I.naturalBeauty || 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Lightweight CPU mesh warp for reshape effects (face slim / eye enlarge).
   * Applied as a 2D canvas pass when reshape intensities > 0 (GPU warp mesh TODO).
   * MARK: placeholder for full GPU grid warp / commercial SDK reshape.
   */
  applyReshapePlaceholder(_intensities, _landmarks) {
    // Commercial SDKs (FaceUnity / Banuba) own high-quality reshape.
    // MediaPipe path currently relies on shader feature polish; full warp TBD.
  }

  dispose() {
    const gl = this.gl;
    if (gl) {
      try {
        gl.deleteProgram(this._gradeProg);
        gl.deleteProgram(this._skinProg);
        gl.deleteTexture(this._texA);
        gl.deleteTexture(this._texB);
        gl.deleteFramebuffer(this._fbo);
        gl.deleteBuffer(this._quad);
      } catch (_e) {}
    }
    this.gl = null;
    this.canvas = null;
  }
}
