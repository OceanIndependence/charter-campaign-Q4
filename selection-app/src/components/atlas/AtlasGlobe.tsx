"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AtlasGlobe as Engine, GlobeConfig, GlobeOptions, GlobePin } from "@/lib/atlas/globe";

/** Imperative surface the page drives after a pin is chosen. */
export interface GlobeHandle {
  flyTo(lat: number, lon: number, zoom?: number, dur?: number): void;
  zoomBy(factor: number): void;
  reset(): void;
  setSubPins(pins: GlobePin[]): void;
  setFocus(ids: string[] | null): void;
  setSelected(id: string | null): void;
}

interface Props {
  pins: GlobePin[];
  onPinSelect: (id: string) => void;
  onDeselect: () => void;
  onReady?: () => void;
  options?: Partial<GlobeOptions>;
  /** Resting view (lat, lon, zoom); the engine defaults to the Mediterranean at zoom 1 */
  home?: GlobeConfig["home"];
  className?: string;
}

/**
 * Hosts the WebGL globe. The engine (and three.js with it) is imported only
 * on the client after mount, so the page shell and panel arrive first.
 * Calls made before the engine is ready are remembered and replayed.
 */
const AtlasGlobe = forwardRef<GlobeHandle, Props>(function AtlasGlobe({ pins, onPinSelect, onDeselect, onReady, options, home, className }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const pinsRef = useRef(pins);
  const optionsRef = useRef(options);
  const homeRef = useRef(home);
  const callbacks = useRef({ onPinSelect, onDeselect, onReady });
  const pending = useRef<{ subPins: GlobePin[]; focus: string[] | null; selected: string | null; fly: [number, number, number, number] | null }>({
    subPins: [],
    focus: null,
    selected: null,
    fly: null,
  });

  pinsRef.current = pins;
  optionsRef.current = options;
  callbacks.current = { onPinSelect, onDeselect, onReady };

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
        pending.current = { subPins: [], focus: null, selected: null, fly: null };
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
    }),
    []
  );

  return <div ref={hostRef} className={className} role="img" aria-label="Interactive globe of Ocean Independence charter destinations" />;
});

export default AtlasGlobe;
