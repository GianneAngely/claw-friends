// Shared look: toon materials, plum outlines, primitive helpers, mesh baking.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const C = {
  ink: 0x4A3A5E, white: 0xFFFFFF, pink1: 0xFFE2F1, pink2: 0xFFC9E6, pink3: 0xFFA8D4, pink5: 0xFF74B8,
  lav: 0xCDAEFF, lav2: 0xB08CFF, blue: 0x8ED8FF, blue2: 0xC2ECFF, mint: 0x7EEBC6, mint2: 0xC4F7E3,
  butter: 0xFFF19E, yellow: 0xFFE45A, gold: 0xFFC83D, cream: 0xFFF1B8, orange: 0xFF9E48, green: 0x93E27C,
  blush: 0xFF9EC4, straw: 0xFFD77A, hole: 0xB9A2F0, coral: 0xFF8A9E, peach: 0xFFCDB0,
};
export const INKS = "#4A3A5E";

// ---------- anime cel shading ----------
// Lit side = the flat base colour, shadow side = base tinted toward lavender with halftone screentone dots,
// a thin rim light on the edges. Only the sun's direct light decides lit vs shadow (cast shadows included).
export const ANIME = {
  uCut: { value: .12 }, uSoft: { value: .025 }, uSunI: { value: 1.5 },
  uShadowTint: { value: new THREE.Color(.74, .68, 1.0) }, uShadowSat: { value: 1.4 },
  uDotPx: { value: 7 }, uDotR: { value: .3 }, uDotAmt: { value: .8 },
  uRim: { value: new THREE.Color(.11, .1, .14) },
};
const ANIME_FRAG = `
  {
    vec3 base = diffuseColor.rgb;
    float lb = dot(base, vec3(.299, .587, .114)) * RECIPROCAL_PI * uSunI + 1e-4;
    float lit = dot(reflectedLight.directDiffuse, vec3(.299, .587, .114)) / lb;
    float t = smoothstep(uCut - uSoft, uCut + uSoft, lit) * uLitMix + (1.0 - uLitMix);
    vec3 sh = base * mix(vec3(1.0), uShadowTint, uShadowAmt);
    float sg = dot(sh, vec3(.299, .587, .114));
    sh = max(mix(vec3(sg), sh, uShadowSat), 0.0);
    vec2 q = gl_FragCoord.xy / uDotPx;
    q = vec2(q.x + q.y, q.y - q.x) * .7071;
    float dd = length(fract(q) - .5), rad = uDotR * (1.0 - t), aa = fwidth(dd) * 1.2;
    float dots = (1.0 - smoothstep(rad - aa, rad + aa, dd)) * step(.01, rad);
    sh = mix(sh, mix(sh, base, .6), dots * uDotAmt * uDots);
    vec3 col = mix(sh, base, t);
    float fres = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    col += uRim * uRimAmt * smoothstep(.6, .95, fres) * (.4 + .6 * t);
    outgoingLight = col;
  }
  #include <opaque_fragment>`;
