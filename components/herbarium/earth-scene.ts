import * as THREE from "three"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"

import { MONTREAL_ISLAND } from "@/lib/montreal-island"

/* Regional patch around the St. Lawrence valley (NASA Blue Marble) */
const PATCH = { latMin: 40, latMax: 51, lonMin: -81, lonMax: -66 }
/* Close-up patch around the island (Sentinel-2 cloudless) */
const HI = { latMin: 45.2, latMax: 45.9, lonMin: -74.2, lonMax: -73.2 }
/* Wider Sentinel-2 ring so the low orbit never shows blurry Blue Marble */
const MID = { latMin: 44.4, latMax: 47.0, lonMin: -76.2, lonMax: -71.2 }
/* Terrarium elevation tile z8/75/91 */
const tileLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 256))) * 180) / Math.PI
const DEM = { lonMin: (75 / 256) * 360 - 180, lonMax: (76 / 256) * 360 - 180, latTop: tileLat(91), latBottom: tileLat(92) }
const EXAGGERATION = 14

const ISLAND = MONTREAL_ISLAND.slice(0, -1)
const ISLAND_CENTER = (() => {
  const [sx, sy] = ISLAND.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0])
  return { lon: sx / ISLAND.length - 0.04, lat: sy / ISLAND.length - 0.01 }
})()

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const mercator = (lat: number) => {
  const l = (lat * Math.PI) / 180
  return Math.log(Math.tan(l) + 1 / Math.cos(l))
}

/** Same convention as THREE.SphereGeometry's UV layout. */
function latLonToVec3(lat: number, lon: number, r = 1) {
  const phi = ((lon + 180) / 180) * Math.PI
  const theta = ((90 - lat) / 180) * Math.PI
  return new THREE.Vector3(
    -Math.cos(phi) * Math.sin(theta) * r,
    Math.cos(theta) * r,
    Math.sin(phi) * Math.sin(theta) * r
  )
}

