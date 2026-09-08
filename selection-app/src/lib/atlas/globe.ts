/**
 * AtlasGlobe — true WebGL 3D globe (three.js), ported from the design
 * handoff's <atlas-globe-3d> prototype engine. Same behaviour and public API:
 * setPins / setSubPins / setFocus / setSelected / setOptions / flyTo / zoomBy /
 * reset, plus pin-select and deselect callbacks.
 *
 *  - Telephoto zoom: the camera stays at a fixed distance and the field of
 *    view narrows, which keeps the texture-resolution maths exact.
 *  - Proximity pin-picking: a tap selects the nearest pin within 20px; pins
 *    themselves never take pointer events, so dragging always works.
 *  - Drag to turn, wheel or pinch to zoom, slow idle drift.
 *  - A tap on empty ocean while something is selected deselects.
 *  - Labels are collision-culled per frame; the selected or hovered pin
 *    always keeps its label.
 *
 * This module pulls in three.js, so import it lazily (see AtlasGlobe.tsx).
 */

import * as THREE from "three";
import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { merge } from "topojson-client";
import type { Topology, GeometryCollection, Polygon, MultiPolygon } from "topojson-specification";
import type { MultiPolygon as GeoMultiPolygon } from "geojson";

export interface GlobePin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Mint pin with a full label; otherwise a quiet grey dot. */
  featured: boolean;
}

export interface GlobeOptions {
  drift: boolean;
  graticule: boolean;
  lockDrag: boolean;
  lockZoom: boolean;
}

export interface GlobeConfig {
  geoUrl?: string;
  geoHiUrl?: string;
  onPinSelect?: (id: string) => void;
  onDeselect?: () => void;
  /** Initial view (lat, lon, zoom). Defaults to the Mediterranean. */
  home?: { lat: number; lon: number; zoom: number };
}

interface PinState extends GlobePin {
  sub?: boolean;
  _el?: HTMLDivElement;
  _parts?: { label: HTMLDivElement; stem: HTMLDivElement; dot: HTMLDivElement };
  _anchor?: THREE.Object3D;
  _xy?: [number, number];
  _pickable?: boolean;
  _dimmed?: boolean;
  _hover?: boolean;
  _limb?: number;
  _fade?: number;
  _born?: number;
}

type CountriesTopology = Topology<{ countries: GeometryCollection }>;

const d2r = Math.PI / 180;
const MINT = "#A7E6D7";
const OCEAN = "#10171A";
const LAND = "#2A3438";
const FONT = '"Gotham","Helvetica Neue",Arial,sans-serif';
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 8;
const CAMERA_D = 3.2;

const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

export class AtlasGlobe {
  private host: HTMLElement;
  private glWrap: HTMLDivElement;
  private pinLayer: HTMLDivElement;
  private cfg: GlobeConfig;
  private home: { lat: number; lon: number; zoom: number };

  private yaw: number;
  private pitch: number;
  private zoom = 1;
  private pins: PinState[] = [];
  private subPins: PinState[] = [];
  private selected: string | null = null;
  private focus: Set<string> | null = null;
  private opts: GlobeOptions = { drift: true, graticule: true, lockDrag: false, lockZoom: false };
  private idleAt = 0;
  private anim: { start: number } | null = null;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private pitchG!: THREE.Group;
  private yawG!: THREE.Group;
  private sphereMat!: THREE.MeshPhongMaterial;
  private detail: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial> | null = null;
  private detailKey: string | null = null;
  private detailBuiltAt = 0;
  private topo: CountriesTopology | null = null;
  private landMerged: GeoMultiPolygon | null = null;
  private texW = 2048;
  private texGrat = true;

  private w = 0;
  private h = 0;
  private raf = 0;
  private lastFrameAt = 0;
  private ro: ResizeObserver | null = null;
  private destroyed = false;
  private downPin: PinState | null = null;
  private dragged = false;
  private unbind: Array<() => void> = [];

