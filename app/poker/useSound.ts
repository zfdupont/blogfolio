"use client";

import { useCallback, useRef, useState } from "react";

// Muted by default; synthesizes a short click with the Web Audio API (no asset
// files). The AudioContext is created lazily on the first unmuted play so it
// starts in a user-gesture context.
export function useSound() {
  const [muted, setMuted] = useState(true);
  const ctxRef = useRef<AudioContext | null>(null);

  const play = useCallback(() => {
    if (muted) return;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = (ctxRef.current ??= new Ctx());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.value = 0.03;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      /* audio is best-effort */
    }
  }, [muted]);

  return { muted, setMuted, play };
}
