import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { moveMapFrame, parseMapFrame, type MapFrame, type ScreenPoint } from "@/components/map/streetViewport";

const DISTANCE_THRESHOLD = 5;
const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: ScreenPoint, b: ScreenPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function useStreetNavigation(svgRef: RefObject<SVGSVGElement | null>, enabled: boolean, fittedViewBox: string, onMove: () => void) {
  const saved = useRef<{ fit: string; frame: MapFrame } | null>(null);
  const controls = useRef<{ zoom: (factor: number) => void; reset: () => void } | null>(null);
  const [level, setLevel] = useState<{ fit: string; value: number }>();

  useLayoutEffect(() => {
    const element = svgRef.current;
    if (!enabled || !element) return;
    const svg = element;
    const fit = parseMapFrame(fittedViewBox);
    let current = saved.current?.fit === fittedViewBox ? saved.current.frame : fit;
    let target = current;
    let animation = 0;
    let lastTime = 0;
    let lastLevel = -1;
    let gesture = false;
    let suppressClick = false;
    let start: ScreenPoint | undefined;
    const pointers = new Map<number, ScreenPoint>();

    const viewport = () => {
      const { width, height } = svg.getBoundingClientRect();
      return { width, height };
    };
    const local = (event: MouseEvent) => {
      const bounds = svg.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const center = () => {
      const { width, height } = viewport();
      return { x: width / 2, y: height / 2 };
    };

    function apply(frame: MapFrame) {
      current = frame;
      saved.current = { fit: fittedViewBox, frame };
      const viewBox = `${frame.x} ${frame.y} ${frame.width} ${frame.height}`;
      if (svg.getAttribute("viewBox") !== viewBox) svg.setAttribute("viewBox", viewBox);
      const ratio = frame.width / fit.width;
      svg.style.setProperty("--street-fit-ratio", String(ratio));
      svg.dataset.zoomed = String(ratio < 1 - 1e-6);
      const nextLevel = Math.floor(Math.log2(1 / ratio));
      if (nextLevel !== lastLevel) {
        lastLevel = nextLevel;
        setLevel(previous => previous?.fit === fittedViewBox && previous.value === nextLevel
          ? previous : { fit: fittedViewBox, value: nextLevel });
      }
    }

    function beginMovement() {
      if (svg.dataset.navigating === "true") return;
      svg.dataset.navigating = "true";
      onMove();
    }

    function stopAnimation() {
      cancelAnimationFrame(animation);
      animation = 0;
      lastTime = 0;
      target = current;
      delete svg.dataset.navigating;
    }

    function draw(time: number) {
      animation = 0;
      if (gesture) {
        apply(target);
        return;
      }
      const ease = 1 - Math.exp(-Math.min(time - (lastTime || time - 16), 32) / 44);
      lastTime = time;
      const complete = Math.max(
        Math.abs(current.x - target.x), Math.abs(current.y - target.y), Math.abs(current.width - target.width),
      ) < current.width / Math.max(1, svg.clientWidth) / 4;
      if (complete) {
        apply(target);
        stopAnimation();
        return;
      }
      apply({
        x: current.x + (target.x - current.x) * ease,
        y: current.y + (target.y - current.y) * ease,
        width: current.width + (target.width - current.width) * ease,
        height: current.height + (target.height - current.height) * ease,
      });
      schedule();
    }

    function schedule() {
      if (!animation) animation = requestAnimationFrame(draw);
    }

    function zoom(factor: number, point = center()) {
      if (pointers.size) return;
      target = moveMapFrame(target, fit, viewport(), point, point, factor);
      if (target.width === current.width && target.x === current.x && target.y === current.y) return;
      beginMovement();
      schedule();
    }

    function onWheel(event: WheelEvent) {
      if (!event.deltaY) return;
      event.preventDefault();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1;
      const delta = Math.max(-300, Math.min(300, event.deltaY * units));
      zoom(Math.exp(-delta * (event.ctrlKey ? .007 : .0025)), local(event));
    }

    function capturePointers() {
      gesture = true;
      suppressClick = true;
      beginMovement();
      for (const id of pointers.keys()) svg.setPointerCapture(id);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || pointers.size >= 2 || (pointers.size && event.pointerType !== "touch")) return;
      const point = local(event);
      if (!pointers.size) {
        stopAnimation();
        suppressClick = false;
        start = point;
      }
      pointers.set(event.pointerId, point);
      if (pointers.size === 2 && !gesture) capturePointers();
      else if (gesture) svg.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const point = local(event);
      pointers.set(event.pointerId, point);
      if (!gesture) {
        if (!start || distance(start, point) < DISTANCE_THRESHOLD) return;
        capturePointers();
      }
      event.preventDefault();
      const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const ratio = distance(point, other) / Math.max(1, distance(previous, other));
        target = moveMapFrame(target, fit, viewport(), midpoint(previous, other), midpoint(point, other), Math.max(.1, ratio));
      } else {
        target = moveMapFrame(target, fit, viewport(), previous, point);
      }
      schedule();
    }

    function onPointerEnd(event: PointerEvent) {
      if (!pointers.delete(event.pointerId) || pointers.size) return;
      if (gesture) apply(target);
      gesture = false;
      start = undefined;
      stopAnimation();
    }

    function onLostCapture(event: PointerEvent) {
      if (event.target === svg) onPointerEnd(event);
    }

    function onClick(event: MouseEvent) {
      if (suppressClick && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function reset() {
      stopAnimation();
      target = fit;
      apply(fit);
      onMove();
    }

    function constrainToViewport() {
      const size = viewport();
      const point = { x: size.width / 2, y: size.height / 2 };
      const adjusted = moveMapFrame(current, fit, size, point, point);
      target = moveMapFrame(target, fit, size, point, point);
      apply(adjusted);
    }

    constrainToViewport();
    const resize = new ResizeObserver(constrainToViewport);
    resize.observe(svg);
    controls.current = { zoom, reset };
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    svg.addEventListener("lostpointercapture", onLostCapture);
    svg.addEventListener("click", onClick, true);
    return () => {
      resize.disconnect();
      stopAnimation();
      controls.current = null;
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      svg.removeEventListener("lostpointercapture", onLostCapture);
      svg.removeEventListener("click", onClick, true);
    };
  }, [enabled, fittedViewBox, onMove, svgRef]);

  return {
    zoom: (factor: number) => controls.current?.zoom(factor),
    reset: () => controls.current?.reset(),
    clusterDetail: level?.fit === fittedViewBox ? 2 ** -level.value : 1,
  };
}
