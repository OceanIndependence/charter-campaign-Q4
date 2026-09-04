"use client";

import { useCallback, useRef } from "react";

/**
 * ~0.6s noise "swoosh": white noise through a bandpass filter sweeping
 * 600 → 3200 → 900 Hz, gain peaking at 0.09. Created lazily on first play so
 * audio only ever starts from a user gesture — never autoplayed.
 */
export function useSwoosh(): () => void {
  const ctxRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);

  return useCallback(() => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = (ctxRef.current ??= new Ctx());
      if (ctx.state === "suspended") void ctx.resume();
      const t = ctx.currentTime;
      const dur = 0.6;
      if (!noiseRef.current) {
        const len = Math.floor(ctx.sampleRate * 1);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        noiseRef.current = buf;
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseRef.current;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(600, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.45);
      bp.frequency.exponentialRampToValueAtTime(900, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch {
      /* audio is decorative — never let it break navigation */
    }
  }, []);
}
