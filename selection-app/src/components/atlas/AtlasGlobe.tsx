"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AtlasGlobe as Engine, GlobeConfig, GlobeOptions, GlobePin, GlobeView, RoutePoint } from "@/lib/atlas/globe";

/** Imperative surface the page drives after a pin is chosen. */
export interface GlobeHandle {
  flyTo(lat: number, lon: number, zoom?: number, dur?: number): void;
  zoomBy(factor: number): void;
  reset(): void;
  setSubPins(pins: GlobePin[]): void;
  setFocus(ids: string[] | null): void;
  setSelected(id: string | null): void;
  /** Route state: draw a day-by-day route (null clears it) */
  setRoute(points: RoutePoint[] | null): void;
  setRouteActive(day: number | null): void;
  /** Ease the camera in on a set of points; returns the view flown to */
  fitPoints(points: Array<{ lat: number; lon: number }>, dur?: number): GlobeView | null;
  getView(): GlobeView | null;
  flyToView(view: GlobeView, dur?: number): void;
}

interface Props {
  pins: GlobePin[];
  onPinSelect: (id: string) => void;
  onDeselect: () => void;
  onRouteDaySelect?: (day: number) => void;
  onReady?: () => void;
  options?: Partial<GlobeOptions>;
  /** Resting view (lat, lon, zoom); the engine defaults to the Mediterranean at zoom 1 */
  home?: GlobeConfig["home"];
  className?: string;
}

interface Pending {
  subPins: GlobePin[];
  focus: string[] | null;
  selected: string | null;
  fly: [number, number, number, number] | null;
  route: RoutePoint[] | null;
  routeActive: number | null;
}

const emptyPending = (): Pending => ({ subPins: [], focus: null, selected: null, fly: null, route: null, routeActive: null });

/**
 * Hosts the WebGL globe. The engine (and three.js with it) is imported only
 * on the client after mount, so the page shell and panel arrive first.
 * Calls made before the engine is ready are remembered and replayed.
 */
const AtlasGlobe = forwardRef<GlobeHandle, Props>(function AtlasGlobe(
  { pins, onPinSelect, onDeselect, onRouteDaySelect, onReady, options, home, className },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const pinsRef = useRef(pins);
  const optionsRef = useRef(options);
  const homeRef = useRef(home);
  const callbacks = useRef({ onPinSelect, onDeselect, onRouteDaySelect, onReady });
  const pending = useRef<Pending>(emptyPending());

  pinsRef.current = pins;
  optionsRef.current = options;
  callbacks.current = { onPinSelect, onDeselect, onRouteDaySelect, onReady };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let engine: Engine | null = null;
    import("@/lib/atlas/globe").then(({ AtlasGlobe: EngineClass }) => {
      if (!alive) return;
      engine = new EngineClass(host, {
        onPinSelect: (id) => callbacks.current.onPinSelect(id),
        onDeselect: () => callbacks.current.onDeselect(),
        onRouteDaySelect: (day) => callbacks.current.onRouteDaySelect?.(day),
        ...(homeRef.current ? { home: homeRef.current } : {}),
      });
      engine.setPins(pinsRef.current);
      // Idle drift stays on, as in the design reference; pass options.drift
      // to override.
      if (optionsRef.current) engine.setOptions(optionsRef.current);
      const p = pending.current;
      if (p.subPins.length) engine.setSubPins(p.subPins);
      if (p.focus) engine.setFocus(p.focus);
      if (p.selected) engine.setSelected(p.selected);
      if (p.route) engine.setRoute(p.route);
      if (p.routeActive != null) engine.setRouteActive(p.routeActive);
      if (p.fly) engine.flyTo(...p.fly);
      engineRef.current = engine;
      callbacks.current.onReady?.();
    });
    const onVisible = () => engineRef.current?.ensureRunning();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setPins(pins);
  }, [pins]);

  useEffect(() => {
    if (options) engineRef.current?.setOptions(options);
  }, [options]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lat, lon, zoom = 1, dur = 1500) => {
        if (engineRef.current) engineRef.current.flyTo(lat, lon, zoom, dur);
        else pending.current.fly = [lat, lon, zoom, dur];
      },
      zoomBy: (f) => engineRef.current?.zoomBy(f),
      reset: () => {
        pending.current = emptyPending();
        engineRef.current?.setRoute(null);
        engineRef.current?.reset();
      },
      setSubPins: (p) => {
        pending.current.subPins = p;
        engineRef.current?.setSubPins(p);
      },
      setFocus: (ids) => {
        pending.current.focus = ids;
        engineRef.current?.setFocus(ids);
      },
      setSelected: (id) => {
        pending.current.selected = id;
        engineRef.current?.setSelected(id);
      },
      setRoute: (points) => {
        pending.current.route = points;
        if (!points) pending.current.routeActive = null;
        engineRef.current?.setRoute(points);
      },
      setRouteActive: (day) => {
        pending.current.routeActive = day;
        engineRef.current?.setRouteActive(day);
      },
      fitPoints: (points, dur = 1500) => {
        if (engineRef.current) return engineRef.current.fitPoints(points, dur);
        // Before the engine exists, approximate with the centroid at a close zoom.
        const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
        const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
        pending.current.fly = [lat, lon, 4, dur];
        return { lat, lon, zoom: 4 };
      },
      getView: () => engineRef.current?.getView() ?? null,
      flyToView: (view, dur = 1400) => {
        if (engineRef.current) engineRef.current.flyToView(view, dur);
        else pending.current.fly = [view.lat, view.lon, view.zoom, dur];
      },
    }),
    []
  );

  return <div ref={hostRef} className={className} role="img" aria-label="Interactive globe of Ocean Independence charter destinations" />;
});

export default AtlasGlobe;
