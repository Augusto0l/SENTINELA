import { MAX_STREET_SCALE } from "@/components/map/streetTiles";

export type MapFrame = { x: number; y: number; width: number; height: number };
export type ViewportSize = Pick<MapFrame, "width" | "height">;
export type ScreenPoint = Pick<MapFrame, "x" | "y">;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function parseMapFrame(viewBox: string): MapFrame {
  const [x, y, width, height] = viewBox.split(" ").map(Number);
  return { x, y, width, height };
}

export function moveMapFrame(frame: MapFrame, fit: MapFrame, viewport: ViewportSize, from: ScreenPoint, to: ScreenPoint, factor = 1): MapFrame {
  if (viewport.width <= 0 || viewport.height <= 0) return frame;
  const scale = Math.min(viewport.width / frame.width, viewport.height / frame.height);
  const fittedScale = Math.min(viewport.width / fit.width, viewport.height / fit.height);
  const minWidth = fit.width * Math.min(1, fittedScale / MAX_STREET_SCALE);
  const width = clamp(frame.width / factor, minWidth, fit.width);
  const ratio = width / frame.width;
  const height = fit.height * (width / fit.width);
  const padX = (viewport.width - frame.width * scale) / 2;
  const padY = (viewport.height - frame.height * scale) / 2;
  // The visible area can extend past the SVG viewBox on a tall or wide screen.
  const marginX = padX / scale * (fit.width / frame.width - ratio);
  const marginY = padY / scale * (fit.height / frame.height - ratio);
  const x = frame.x + ((from.x - padX) - (to.x - padX) * ratio) / scale;
  const y = frame.y + ((from.y - padY) - (to.y - padY) * ratio) / scale;
  return {
    x: clamp(x, fit.x - marginX, fit.x + fit.width - width + marginX),
    y: clamp(y, fit.y - marginY, fit.y + fit.height - height + marginY),
    width,
    height,
  };
}
