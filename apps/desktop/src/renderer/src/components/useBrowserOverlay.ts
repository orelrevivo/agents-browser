import { useCallback, useLayoutEffect, useRef, useState } from "react";

export interface BrowserOverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type OverlayChangeHandler = (open: boolean, bounds?: BrowserOverlayBounds) => void;

/**
 * Keeps a React toolbar surface above the native CEF page without hiding the
 * page. The native host uses these bounds to expose only the browser chrome
 * and the open overlay from the shell window.
 */
export function useBrowserOverlay(onOverlayChange: OverlayChangeHandler) {
  const [open, setOpen] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const onOverlayChangeRef = useRef(onOverlayChange);
  onOverlayChangeRef.current = onOverlayChange;

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) onOverlayChangeRef.current(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    let animationFrame = 0;
    let settleTimer = 0;
    let retries = 0;
    const measure = () => {
      const surface = surfaceRef.current?.parentElement ?? surfaceRef.current;
      if (!surface) return;

      const bounds = surface.getBoundingClientRect();
      if ((bounds.width < 40 || bounds.height < 20) && retries < 5) {
        retries += 1;
        animationFrame = window.requestAnimationFrame(measure);
        return;
      }

      onOverlayChangeRef.current(true, {
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });
    };

    animationFrame = window.requestAnimationFrame(measure);
    settleTimer = window.setTimeout(measure, 220);
    const observer = new ResizeObserver(measure);
    if (surfaceRef.current?.parentElement) observer.observe(surfaceRef.current.parentElement);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  return { open, onOpenChange: handleOpenChange, surfaceRef };
}