const sphereSegment = (b: typeof PATCH, r: number, w: number, h: number) =>
  new THREE.SphereGeometry(
    r,
    w,
    h,
    ((b.lonMin + 180) / 180) * Math.PI,
    ((b.lonMax - b.lonMin) / 180) * Math.PI,
    ((90 - b.latMax) / 180) * Math.PI,
    ((b.latMax - b.latMin) / 180) * Math.PI
  )

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vObj;
  void main() {
    vUv = uv;
    vObj = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform vec3 sunDir;
  uniform vec3 atmColor;
  uniform float nightStrength;
  uniform float dayGain;
  uniform vec2 uvOffset;
  uniform vec2 uvScale;
  uniform float isPatch;
  uniform float patchOpacity;
  uniform float rimGain;
  uniform float haze;
  uniform float edge;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;

  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vP);
    vec2 guv = uvOffset + vUv * uvScale;

    vec3 day = texture2D(dayMap, vUv).rgb * dayGain;
    if (isPatch < 0.5) {
      // polar caps: hide the equirectangular pinch with ice
      float ice = smoothstep(0.955, 0.985, vUv.y) + smoothstep(0.045, 0.015, vUv.y);
      day = mix(day, vec3(0.78, 0.82, 0.86), clamp(ice, 0.0, 1.0));
    }
    vec3 night = texture2D(nightMap, guv).rgb;
    float ocean = texture2D(specMap, guv).r;

    float ndl = dot(n, sunDir);
    float dayMix = smoothstep(-0.1, 0.25, ndl);

    vec3 lit = day * (max(ndl, 0.0) * 1.1 + 0.03);
    vec3 nightCol = night * vec3(1.0, 0.76, 0.46) * 1.6 * nightStrength;
    vec3 col = mix(nightCol, lit, dayMix);

    // sun glint on water
    vec3 h = normalize(sunDir + v);
    float s = pow(max(dot(n, h), 0.0), 160.0) * ocean * dayMix;
    col += vec3(1.0, 0.93, 0.82) * s * 0.3;

    // atmospheric haze at grazing angles
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
    col = mix(col, atmColor * (0.25 + 0.9 * smoothstep(-0.25, 0.6, ndl)), rim * 0.55 * rimGain);

    // aerial perspective in low orbit (pale, never saturated blue)
    float dist = length(cameraPosition - vP);
    col = mix(col, vec3(0.56, 0.63, 0.72), clamp((dist - 0.008) * 5.0, 0.0, 0.5) * haze);

    float alpha = 1.0;
    if (isPatch > 0.5) {
      vec2 e = smoothstep(vec2(0.0), vec2(edge), vUv) * smoothstep(vec2(0.0), vec2(edge), 1.0 - vUv);
      alpha = e.x * e.y * patchOpacity;
    }
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/* Close-up: Sentinel-2 imagery draped over exaggerated relief. */
const hiVertex = /* glsl */ `
  uniform sampler2D demMap;
  uniform vec4 box;     // lonMin, lonMax, latMin, latMax
  uniform vec4 demBox;  // lonMin, lonMax, mercTop, mercBottom
  uniform float exag;
  varying vec2 vUv;
  varying vec2 vDem;
  varying vec3 vN;
  varying vec3 vP;

  float merc(float lat) { float l = radians(lat); return log(tan(l) + 1.0 / cos(l)); }
  float height(vec2 d) {
    vec3 c = texture2D(demMap, d).rgb * 255.0;
    return max(0.0, c.r * 256.0 + c.g + c.b / 256.0 - 32768.0);
  }

  void main() {
    vUv = uv;
    float lon = mix(box.x, box.y, uv.x);
    float lat = mix(box.z, box.w, uv.y);
    vDem = vec2((lon - demBox.x) / (demBox.y - demBox.x), (merc(lat) - demBox.w) / (demBox.z - demBox.w));
    float h = height(vDem);
    vec3 pos = position * (1.0 + h / 6371000.0 * exag);
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vP = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const hiFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D demMap;
  uniform vec3 sunDir;
  uniform vec3 axis;
  uniform vec3 atmColor;
  uniform float opacity;
  uniform float exag;
  uniform float haze;
  varying vec2 vUv;
  varying vec2 vDem;
  varying vec3 vN;
  varying vec3 vP;

  float height(vec2 d) {
    vec3 c = texture2D(demMap, d).rgb * 255.0;
    return max(0.0, c.r * 256.0 + c.g + c.b / 256.0 - 32768.0);
  }

  void main() {
    vec3 up = normalize(vN);
    vec3 east = normalize(cross(axis, up));
    vec3 north = cross(up, east);

    // hillshade from the elevation tile (one texel is about 430 m)
    float e = 1.0 / 256.0;
    float dx = (height(vDem + vec2(e, 0.0)) - height(vDem - vec2(e, 0.0))) / 860.0;
    float dy = (height(vDem + vec2(0.0, e)) - height(vDem - vec2(0.0, e))) / 860.0;
    vec3 n = normalize(east * (-dx * exag * 0.5) + north * (-dy * exag * 0.5) + up);

    vec3 day = pow(texture2D(dayMap, vUv).rgb, vec3(0.92)) * 1.3;
    float ndl = max(dot(n, sunDir), 0.0);
    vec3 col = day * (0.2 + 1.05 * ndl);

    // aerial perspective
    float dist = length(cameraPosition - vP);
    col = mix(col, vec3(0.56, 0.63, 0.72), clamp((dist - 0.008) * 5.0, 0.0, 0.38) * haze);

    vec2 f = smoothstep(vec2(0.0), vec2(0.2), vUv) * smoothstep(vec2(0.0), vec2(0.2), 1.0 - vUv);
    gl_FragColor = vec4(col, f.x * f.y * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/* Procedural cloud deck: soft, domain-warped fbm on the sphere.
   The noise (≈20 fbm octaves per pixel) is far too heavy to evaluate per
   pixel every frame, so it is baked into equirectangular snapshots of the
   slowly evolving field. The globe crossfades between two snapshots while
   the next one is baked a few rows per frame (see `cloudDeck` below). */
const cloudBakeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const cloudBakeFragment = /* glsl */ `
  uniform float time;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return s;
  }

  void main() {
    // same layout as THREE.SphereGeometry's UVs
    float phi = vUv.x * 6.28318530718;
    float theta = (1.0 - vUv.y) * 3.14159265359;
    vec3 s = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));

    vec3 q = s * 2.4 + vec3(0.0, 0.0, time * 0.004);
    vec3 w = vec3(fbm(q * 1.2), fbm(q * 1.2 + 5.2), fbm(q * 1.2 + 9.7));
    float d = fbm(q * 1.6 + w * 1.4);

    // more cloud along storm tracks and the equator, less in the subtropics
    float lat = abs(s.y);
    float belt = 0.82 + 0.18 * smoothstep(0.35, 0.75, lat) + 0.12 * smoothstep(0.18, 0.0, lat) - 0.1 * smoothstep(0.85, 1.0, lat);
    float c = smoothstep(0.46, 0.72, d * belt);
    c *= 0.55 + 0.45 * smoothstep(0.3, 0.7, fbm(s * 14.0 + w * 2.0));
    gl_FragColor = vec4(c, c, c, 1.0);
  }