  constructor(host: HTMLElement, cfg: GlobeConfig = {}) {
    this.host = host;
    this.cfg = cfg;
    this.home = cfg.home ?? { lat: 38, lon: 12, zoom: 1 };
    this.yaw = -Math.PI / 2 - this.home.lon * d2r;
    this.pitch = this.home.lat * d2r;

    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.style.touchAction = "pan-y";
    host.style.userSelect = "none";
    (host.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";

    this.glWrap = document.createElement("div");
    Object.assign(this.glWrap.style, { position: "absolute", inset: "0" });
    this.pinLayer = document.createElement("div");
    Object.assign(this.pinLayer.style, { position: "absolute", inset: "0", overflow: "hidden", pointerEvents: "none" });
    host.appendChild(this.glWrap);
    host.appendChild(this.pinLayer);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.bindPointer();
    void this.init();
  }

  destroy() {
    this.destroyed = true;
    this.stopLoop();
    this.ro?.disconnect();
    for (const off of this.unbind) off();
    this.unbind = [];
    for (const p of this.pins.concat(this.subPins)) p._anchor?.removeFromParent();
    if (this.detail) {
      this.detail.geometry.dispose();
      this.detail.material.map?.dispose();
      this.detail.material.dispose();
    }
    this.sphereMat?.map?.dispose();
    this.sphereMat?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.glWrap.remove();
    this.pinLayer.remove();
  }

  /* ------------------------------------------------------------ lifecycle */

  private startLoop() {
    if (!this.renderer) return;
    if (this.raf) cancelAnimationFrame(this.raf);
    const loop = (t: number) => {
      this.lastFrameAt = t;
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  ensureRunning() {
    if (!this.renderer || this.destroyed) return;
    if (!this.raf || performance.now() - this.lastFrameAt > 1000) this.startLoop();
  }

  private async init() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.glWrap.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, CAMERA_D);

    // Lighting: upper-left key plus a low mint-tinted ambient.
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2.4, 2.2, 3.0);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0xbfd8d2, 0.32));

    // Globe group: pitch (X) parent → yaw (Y) child.
    this.pitchG = new THREE.Group();
    this.yawG = new THREE.Group();
    this.pitchG.add(this.yawG);
    this.scene.add(this.pitchG);
    this.sphereMat = new THREE.MeshPhongMaterial({ shininess: 18, specular: new THREE.Color(0x2a4a44), color: new THREE.Color(OCEAN) });
    this.yawG.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), this.sphereMat));

    // Mint atmosphere halo — a sprite behind the globe.
    const haloCv = document.createElement("canvas");
    haloCv.width = haloCv.height = 256;
    const hctx = haloCv.getContext("2d")!;
    const hg = hctx.createRadialGradient(128, 128, 86, 128, 128, 128);
    hg.addColorStop(0, "rgba(167,230,215,0.22)");
    hg.addColorStop(0.55, "rgba(167,230,215,0.06)");
    hg.addColorStop(1, "rgba(167,230,215,0)");
    hctx.fillStyle = hg;
    hctx.fillRect(0, 0, 256, 256);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCv), transparent: true, depthWrite: false }));
    halo.scale.set(2.62, 2.62, 1);
    halo.renderOrder = -1;
    this.scene.add(halo);

    // Pins created before the scene existed get their anchors now.
    for (const p of this.pins.concat(this.subPins)) this.anchorPin(p);

    this.resize();
    if (!this.destroyed) this.startLoop();

    const geoUrl = this.cfg.geoUrl ?? "/atlas/countries-110m.json";
    const geoHiUrl = this.cfg.geoHiUrl ?? "/atlas/countries-50m.json";
    try {
      const lo = (await (await fetch(geoUrl)).json()) as CountriesTopology;
      if (this.destroyed) return;
      this.topo = lo;
      this.buildTexture();
      // Lazy high-detail upgrade for crisp zooming.
      const hi = (await (await fetch(geoHiUrl)).json()) as CountriesTopology;
      if (this.destroyed) return;
      this.topo = hi;
      this.texW = 6144;
      this.buildTexture();
    } catch (err) {
      // The globe still renders as a plain sphere; say why the land is missing.
      console.warn("AtlasGlobe: land data failed to load", err);
    }
  }

  /* -------------------------------------------------------------- texture */

  private paintLand(ctx: CanvasRenderingContext2D, projection: ReturnType<typeof geoEquirectangular>, lineWidth: number) {
    const path = geoPath(projection, ctx);
    if (this.opts.graticule) {
      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = "rgba(167,230,215,0.07)";
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    if (this.landMerged) {
      ctx.beginPath();
      path(this.landMerged);
      ctx.fillStyle = LAND;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1.1 * lineWidth;
      ctx.stroke();
    }
  }

  private buildTexture() {
    if (!this.topo || !this.renderer) return;
    const w = this.texW;
    const h = w / 2;
    const k = w / 2048; // stroke scale
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, w, h);
    // topojson merge() takes the geometry array, not the collection.
    this.landMerged = merge(this.topo, this.topo.objects.countries.geometries as Array<Polygon | MultiPolygon>);
    const proj = geoEquirectangular()
      .scale(w / (2 * Math.PI))
      .translate([w / 2, h / 2]);
    this.paintLand(ctx, proj, k);
    // The canvas is left in three's default (linear) colour space on purpose:
    // the renderer's sRGB output then lifts the mid-tones, which is what
    // gives the prototype globe its shaded, lit look against the black page.
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.sphereMat.map?.dispose();
    this.sphereMat.map = tex;
    this.sphereMat.color.set(0xffffff);
    this.sphereMat.needsUpdate = true;
    this.texGrat = this.opts.graticule;
    this.detailKey = null;
  }

  /** High-detail window: a crisp partial-sphere overlay for the visible region when zoomed. */
  private updateDetail(now: number) {
    if (!this.landMerged || !this.renderer) return;
    const z = this.zoom;
    if (z < 1.35) {
      if (this.detail) this.detail.visible = false;
      this.detailKey = null;
      return;
    }
    if (this.detail) this.detail.visible = true;
    let lon = (-Math.PI / 2 - this.yaw) / d2r;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    const lat = this.pitch / d2r;
    const Rpx = Math.max(40, (Math.min(this.w, this.h) / 2 - 24) * z);
    const half = Math.min(60, Math.max(4, ((Math.max(this.w, this.h) / 2) / Rpx / d2r) * 1.3));
    const key = `${Math.round(lon * 2)},${Math.round(lat * 2)},${Math.round(half * 4)}`;
    if (key === this.detailKey) return;
    if (now - this.detailBuiltAt < 180) return;
    this.detailKey = key;
    this.detailBuiltAt = now;
    this.buildDetail(lat, lon, half);
  }

  private buildDetail(lat: number, lon: number, half: number) {
    if (!this.renderer) return;
    const latN = Math.min(89.9, lat + half);
    const latS = Math.max(-89.9, lat - half);
    const lonW = lon - half;
    const lonE = lon + half;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const texW = Math.min(4096, Math.pow(2, Math.ceil(Math.log2(this.w * dpr * 2))));
    const texH = Math.max(64, Math.round((texW * (latN - latS)) / (lonE - lonW)));
    const cv = document.createElement("canvas");
    cv.width = texW;
    cv.height = texH;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, texW, texH);
    const scale = texW / ((lonE - lonW) * d2r);
    const proj = geoEquirectangular()
      .rotate([-lon, 0])
      .scale(scale)
      .translate([texW / 2, texH / 2 + ((latN + latS) / 2) * d2r * scale]);
    const lw = Math.max(1.2, (1.2 * texW) / (this.w * 1.3 * (window.devicePixelRatio || 1)));
    this.paintLand(ctx, proj, lw);
    const geo = new THREE.SphereGeometry(1.0015, 64, 64, (lonW + 180) * d2r, (lonE - lonW) * d2r, (90 - latN) * d2r, (latN - latS) * d2r);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    if (this.detail) {
      this.detail.geometry.dispose();
      this.detail.material.map?.dispose();
      this.detail.material.dispose();
      this.yawG.remove(this.detail);
    }
    this.detail = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: tex, shininess: 18, specular: new THREE.Color(0x2a4a44) }));
    this.yawG.add(this.detail);
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h || !this.renderer) return;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private latLonToVec(lat: number, lon: number) {
    const phi = (90 - lat) * d2r;
    const theta = (lon + 180) * d2r;
    return new THREE.Vector3(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  }

  /* ----------------------------------------------------------- public API */

  setPins(pins: GlobePin[]) {
    for (const p of this.pins) {
      p._el?.remove();
      p._anchor?.removeFromParent();
    }
    this.pins = (pins || []).map((p) => ({ ...p }));
    for (const p of this.pins) this.makePin(p);
  }

  setSubPins(pins: GlobePin[]) {
    for (const p of this.subPins) {
      p._el?.remove();
      p._anchor?.removeFromParent();
    }
    this.subPins = (pins || []).map((p) => ({ ...p, sub: true, _born: performance.now() }));
    for (const p of this.subPins) this.makePin(p);
  }

  setFocus(ids: string[] | null) {
    this.focus = ids && ids.length ? new Set(ids) : null;
  }

  setSelected(id: string | null) {
    this.selected = id;
    for (const p of this.pins.concat(this.subPins)) if (p._el) this.stylePin(p);
  }

  setOptions(opts: Partial<GlobeOptions>) {
    Object.assign(this.opts, opts || {});
    if (this.topo && this.opts.graticule !== this.texGrat) this.buildTexture();
    for (const p of this.pins.concat(this.subPins)) if (p._el) this.stylePin(p);
  }

  flyTo(lat: number, lon: number, zoom = 1, dur = 1500) {
    const fromYaw = this.yaw;
    const fromPitch = this.pitch;
    const fromZ = this.zoom;
    let toYaw = -Math.PI / 2 - lon * d2r;
    let dY = toYaw - fromYaw;
    dY = ((((dY + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    toYaw = fromYaw + dY;
    const toPitch = lat * d2r;
    const start = performance.now();
    this.anim = { start };
    const step = (now: number) => {
      if (!this.anim || this.anim.start !== start) return;
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.yaw = fromYaw + (toYaw - fromYaw) * e;
      this.pitch = fromPitch + (toPitch - fromPitch) * e;
      this.zoom = fromZ + (zoom - fromZ) * e;
      this.idleAt = now + 2500;
      if (t < 1) requestAnimationFrame(step);
      else this.anim = null;
    };
    requestAnimationFrame(step);
  }

  zoomBy(factor: number) {
    const target = clampZoom(this.zoom * factor);
    const from = this.zoom;
    const start = performance.now();
    const dur = 320;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.zoom = from + (target - from) * e;
      this.idleAt = now + 3000;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  reset() {
    this.flyTo(this.home.lat, this.home.lon, this.home.zoom, 1600);
    this.setSelected(null);
  }

  /* ----------------------------------------------------------------- pins */

  private anchorPin(p: PinState) {
    if (!this.yawG) return;
    if (!p._anchor) p._anchor = new THREE.Object3D();
    p._anchor.position.copy(this.latLonToVec(p.lat, p.lon));
    this.yawG.add(p._anchor);
  }

  private makePin(p: PinState) {
    const el = document.createElement("div");
    el.className = "ag-pin";
    Object.assign(el.style, {
      position: "absolute",
      left: "0",
      top: "0",
      pointerEvents: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      transform: "translate(-50%,-100%)",
      willChange: "transform,opacity",
      fontFamily: FONT,
      opacity: "0",
    });
    const label = document.createElement("div");
    label.textContent = p.name.toUpperCase();
    const stem = document.createElement("div");
    const dot = document.createElement("div");
    el.appendChild(label);
    el.appendChild(stem);
    el.appendChild(dot);
    p._parts = { label, stem, dot };
    p._el = el;
    this.pinLayer.appendChild(el);
    this.anchorPin(p);
    this.stylePin(p);
  }

  private stylePin(p: PinState) {
    if (!p._parts) return;
    const { label, stem, dot } = p._parts;
    const sel = this.selected === p.id;
    const strong = p.featured || !!p.sub;
    const ink = sel ? MINT : strong ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
    // Mint dot for featured destinations, grey for the rest.
    const dotInk = sel ? MINT : p.featured ? "rgba(167,230,215,0.95)" : "rgba(255,255,255,0.45)";
    const glow = sel
      ? "0 0 8px rgba(167,230,215,0.9)"
      : p.featured
        ? "0 0 6px rgba(167,230,215,0.55)"
        : "0 0 3px rgba(255,255,255,0.25)";
    Object.assign(label.style, {
      fontSize: p.sub ? "10px" : "11px",
      letterSpacing: "0.28em",
      fontWeight: "500",
      color: ink,
      whiteSpace: "nowrap",
      paddingLeft: "0.28em",
      marginBottom: "5px",
    });
    Object.assign(stem.style, {
      width: "1px",
      height: strong ? "16px" : "10px",
      background: sel ? "rgba(167,230,215,0.8)" : strong ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.3)",
    });
    Object.assign(dot.style, {
      width: strong ? "5px" : "3px",
      height: strong ? "5px" : "3px",
      borderRadius: "50%",
      border: "8px solid transparent",
      backgroundClip: "padding-box",
      boxSizing: "content-box",
      margin: "-5px -8px -8px",
      backgroundColor: dotInk,
      boxShadow: glow,
    });
  }

  /* ---------------------------------------------------------- interaction */

  private pickPin(e: PointerEvent): PinState | null {
    const rect = this.host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: PinState | null = null;
    let bestD = 20;
    for (const p of this.pins.concat(this.subPins)) {
      if (!p._pickable || !p._xy) continue;
      const d = Math.hypot(x - p._xy[0], y - p._xy[1]);
      const score = p._dimmed ? d + 4 : d; // undimmed pins win ties in clusters
      if (score < bestD) {
        bestD = score;
        best = p;
      }
    }
    return best;
  }

  private bindPointer() {
    const host = this.host;
    let down: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const touches = new Map<number, [number, number]>();
    let pinchDist = 0;

    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      host.addEventListener(type, fn, opts);
      this.unbind.push(() => host.removeEventListener(type, fn, opts));
    };

    on("pointermove", (e) => {
      if (down || touches.size) return;
      const hp = this.pickPin(e);
      for (const p of this.pins.concat(this.subPins)) p._hover = p === hp;
      host.style.cursor = hp ? "pointer" : "";
    });

    on(
      "wheel",
      (e) => {
        if (this.opts.lockZoom) return;
        e.preventDefault();
        this.zoom = clampZoom(this.zoom * Math.exp(-e.deltaY * 0.0014));
        this.idleAt = performance.now() + 4000;
        this.anim = null;
      },
      { passive: false }
    );

    on("pointerdown", (e) => {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
      this.downPin = this.pickPin(e);
      down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
      this.dragged = false;
      this.anim = null;
      host.setPointerCapture(e.pointerId);
    });

    on("pointermove", (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2 && !this.opts.lockZoom) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinchDist > 0) this.zoom = clampZoom(this.zoom * (d / pinchDist));
        pinchDist = d;
        this.idleAt = performance.now() + 4000;
        this.anim = null;
        down = null;
        return;
      }
      if (!down || touches.size > 1 || this.opts.lockDrag) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.dragged = true;
      const k = 0.0042 / this.zoom;
      this.yaw = down.yaw + dx * k;
      this.pitch = Math.max(-80 * d2r, Math.min(80 * d2r, down.pitch + dy * k));
      this.idleAt = performance.now() + 4000;
    });

    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      pinchDist = 0;
      if (this.downPin && !this.dragged) {
        this.cfg.onPinSelect?.(this.downPin.id);
      } else if (!this.downPin && !this.dragged && this.selected) {
        // Empty ocean tapped while something is selected.
        this.cfg.onDeselect?.();
      }
      this.downPin = null;
      down = null;
      setTimeout(() => {
        this.dragged = false;
      }, 50);
    };
    on("pointerup", up);
    on("pointercancel", up);
  }

  /* --------------------------------------------------------------- render */

  private frame(now: number) {
    if (!this.renderer || !this.w) return;
    if (this.opts.drift && !this.anim && now > this.idleAt && !this.selected) this.yaw += 0.00014;
    this.pitchG.rotation.x = this.pitch;
    this.yawG.rotation.y = this.yaw;

    // Telephoto zoom: fixed camera distance, FOV narrows.
    const targetPx = Math.max(40, (Math.min(this.w, this.h) / 2 - 24) * this.zoom);
    this.camera.position.z = CAMERA_D;
    this.camera.fov = (2 * Math.atan(this.h / 2 / (CAMERA_D * targetPx))) / d2r;
    this.camera.updateProjectionMatrix();
    this.updateDetail(now);
    this.pitchG.updateMatrixWorld(true);

    const camD = this.camera.position.z;
    const V = new THREE.Vector3();
    const visible: PinState[] = [];
    for (const p of this.pins.concat(this.subPins)) {
      if (!p._el) continue;
      if (!p._anchor) this.anchorPin(p);
      if (!p._anchor) continue;
      p._anchor.getWorldPosition(V);
      let fade = Math.max(0, Math.min(1, (V.z * camD - 1) * 5)); // horizon: P.z·D > R² (= 1)
      if (fade <= 0) {
        p._pickable = false;
        p._el.style.opacity = "0";
        continue;
      }
      p._limb = fade;
      p._dimmed = !!(this.focus && !this.focus.has(p.id));
      if (p._dimmed) fade *= 0.55;
      if (p._born) fade *= Math.min(1, (now - p._born) / 400);
      const ndc = V.clone().project(this.camera);
      p._xy = [((ndc.x + 1) / 2) * this.w, ((1 - ndc.y) / 2) * this.h];
      p._fade = fade;
      visible.push(p);
    }

    const weight = (p: PinState) =>
      (p.id === this.selected ? 6 : 0) + (p.sub ? 5 : 0) + (p._hover ? 3 : 0) + (p.featured ? 1 : 0) - (p._dimmed ? 10 : 0);
    visible.sort((a, b) => weight(b) - weight(a) || (b._fade ?? 0) - (a._fade ?? 0));

    const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    for (const p of visible) {
      const strong = p.featured || !!p.sub;
      const fs = p.sub ? 10 : 11;
      const lw = p.name.length * fs * 0.68 + p.name.length * fs * 0.28;
      const lh = strong ? 40 : 30;
      const [x, y] = p._xy!;
      const box = { x0: x - lw / 2 - 5, x1: x + lw / 2 + 5, y0: y - lh - 4, y1: y };
      let collides = false;
      for (const b of placed) {
        if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) {
          collides = true;
          break;
        }
      }
      const el = p._el!;
      el.style.zIndex = p.id === this.selected || p._hover ? "3000" : String(2000 - placed.length);
      const forced = (p.id === this.selected || p._hover) && !p._dimmed;
      const showLabel = forced || (!collides && !p._dimmed);
      if (showLabel) placed.push(box);
      const parts = p._parts!;
      parts.label.style.visibility = showLabel ? "visible" : "hidden";
      parts.stem.style.visibility = showLabel ? "visible" : "hidden";
      el.style.filter = p._dimmed ? "grayscale(1)" : "";
      el.style.opacity = String(p._fade);
      p._pickable = (p._limb ?? 0) > 0.4;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
