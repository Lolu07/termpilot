import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// Animates a whole number from its previous value to the next one. Returns the
// target immediately when the viewer prefers reduced motion, so the number is
// never withheld from anyone who opted out of animation.
export default function useCountUp(value, duration = 620) {
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const reduced = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia(REDUCED_MOTION).matches;

    const from = fromRef.current;
    if (reduced || from === target || duration <= 0) {
      fromRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      // easeOutCubic: fast arrival, gentle settle.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return display;
}