`

const cloudFragment = /* glsl */ `
  uniform sampler2D cloudPrev;
  uniform sampler2D cloudNext;
  uniform float cloudMix;
  uniform vec3 sunDir;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vN;

  void main() {
    float c = mix(texture2D(cloudPrev, vUv).r, texture2D(cloudNext, vUv).r, cloudMix);
    float ndl = dot(normalize(vN), sunDir);
    float lit = smoothstep(-0.18, 0.45, ndl);
    vec3 col = mix(vec3(0.03, 0.035, 0.05), vec3(1.0, 0.99, 0.97), lit);
    gl_FragColor = vec4(col, c * opacity * (0.2 + 0.8 * lit));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 atmColor;
  uniform float intensity;
  uniform float limb;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec3 n = normalize(vN);
    vec3 viewDir = normalize(vP - cameraPosition);
    float vd = dot(n, viewDir);
    float g = pow(smoothstep(0.0, limb, vd), 2.4);
    float lit = smoothstep(-0.5, 0.55, dot(n, sunDir));
    float fwd = pow(max(dot(viewDir, sunDir), 0.0), 5.0);
    float a = g * (lit * 0.85 + fwd * 2.4) * intensity;
    gl_FragColor = vec4(atmColor * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function createEarthScene({ section, stage, host, soil, caption, pin, final }: {
  section: HTMLElement
  stage: HTMLDivElement
  host: HTMLDivElement
  soil: HTMLDivElement | null
  caption: HTMLParagraphElement | null
  pin: HTMLDivElement | null
  final: HTMLDivElement | null
}) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production"
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.domElement.setAttribute("aria-hidden", "true")
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 200)

  /* textures ------------------------------------------------------ */
  // Decode off-thread, then upload bounded slices between frames.
  const gl = renderer.getContext() as WebGL2RenderingContext
  const anisoExt = gl.getExtension("EXT_texture_filter_anisotropic")
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  // The canvas is never more than 1600 device pixels wide (see resize), so
  // the 4K map is already sharper than the screen can show. The 8K map used
  // on wide screens cost ~170 MB of GPU memory and a much longer upload.
  const glTextures: WebGLTexture[] = []
  const pendingBitmaps = new Set<ImageBitmap>()
  type Job = { run: () => void; heavy: boolean; since: number }
  const jobs: Job[] = []
  const loads = new AbortController()
  let idle = 0
  let rushing = false
  // the Earth is on screen but not ready yet (fast scroll): drain faster
  const rush = () => visible && !ready
  // Warmup waits for a pause; texture and cloud slices can run during scroll.
  let lastScroll = 0
  const onPageScroll = () => { lastScroll = performance.now() }
  window.addEventListener("scroll", onPageScroll, { passive: true })
  const SCROLL_QUIET_MS = 180
  const HEAVY_MAX_WAIT_MS = 6000
  const pumpJobs = (idleDeadline?: IdleDeadline | number) => {
    idle = 0
    rushing = false
    if (disposed || !jobs.length) return
    const budget = typeof idleDeadline === "object" ? Math.min(4, idleDeadline.timeRemaining()) : 4
    const deadline = performance.now() + budget
    for (let n = 0; n < 6 && jobs.length && !disposed; n++) {
      const now = performance.now()
      const quiet = now - lastScroll >= SCROLL_QUIET_MS
      const index = rush() ? 0 : jobs.findIndex((job) => !job.heavy || quiet || now - job.since > HEAVY_MAX_WAIT_MS)
      if (index < 0) {
        // only heavy jobs left and the page is scrolling: check back shortly
        idleKind = "timeout"
        idle = setTimeout(pumpJobs, SCROLL_QUIET_MS) as unknown as number
        return
      }
      const job = jobs.splice(index, 1)[0]
      job.run()
      if (job.heavy || performance.now() >= deadline) break
    }
    if (jobs.length && !disposed) scheduleJobs()
  }
  let idleKind: "idle" | "timeout" | "frame" = "idle"
  const cancelJobs = () => {
    if (!idle) return
    if (idleKind === "frame") cancelAnimationFrame(idle)
    else if (idleKind === "timeout") clearTimeout(idle)
    else cancelIdleCallback(idle)
    idle = 0
    rushing = false
  }
  const scheduleJobs = () => {
    if (rush() && !rushing) {
      cancelJobs()
      rushing = true
      idleKind = "frame"
      idle = requestAnimationFrame(pumpJobs)
      return
    }
    if (idle) return
    if (typeof requestIdleCallback === "function") {
      idleKind = "idle"
      idle = requestIdleCallback(pumpJobs, { timeout: 1000 })
    } else {
      idleKind = "timeout"
      idle = setTimeout(pumpJobs, 50) as unknown as number
    }
  }
  const queueJob = (run: () => void, heavy = false) => {
    jobs.push({ run, heavy, since: performance.now() })
    scheduleJobs()
  }
  const UPLOAD_PIXELS = 256 * 1024
  const tex = (url: string, { srgb = true, mipmaps = true, priority = "auto" as RequestPriority } = {}) => {
    // three binds `sourceTexture` as is; until it's uploaded it samples black
    const t = new THREE.ExternalTexture(null)
    fetch(url, { signal: loads.signal, priority })
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob, {
        imageOrientation: "flipY",
        premultiplyAlpha: "none",
        colorSpaceConversion: srgb ? "default" : "none",
      }))
      .then((bitmap) => {
        if (disposed) return bitmap.close()
        pendingBitmaps.add(bitmap)
        queueJob(() => {
          const handle = gl.createTexture()
          glTextures.push(handle)
          gl.bindTexture(gl.TEXTURE_2D, handle)
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
          gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, srgb ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE)
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
          const format = srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8
          const rows = Math.max(1, Math.floor(UPLOAD_PIXELS / bitmap.width))
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
          if (mipmaps && anisoExt) gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso)
          const finish = () => {
            if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D)
            bitmap.close()
            pendingBitmaps.delete(bitmap)
            t.sourceTexture = handle
          }
          if (bitmap.height <= rows) {
            gl.texImage2D(gl.TEXTURE_2D, 0, format, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
            finish()
          } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, format, bitmap.width, bitmap.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
            for (let y = 0; y < bitmap.height; y += rows) {
              const height = Math.min(rows, bitmap.height - y)
              queueJob(() => {
                gl.bindTexture(gl.TEXTURE_2D, handle)
                gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y)
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, bitmap.width, height, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
                gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0)
                if (y + height === bitmap.height) finish()
                renderer.resetState()
              })
            }
          }
          renderer.resetState()
        })
      })
      .catch(() => {})
    return t
  }
  const dayTex = tex("/earth/day-4k.jpg", { priority: "high" })
  const nightTex = tex("/earth/night-4k.jpg")
  const specTex = tex("/earth/specular-2k.jpg", { srgb: false })
  const patchTex = tex("/earth/montreal-patch.jpg", { priority: "low" })
  const hiTex = tex("/earth/montreal-s2.webp", { priority: "low" })
  const demTex = tex("/earth/montreal-dem.png", { srgb: false, mipmaps: false, priority: "low" })
  const textures = [dayTex, nightTex, specTex, patchTex, hiTex, demTex]

  /* globe --------------------------------------------------------- */
  const sunDir = new THREE.Vector3(0, 0.3, -1).normalize()
  const atmColor = new THREE.Color("#c27a43")
  const axis = new THREE.Vector3(0, 1, 0)

  const globe = new THREE.Group()
  scene.add(globe)

  const earthUniforms = {
    dayMap: { value: dayTex },
    nightMap: { value: nightTex },
    specMap: { value: specTex },
    sunDir: { value: sunDir },
    atmColor: { value: atmColor },
    nightStrength: { value: 0 },
    dayGain: { value: 1.35 },
    uvOffset: { value: new THREE.Vector2(0, 0) },
    uvScale: { value: new THREE.Vector2(1, 1) },
    isPatch: { value: 0 },
    patchOpacity: { value: 1 },
    rimGain: { value: 1 },
    haze: { value: 0 },
    edge: { value: 0.12 },
  }
  const earthMat = new THREE.ShaderMaterial({
    uniforms: earthUniforms,
    vertexShader: earthVertex,
    fragmentShader: earthFragment,
  })
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMat))

  // regional patch, blended at its edges
  const patchMat = new THREE.ShaderMaterial({
    uniforms: {
      ...earthUniforms,
      dayMap: { value: patchTex },
      uvOffset: { value: new THREE.Vector2((PATCH.lonMin + 180) / 360, (PATCH.latMin + 90) / 180) },
      uvScale: {
        value: new THREE.Vector2((PATCH.lonMax - PATCH.lonMin) / 360, (PATCH.latMax - PATCH.latMin) / 180),
      },
      isPatch: { value: 1 },
      patchOpacity: { value: 0 },
    },
    vertexShader: earthVertex,
    fragmentShader: earthFragment,
    transparent: true,
    depthWrite: false,
  })
  const regionalPatch = new THREE.Mesh(sphereSegment(PATCH, 1.0004, 96, 96), patchMat)
  globe.add(regionalPatch)

  const midTex = tex("/earth/montreal-mid.webp", { priority: "low" })
  textures.push(midTex)
  const midMat = new THREE.ShaderMaterial({
    uniforms: {
      ...earthUniforms,
      dayMap: { value: midTex },
      dayGain: { value: 1.45 },
      uvOffset: { value: new THREE.Vector2((MID.lonMin + 180) / 360, (MID.latMin + 90) / 180) },
      uvScale: {
        value: new THREE.Vector2((MID.lonMax - MID.lonMin) / 360, (MID.latMax - MID.latMin) / 180),
      },
      isPatch: { value: 1 },
      patchOpacity: { value: 0 },
      edge: { value: 0.22 },
    },
    vertexShader: earthVertex,
    fragmentShader: earthFragment,
    transparent: true,
    depthWrite: false,
  })
  const midPatch = new THREE.Mesh(sphereSegment(MID, 1.0005, 96, 80), midMat)
  midPatch.renderOrder = 1
  globe.add(midPatch)

  // close-up patch with relief
  const hiMat = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: hiTex },
      demMap: { value: demTex },
      sunDir: { value: sunDir },
      axis: { value: axis },
      atmColor: { value: atmColor },
      opacity: { value: 0 },
      haze: { value: 0 },
      exag: { value: EXAGGERATION },
      box: { value: new THREE.Vector4(HI.lonMin, HI.lonMax, HI.latMin, HI.latMax) },
      demBox: {
        value: new THREE.Vector4(DEM.lonMin, DEM.lonMax, mercator(DEM.latTop), mercator(DEM.latBottom)),
      },
    },
    vertexShader: hiVertex,
    fragmentShader: hiFragment,
    transparent: true,
  })
  const hiPatch = new THREE.Mesh(sphereSegment(HI, 1.00002, 192, 160), hiMat)
  hiPatch.renderOrder = 2
  globe.add(hiPatch)

  // island of Montréal: soft fill + outline
  const island = new THREE.Group()
  globe.add(island)
  const islandR = 1.00012
  const contour = ISLAND.map(([lon, lat]) => new THREE.Vector2(lon, lat))
  const tris = THREE.ShapeUtils.triangulateShape(contour, [])
  const fillPos = new Float32Array(ISLAND.length * 3)
  ISLAND.forEach(([lon, lat], i) => fillPos.set(latLonToVec3(lat, lon, islandR).toArray(), i * 3))
  const fillGeo = new THREE.BufferGeometry()
  fillGeo.setAttribute("position", new THREE.BufferAttribute(fillPos, 3))
  fillGeo.setIndex(tris.flat())
  const fillMat = new THREE.MeshBasicMaterial({
    color: "#e7d6ff",
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: THREE.AdditiveBlending,
  })
  const fill = new THREE.Mesh(fillGeo, fillMat)
  fill.renderOrder = 5
  island.add(fill)

  const ring = [...ISLAND, ISLAND[0]].flatMap(([lon, lat]) => latLonToVec3(lat, lon, islandR).toArray())
  const outline = (width: number, color: string) => {
    const g = new LineGeometry()
    g.setPositions(ring)
    const m = new LineMaterial({
      color,
      linewidth: width,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })
    const l = new Line2(g, m)
    l.computeLineDistances()
    l.renderOrder = 6
    island.add(l)
    return m
  }
  const glowMat = outline(9, "#c9b2ff")
  const lineMat = outline(1.8, "#fff4dc")

  // cloud deck: the coverage field evolves slowly, so it is rendered into
  // snapshots STEP seconds apart and the globe crossfades between the two
  // current ones. Meanwhile the snapshot after those is baked a few rows per
  // frame (≈1/500 of the texture), so the heavy noise costs almost nothing
  // per frame instead of running for every pixel of the screen.
  const CLOUD_W = 2048
  const CLOUD_H = 1024
  const CLOUD_STEP = 8
  const cloudTargets = Array.from({ length: 3 }, () => {
    const target = new THREE.WebGLRenderTarget(CLOUD_W, CLOUD_H, {
      format: THREE.RedFormat,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    })
    target.texture.anisotropy = Math.min(4, maxAniso)
    // allocate the full mip chain now: later partial bakes turn mipmap
    // generation off, which must not shrink the texture's storage
    renderer.initRenderTarget(target)
    return target
  })
  const bakeScene = new THREE.Scene()
  const bakeMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: cloudBakeVertex,
    fragmentShader: cloudBakeFragment,
    depthTest: false,
    depthWrite: false,
  })
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat)
  bakeQuad.frustumCulled = false
  bakeScene.add(bakeQuad)

  // cloud clock: only advances while the clouds are actually on screen
  let cloudClock = performance.now() / 1000
  let snapshotTime = cloudClock // time of cloudTargets[0]; [1] is +STEP, [2] +2·STEP
  let bakedRows = 0 // progress of cloudTargets[2]
  const bakeRows = (target: THREE.WebGLRenderTarget, time: number, from: number, to: number) => {
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    bakeMat.uniforms.time.value = time
    target.scissorTest = true
    target.scissor.set(0, from, CLOUD_W, to - from)
    // rebuild the mip chain only once the snapshot is complete
    target.texture.generateMipmaps = to >= CLOUD_H
    renderer.setRenderTarget(target)
    renderer.render(bakeScene, camera)
    renderer.setRenderTarget(null)
    renderer.autoClear = autoClear
  }
  const advanceClouds = (dt: number) => {
    cloudClock += dt
    let f = (cloudClock - snapshotTime) / CLOUD_STEP
    if (f >= 1) {
      // the snapshot being built is due: finish it, then rotate the ring
      if (bakedRows < CLOUD_H) bakeRows(cloudTargets[2], snapshotTime + 2 * CLOUD_STEP, bakedRows, CLOUD_H)
      cloudTargets.push(cloudTargets.shift()!)
      snapshotTime += CLOUD_STEP
      bakedRows = 0
      // after a long pause, don't try to replay the missed snapshots
      if (cloudClock - snapshotTime >= CLOUD_STEP) cloudClock = snapshotTime
      f = (cloudClock - snapshotTime) / CLOUD_STEP
    }
    // stay ~25% ahead of schedule so the snapshot is ready before it's due
    const due = Math.min(CLOUD_H, Math.ceil(CLOUD_H * Math.min(1, f * 1.25)))
    if (due > bakedRows) {
      bakeRows(cloudTargets[2], snapshotTime + 2 * CLOUD_STEP, bakedRows, due)
      bakedRows = due
    }
    cloudMat.uniforms.cloudPrev.value = cloudTargets[0].texture
    cloudMat.uniforms.cloudNext.value = cloudTargets[1].texture
    cloudMat.uniforms.cloudMix.value = f
  }

  // compiled off the main thread where supported; the first two snapshots
  // are then baked in thin slices through the idle job queue (a full
  // snapshot is ~100+ ms of GPU work on a laptop: one go dropped frames)
  const INITIAL_ROWS_PER_JOB = 16
  const cloudsBaked = renderer.compileAsync(bakeScene, camera).then(() => new Promise<void>((resolve) => {
    for (let row = 0; row < 2 * CLOUD_H; row += INITIAL_ROWS_PER_JOB) {
      const index = row < CLOUD_H ? 0 : 1
      const from = row % CLOUD_H
      const to = Math.min(CLOUD_H, from + INITIAL_ROWS_PER_JOB)
      const since = performance.now()
      jobs.push({
        heavy: false,
        since,
        run: () => {
          bakeRows(cloudTargets[index], snapshotTime + index * CLOUD_STEP, from, to)
          if (index === 1 && to === CLOUD_H) resolve()
        },
      })
    }
    scheduleJobs()
  }))
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      cloudPrev: { value: cloudTargets[0].texture },
      cloudNext: { value: cloudTargets[1].texture },
      cloudMix: { value: 0 },
      sunDir: { value: sunDir },
      opacity: { value: 0.9 },
    },
    vertexShader: earthVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
  })
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.008, 96, 64), cloudMat)
  clouds.renderOrder = 3
  globe.add(clouds)

  // atmosphere shell
  const shellR = 1.09
  const atmMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: sunDir },
      atmColor: { value: atmColor },
      intensity: { value: 1.4 },
      limb: { value: Math.sqrt(1 - 1 / (shellR * shellR)) },
    },
    vertexShader: earthVertex,
    fragmentShader: atmosphereFragment,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(shellR, 64, 48), atmMat))

  // orientation that brings Montréal to face the camera, north up
  const mtl = latLonToVec3(ISLAND_CENTER.lat, ISLAND_CENTER.lon)
  const ry = Math.atan2(-mtl.x, mtl.z)
  const rx = Math.atan2(mtl.y, Math.hypot(mtl.x, mtl.z))
  const pinLocal = latLonToVec3(ISLAND_CENTER.lat + 0.02, ISLAND_CENTER.lon + 0.05, 1.0003)

  /* stars --------------------------------------------------------- */
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(2400 * 3)
  for (let i = 0; i < 2400; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 30)
    starPos.set([v.x, v.y, v.z], i * 3)
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({
    color: "#fff8ee",
    size: 1.8,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const stars = new THREE.Points(starGeo, starMat)
  scene.add(stars)

  /* sizing -------------------------------------------------------- */
  let width = 1
  let height = 1
  // cached document offset of the section: no layout reads in the frame loop
  let sectionTop = 0
  let sectionHeight = 1
  let pixelRatio = 0
  const resize = () => {
    const r = section.getBoundingClientRect()
    sectionTop = r.top + window.scrollY
    sectionHeight = r.height
    const w = stage.clientWidth || 1
    const h = stage.clientHeight || 1
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / Math.max(w, h))
    // resizing the canvas clears it and reallocates buffers: only when needed
    if (w === width && h === height && dpr === pixelRatio) return
    width = w
    height = h
    pixelRatio = dpr
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    glowMat.resolution.set(width, height)
    lineMat.resolution.set(width, height)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  ro.observe(document.documentElement)
  resize()

  let visible = false
  let ready = false
  let disposed = false
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible && jobs.length) scheduleJobs()
    if (!visible) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (ready && !document.hidden && !raf) {
      lastT = performance.now()
      raf = requestAnimationFrame(tick)
    }
  })
  io.observe(section)

  /* scroll choreography ------------------------------------------ */
  const amber = new THREE.Color("#c27a43")
  const blue = new THREE.Color("#5b95ff")
  const sunStart = new THREE.Vector3(0.0, 0.32, -1).normalize()
  const sunEnd = new THREE.Vector3(-0.55, 0.45, 0.7).normalize()
  const proj = new THREE.Vector3()
  const T = new THREE.Vector3()
  const U = new THREE.Vector3()
  const N = new THREE.Vector3()
  const E = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const orbitPos = new THREE.Vector3()
  const orbitUp = new THREE.Vector3()
  const globalPos = new THREE.Vector3()
  const look = new THREE.Vector3()
  const pinWorld = new THREE.Vector3()
  const styleCache = new WeakMap<HTMLElement, Record<string, string>>()
  const setStyle = (el: HTMLElement, prop: "opacity" | "transform", value: string) => {
    let cache = styleCache.get(el)
    if (!cache) styleCache.set(el, (cache = {}))
    if (cache[prop] === value) return
    cache[prop] = value
    el.style[prop] = value
  }

  let smoothP = 0
  let lastT = performance.now()
  let orbit = 0
  let raf = 0

  const tick = (now: number) => {
    raf = 0
    if (!ready || !visible || document.hidden) return
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.1, (now - lastT) / 1000)
    lastT = now
    drawFrame(now, dt)
  }
  /** One frame of the scroll choreography. `warm` skips the cloud clock. */
  const drawFrame = (now: number, dt: number, warm = false) => {
    const top = sectionTop - window.scrollY
    const pTarget = clamp01(-top / Math.max(1, sectionHeight - window.innerHeight))

    smoothP += (pTarget - smoothP) * (1 - Math.exp(-dt * 7))
    const p = smoothP

    const h = ease(seg(p, 0.04, 0.3)) // horizon → whole globe
    const spin = ease(seg(p, 0.08, 0.56))
    const z = ease(seg(p, 0.34, 0.64)) // whole globe → region
    const m = ease(seg(p, 0.64, 0.86)) // region → low orbit over the island
    const blend = ease(seg(p, 0.5, 0.64))

    // altitude in log space for a natural zoom
    const alt = Math.exp(
      THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(Math.log(3.05), Math.log(0.12), z),
        Math.log(0.013),
        m
      )
    )

    globe.position.y = THREE.MathUtils.lerp(-1.32, 0, h)
    globe.rotation.set(
      THREE.MathUtils.lerp(-0.35, rx, spin),
      THREE.MathUtils.lerp(ry + 1.9, ry, spin) + (1 - spin) * Math.sin(now * 0.00005) * 0.05,
      0
    )
    globe.updateMatrixWorld()
    axis.set(0, 1, 0).applyQuaternion(globe.quaternion)

    // local frame at the island
    T.copy(mtl).applyMatrix4(globe.matrixWorld)
    U.copy(T).sub(globe.position).normalize()
    E.crossVectors(axis, U).normalize()
    N.crossVectors(U, E)

    // global camera: on +z, looking at the globe's centre
    const camZ = THREE.MathUtils.lerp(2.2, 1 + alt, h)
    globalPos.set(0, 0, camZ)

    // orbit camera: tilts toward the horizon and circles the island
    if (!reduceMotion) orbit += dt * 0.07 * m
    const az = m * 0.55 + orbit
    const tilt = m * 0.92
    fwd.copy(N).multiplyScalar(Math.cos(az)).addScaledVector(E, Math.sin(az))
    orbitPos
      .copy(T)
      .addScaledVector(U, alt * Math.cos(tilt))
      .addScaledVector(fwd, -alt * Math.sin(tilt))
    orbitUp.copy(fwd).multiplyScalar(Math.cos(tilt)).addScaledVector(U, Math.sin(tilt)).normalize()

    camera.position.copy(globalPos).lerp(orbitPos, blend)
    look.set(0, 0, 0).lerp(T, blend)
    camera.up.set(0, 1, 0).lerp(orbitUp, blend).normalize()
    camera.lookAt(look)
    const d = camera.position.distanceTo(globe.position)
    camera.near = Math.max(0.0004, (d - 1.002) * 0.25)
    camera.far = blend > 0.5 ? d + 3 : 200
    camera.updateProjectionMatrix()

    clouds.rotation.y = now * 0.0000035

    sunDir.copy(sunStart).lerp(sunEnd, h).normalize()
    atmColor.copy(amber).lerp(blue, h)

    earthUniforms.nightStrength.value = h * (1 - z * 0.8)
    atmMat.uniforms.intensity.value = THREE.MathUtils.lerp(0.75, 1.25, h) * (1 - z * 0.6) * (1 - m * 0.8)
    cloudMat.uniforms.opacity.value = 0.92 * (1 - ease(seg(p, 0.46, 0.58)))
    clouds.visible = cloudMat.uniforms.opacity.value > 0.01
    // evolve the cloud field (and bake ahead) only while it can be seen
    if (clouds.visible && !warm) advanceClouds(dt)
    patchMat.uniforms.patchOpacity.value = ease(seg(p, 0.42, 0.56))
    midMat.uniforms.patchOpacity.value = ease(seg(p, 0.5, 0.62))
    hiMat.uniforms.opacity.value = ease(seg(p, 0.6, 0.72))
    regionalPatch.visible = patchMat.uniforms.patchOpacity.value > 0.001
    midPatch.visible = midMat.uniforms.patchOpacity.value > 0.001
    hiPatch.visible = hiMat.uniforms.opacity.value > 0.001
    // shared uniforms (globe + regional patch) and the two Sentinel layers
    earthUniforms.rimGain.value = 1 - m * 0.75
    earthUniforms.haze.value = m
    midMat.uniforms.rimGain.value = 1 - m * 0.75
    midMat.uniforms.haze.value = m
    hiMat.uniforms.haze.value = m
    starMat.opacity = 0.85 * (1 - ease(seg(p, 0.42, 0.62)))
    stars.visible = starMat.opacity > 0

    // island highlight: no blinking, it simply settles in
    const glow = ease(seg(p, 0.72, 0.84))
    island.visible = glow > 0
    fillMat.opacity = glow * 0.16
    glowMat.opacity = glow * 0.35
    lineMat.opacity = glow * 0.95

    renderer.render(scene, camera)

    // overlays (only touched when a value actually changes)
    if (soil) {
      const s = seg(p, 0.0, 0.14)
      setStyle(soil, "opacity", (1 - ease(s)).toFixed(3))
      // a compositor-only transform instead of animating mask-position,
      // which repainted the full-screen soil texture every frame
      setStyle(soil, "transform", `translate3d(0, ${(-s * 30).toFixed(2)}vh, 0)`)
    }
    if (caption) {
      setStyle(caption, "opacity", (1 - seg(p, 0.05, 0.14)).toFixed(3))
    }
    if (pin) {
      const opacity = ease(seg(p, 0.78, 0.88))
      setStyle(pin, "opacity", opacity.toFixed(3))
      if (opacity > 0) {
        pinWorld.copy(pinLocal).applyMatrix4(globe.matrixWorld)
        proj.copy(pinWorld).project(camera)
        const x = (proj.x * 0.5 + 0.5) * width
        const y = (-proj.y * 0.5 + 0.5) * height
        setStyle(pin, "transform", `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`)
      }
    }
    if (final) {
      const f = ease(seg(p, 0.86, 0.96))
      setStyle(final, "opacity", f.toFixed(3))
      setStyle(final, "transform", `translateY(${((1 - f) * 28).toFixed(1)}px)`)
    }
  }
  void Promise.all([renderer.compileAsync(scene, camera), cloudsBaked]).then(() => {
    if (disposed) return
    // Warm-up: one throwaway frame while the Earth is still off screen. The
    // very first draw uploads every mesh's buffers, validates each program
    // and allocates the canvas's drawing buffer — over 100 ms on a large
    // (ultrawide) display, which used to land on the first visible frame.
    queueJob(() => {
      const culled: THREE.Object3D[] = []
      scene.traverse((o) => {
        if (o.frustumCulled) {
          o.frustumCulled = false
          culled.push(o)
        }
      })
      camera.position.set(0, 0, 3)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
      culled.forEach((o) => (o.frustumCulled = true))
      // Then draw the real frame for the current scroll position, so the
      // canvas never holds the throwaway view: it stays on screen until the
      // first visible frame and would flash a wrongly placed globe.
      drawFrame(performance.now(), 1, true)
      // Warm the canvas's presentation buffers before scrolling reaches it.
      const snapshots = [createImageBitmap(renderer.domElement)]
      for (let i = 1; i < 3; i++) {
        renderer.render(scene, camera)
        snapshots.push(createImageBitmap(renderer.domElement))
      }
      void Promise.allSettled(snapshots).then((results) => {
        for (const result of results) if (result.status === "fulfilled") result.value.close()
      })
      ready = true
      if (visible && !document.hidden && !raf) {
        lastT = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }, true)
  })
  const onVisibility = () => {
    cancelAnimationFrame(raf)
    raf = 0
    if (ready && visible && !document.hidden) {
      lastT = performance.now()
      raf = requestAnimationFrame(tick)
    }
  }
  document.addEventListener("visibilitychange", onVisibility)

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    loads.abort()
    cancelJobs()
    jobs.length = 0
    pendingBitmaps.forEach((bitmap) => bitmap.close())
    pendingBitmaps.clear()
    window.removeEventListener("scroll", onPageScroll)
    ro.disconnect()
    io.disconnect()
    document.removeEventListener("visibilitychange", onVisibility)
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    textures.forEach((t) => t.dispose())
    glTextures.forEach((t) => gl.deleteTexture(t))
    cloudTargets.forEach((t) => t.dispose())
    bakeQuad.geometry.dispose()
    bakeMat.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
