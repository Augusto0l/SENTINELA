import { densityColor, sampleDensity, type DensityField } from "@/components/map/heatmapDensity";

export function renderDensityHeatmap(canvas: HTMLCanvasElement, svg: SVGSVGElement, field: DensityField, referencePeak: number, boundary: Path2D) {
  const context = canvas.getContext("2d");
  const matrix = svg.getScreenCTM();
  const bounds = canvas.getBoundingClientRect();
  if (!context || !matrix || bounds.width <= 0 || bounds.height <= 0) return;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
  canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (referencePeak <= 0 || field.peak <= 0) return;

  // Use the SVG's actual transform, including viewBox zoom and aspect-ratio padding.
  const transform = new DOMMatrix([
    matrix.a * pixelRatio, matrix.b * pixelRatio,
    matrix.c * pixelRatio, matrix.d * pixelRatio,
    (matrix.e - bounds.left) * pixelRatio, (matrix.f - bounds.top) * pixelRatio,
  ]);
  const inverse = transform.inverse();
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const mapX = inverse.a * (x + 0.5) + inverse.c * (y + 0.5) + inverse.e;
      const mapY = inverse.b * (x + 0.5) + inverse.d * (y + 0.5) + inverse.f;
      const density = sampleDensity(field, mapX, mapY);
      if (density <= 0) continue;
      const offset = (y * canvas.width + x) * 4;
      const color = densityColor(density, referencePeak);
      image.data.set(color, offset);
    }
  }
  const buffer = document.createElement("canvas");
  buffer.width = canvas.width;
  buffer.height = canvas.height;
  const bufferContext = buffer.getContext("2d");
  if (!bufferContext) return;
  bufferContext.putImageData(image, 0, 0);

  // Reuse the existing paths verbatim; holes and the selected RA remain clipped.
  context.save();
  context.setTransform(transform);
  context.clip(boundary, "evenodd");
  context.resetTransform();
  context.drawImage(buffer, 0, 0);
  context.restore();
}