function animeMat(c, opts = {}, shadowAmt = 1, dots = 1, rim = 1, litMix = 1) {
  const m = new THREE.MeshLambertMaterial({ color: c, ...opts });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, ANIME, { uShadowAmt: { value: shadowAmt }, uLitMix: { value: litMix }, uDots: { value: dots }, uRimAmt: { value: rim } });
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", `uniform float uCut, uSoft, uSunI, uShadowSat, uDotPx, uDotR, uDotAmt, uShadowAmt, uLitMix, uDots, uRimAmt;
uniform vec3 uShadowTint, uRim;
void main() {`)
      .replace("#include <opaque_fragment>", ANIME_FRAG);
  };
  m.customProgramCacheKey = () => "anime";
  return m;
}

const cache = new Map();
// skin: a lighter shadow so faces stay clean
export function toonSoft(c) {
  const k = "s" + c;
  if (!cache.has(k)) cache.set(k, animeMat(c, {}, .6, 0));
  return cache.get(k);
}
// characters: flat anime colours with one shadow tone and no screentone
export function toonFlat(c, shadow = .85) {
  const k = "c" + c + "_" + shadow;
  if (!cache.has(k)) cache.set(k, animeMat(c, {}, shadow, 0));
  return cache.get(k);
}
// material painted with a texture that carries its own drawn shading (Kyoko's hair): shown as drawn, like the face -
// the cel shadow and the rim light turned the hair's far side into over-saturated magenta streaks
export function toonTex(c, map) {
  const k = "x" + c + "_" + map.uuid;
  if (!cache.has(k)) cache.set(k, animeMat(c, { map }, 0, 0, 0, 0));
  return cache.get(k);
}
// the drawn hair in another colour: its base tone becomes `to`, darker lines a darker `to`, highlights go toward white
export function toonHair(map, from, to) {
  const k = "h" + map.uuid + "_" + to;
  if (cache.has(k)) return cache.get(k);
  const m = animeMat(0xFFFFFF, { map }, 0, 0, 0, 0), anime = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    anime(sh);
    Object.assign(sh.uniforms, { uFrom: { value: new THREE.Color(from) }, uTo: { value: new THREE.Color(to) } });
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform vec3 uFrom, uTo;\nvoid main() {")
      .replace("#include <map_fragment>", `#include <map_fragment>
  {
    const vec3 W = vec3(.2126, .7152, .0722);
    float l = dot(diffuseColor.rgb, W) / dot(uFrom, W);
    diffuseColor.rgb = l <= 1.0 ? uTo * l : mix(uTo, vec3(1.0), clamp((l - 1.0) / 2.5, 0.0, .85));
  }`);
  };
  m.customProgramCacheKey = () => "anime_hair";
  cache.set(k, m);
  return m;
}
export function toon(c, opts = {}) {
  const k = "t" + c + JSON.stringify(opts, (key, v) => (v && v.isTexture ? v.uuid : v));
  if (!cache.has(k)) cache.set(k, animeMat(c, opts));
  return cache.get(k);
}
// a copy of a material (or an outline's) whose surface dissolves in an ordered dither by its vertices' aId entry in
// fade.value (1 = solid, 0 = gone): for things baked together that fade one by one
const DITHER_FRAG = n => `uniform float uFade[${n}];
varying float vId;
float bayer4(vec2 p) {
  const float M[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  ivec2 i = ivec2(mod(p, 4.0));
  return (M[i.x + i.y * 4] + .5) / 16.0;
}
void main() {
  if (uFade[int(vId + .5)] < bayer4(gl_FragCoord.xy)) discard;`;
const DITHER_VERT = s => "attribute float aId;\nvarying float vId;\n" + s.replace("void main() {", "void main() {\n  vId = aId;");
export function dithered(mat, fade) {
  const k = "d" + mat.uuid;
  if (cache.has(k)) return cache.get(k);
  const m = mat.clone(), n = fade.value.length;
  if (mat.isShaderMaterial) {
    m.uniforms = { ...mat.uniforms, uFade: fade };   // (clone() copied px/res: they must stay the shared ones)
    m.vertexShader = DITHER_VERT(mat.vertexShader);
    m.fragmentShader = mat.fragmentShader.replace("void main() {", DITHER_FRAG(n));
  } else {
    const key = mat.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      mat.onBeforeCompile(sh, r);
      sh.uniforms.uFade = fade;
      sh.vertexShader = DITHER_VERT(sh.vertexShader);
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", DITHER_FRAG(n));
    };
    m.customProgramCacheKey = () => key + "_dither" + n;
  }
  cache.set(k, m);
  return m;
}
export function flat(c) {
  const k = "f" + c;
  if (!cache.has(k)) cache.set(k, new THREE.MeshBasicMaterial({ color: c }));
  return cache.get(k);
}

// Screen-space inverted-hull outline: same pixel width in every direction. The line colour is a deep,
// violet-leaning version of the surface colour (coloured line art, like anime illustrations).
export const outlineU = { px: { value: 2 }, res: { value: new THREE.Vector2(1, 1) } };
const OUTLINE_VERT = `
    uniform float px; uniform vec2 res;
    void main() {
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      vec2 d = (projectionMatrix * vec4(n, 0.0)).xy * res;
      float l = length(d);
      // push only near the silhouette: where the surface faces the camera its normal has no stable screen direction,
      // and the hull folded over into dark specks and scratches on the surface
      float edge = smoothstep(.15, .4, length(n.xy));
      if (l > 1e-6) clip.xy += (d / l) / res * 2.0 * px * clip.w * edge;
      gl_Position = clip;
    }`;
const OUTLINE_FRAG = `
    uniform vec3 color;
    void main() {
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }`;
const VIOLET = new THREE.Color(0x4B2E8A);
export function lineColor(c) {
  const col = new THREE.Color(c), hsl = {};
  col.getHSL(hsl, THREE.SRGBColorSpace);
  const dark = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * .85 + .3), hsl.l * .36 + .08, THREE.SRGBColorSpace);
  return dark.lerp(VIOLET, hsl.s < .08 ? .75 : .45);
}
const lineMats = new Map();
export function outlineMatFor(c) {
  const k = c === undefined ? "ink" : new THREE.Color(c).getHex();
  if (!lineMats.has(k)) lineMats.set(k, new THREE.ShaderMaterial({
    uniforms: { color: { value: c === undefined ? new THREE.Color(C.ink) : lineColor(c) }, px: outlineU.px, res: outlineU.res },
    side: THREE.BackSide, vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG,
  }));
  return lineMats.get(k);
}
// outline for skinned meshes: the same screen-space hull, deformed by the skeleton
const OUTLINE_SKIN_VERT = `
    #include <common>
    #include <skinning_pars_vertex>
    uniform float px; uniform vec2 res;
    void main() {
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      vec3 n = normalize(normalMatrix * objectNormal);
      vec2 d = (projectionMatrix * vec4(n, 0.0)).xy * res;
      float l = length(d);
      // push only near the silhouette: where the surface faces the camera its normal has no stable screen direction,
      // and the hull folded over into dark specks and scratches on the surface
      float edge = smoothstep(.15, .4, length(n.xy));
      if (l > 1e-6) clip.xy += (d / l) / res * 2.0 * px * clip.w * edge;
      gl_Position = clip;
    }`;
const skinLineMats = new Map();
export function outlineSkinnedFor(c, ink) {
  const k = new THREE.Color(c).getHex() + (ink === undefined ? "" : "i" + ink);
  if (!skinLineMats.has(k)) skinLineMats.set(k, new THREE.ShaderMaterial({
    uniforms: { color: { value: ink === undefined ? lineColor(c) : new THREE.Color(ink) }, px: outlineU.px, res: outlineU.res },
    side: THREE.BackSide, vertexShader: OUTLINE_SKIN_VERT, fragmentShader: OUTLINE_FRAG,
  }));
  return skinLineMats.get(k);
}
// ink: an explicit line colour instead of the one derived from the surface
export function outlineSkinned(m, color, ink) {
  const o = new THREE.SkinnedMesh(m.geometry, outlineSkinnedFor(color, ink));
  o.name = m.name + "_line";
  o.bind(m.skeleton, m.bindMatrix);
  o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale);
  o.frustumCulled = false; o.userData.isOutline = true; o.raycast = () => {};
  m.parent.add(o);
  return o;
}
export function outline(m) {
  const o = new THREE.Mesh(m.geometry, outlineMatFor(m.material && m.material.color));
  o.userData.isOutline = true;
  o.raycast = () => {};
  m.add(o);
  m.userData.lined = true;
  return m;
}

export const SPH = new THREE.SphereGeometry(1, 22, 16);
const SPH_MID = new THREE.SphereGeometry(1, 14, 10), SPH_LO = new THREE.SphereGeometry(1, 8, 6);
const sphFor = s => s < .07 ? SPH_LO : s < .2 ? SPH_MID : SPH;
export function mesh(geo, mat, x = 0, y = 0, z = 0, lined = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return lined ? outline(m) : m;
}
export function blob(c, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = mesh(sphFor(Math.max(sx, sy, sz)), typeof c === "number" ? toon(c) : c, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
export function dot(c, sx, sy, sz) {
  const m = mesh(sphFor(Math.max(sx, sy, sz)), flat(c), 0, 0, 0, false);
  m.castShadow = false;
  m.scale.set(sx, sy, sz);
  return m;
}
export function rbox(w, h, d, r, c, x, y, z) {
  return mesh(new RoundedBoxGeometry(w, h, d, 4, r), typeof c === "number" ? toon(c) : c, x, y, z);
}
export function tube(pts, r, mat, lined = true) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, 24, r, 10), mat, 0, 0, 0, lined);
}

const Z = new THREE.Vector3(0, 0, 1);
// Put a part on the front of an ellipsoid (semi-axes a,b,c) at (x,y), facing out.
export function stick(m, a, b, c, x, y, lift = 0) {
  const z = c * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - (y / b) ** 2));
  const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
  m.position.set(x, y, z).addScaledVector(n, lift);
  m.quaternion.setFromUnitVectors(Z, n);
  return m;
}
// Same, but for a point given by angle around Y (0 = front) at height y.
export function stickAround(m, a, b, c, ang, y, lift = 0) {
  const k = Math.sqrt(Math.max(0, 1 - (y / b) ** 2));
  const x = Math.sin(ang) * a * k, z = Math.cos(ang) * c * k;
  const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
  m.position.set(x, y, z).addScaledVector(n, lift);
  m.quaternion.setFromUnitVectors(Z, n);
  return m;
}

export function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const labelCache = new Map();
export function label(text, w, h, px, fill = "#fff", weight = 700) {
  const k = [text, w, h, px, fill, weight].join("|");
  if (labelCache.has(k)) return labelCache.get(k);
  const t = canvasTex(w, h, g => {
    g.font = `${weight} ${px}px Fredoka`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineJoin = "round"; g.lineWidth = px * 0.24; g.strokeStyle = INKS;
    g.strokeText(text, w / 2, h / 2 + px * 0.05);
    g.fillStyle = fill; g.fillText(text, w / 2, h / 2 + px * 0.05);
  });
  labelCache.set(k, t);
  return t;
}
export const glassMat = new THREE.MeshBasicMaterial({ color: 0xE3F2FA, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
export const shineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide });
export const acrylMat = new THREE.MeshBasicMaterial({ color: 0xFFE3EE, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide });
export function plane(tex, w, h, x, y, z, ry = 0, rx = 0) {
  if (!cache.has(tex.uuid)) cache.set(tex.uuid, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cache.get(tex.uuid));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  return m;
}
export function heartPath(g, cx, cy, s) {
  g.beginPath(); g.moveTo(cx, cy + s * .9);
  g.bezierCurveTo(cx - s * 1.6, cy - s * .1, cx - s * .8, cy - s * 1.25, cx, cy - s * .45);
  g.bezierCurveTo(cx + s * .8, cy - s * 1.25, cx + s * 1.6, cy - s * .1, cx, cy + s * .9);
  g.closePath();
}
export const sparkTex = canvasTex(128, 128, g => {
  g.translate(64, 64); g.beginPath();
  for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.moveTo(0, -54); g.quadraticCurveTo(8, -8, 54, 0); }
  g.fillStyle = "#FFE08A"; g.lineWidth = 9; g.strokeStyle = INKS; g.lineJoin = "round"; g.stroke(); g.fill();
});
export function sparkle(x, y, z, s) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true }));
  sp.position.set(x, y, z);
  sp.scale.setScalar(s);
  sp.userData.base = s;
  return sp;
}

// Merge every opaque mesh under `root` by material (keeps outlines), for fewer draw calls.
// idOf(mesh): an id per mesh, kept per vertex as attribute aId (for dithered())
export function bake(root, idOf) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map(), keep = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.isOutline) return;
    if (Array.isArray(o.material) || o.userData.noBake) { keep.push(o); return; }
    const key = o.material.uuid + (o.userData.lined ? "L" : "") + (o.castShadow ? "S" : "");
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, lined: !!o.userData.lined, cast: o.castShadow, geos: [] });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (idOf) g.setAttribute("aId", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(idOf(o)), 1));
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    m.castShadow = b.cast && !b.mat.transparent; m.receiveShadow = !b.mat.transparent;
    if (b.lined) outline(m);
    out.add(m);
  }
  for (const k of keep) {
    const rel = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
    k.removeFromParent();
    rel.decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  return out;
}
