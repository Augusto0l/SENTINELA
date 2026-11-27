import { useEffect, useRef, useState } from "react";
import { STREET_TILE_SIZE, streetTileLayout } from "@/components/map/streetTiles";
import { parseMapFrame } from "@/components/map/streetViewport";
import styles from "@/components/map/AnalyticMap.module.css";
import { TILE_REFERRER_POLICY } from "@/lib/maps/tile-policy";

const STREET_TILES = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark";
type TileBatch = ReturnType<typeof streetTileLayout> & { level: string; signature: string; suffix: string };

function tilesReady(group: Element | null | undefined) {
  return Boolean(group && !group.querySelector('img:not([data-street-tile="loaded"])'));
}

export default function StreetBasemap({ fittedViewBox }: { fittedViewBox: string }) {
  const layer = useRef<SVGGElement>(null);
  const [batches, setBatches] = useState<{ current?: TileBatch; fallback?: TileBatch }>({});

  useEffect(() => {
    const svg = layer.current?.ownerSVGElement;
    if (!svg) return;
    const fittedWidth = parseMapFrame(fittedViewBox).width;
    const update = () => {
      const { width, height } = svg.getBoundingClientRect();
      const viewBox = svg.getAttribute("viewBox") ?? fittedViewBox;
      const layout = streetTileLayout(viewBox, width, height, 32);
      if (!layout.tiles.length) return;
      const suffix = window.devicePixelRatio > 1.25 || parseMapFrame(viewBox).width <= fittedWidth * .55 ? "@2x" : "";
      const first = layout.tiles[0].id, last = layout.tiles[layout.tiles.length - 1].id;
      const level = first.split("/")[0] + suffix;
      const signature = `${first}:${last}:${suffix}`;
      setBatches(previous => {
        if (previous.current?.signature === signature) return previous;
        const fallback = previous.current?.level === level ? previous.fallback
          : previous.fallback?.level === level ? undefined : previous.fallback ?? previous.current;
        return { current: { ...layout, level, signature, suffix }, fallback };
      });
    };
    const resize = new ResizeObserver(update);
    const frame = new MutationObserver(update);
    resize.observe(svg);
    frame.observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
    update();
    return () => { resize.disconnect(); frame.disconnect(); };
  }, [fittedViewBox]);

  useEffect(() => {
    const { current, fallback } = batches;
    if (!current || !fallback) return;
    // The final view may reuse already loaded tiles, so it may have no new load event.
    const frame = requestAnimationFrame(() => {
      if (tilesReady(layer.current?.lastElementChild)) {
        setBatches(previous => previous.current === current ? { current } : previous);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [batches]);

  function markLoaded(image: HTMLImageElement, batch: TileBatch) {
    image.dataset.streetTile = "loaded";
    const tileGroup = image.closest("[data-street-level]");
    if (tilesReady(tileGroup)) {
      setBatches(previous => previous.fallback && previous.current?.signature === batch.signature
        ? { current: previous.current } : previous);
    }
  }

  return (
    <g ref={layer} className={styles.streetBase} data-testid="street-basemap" aria-hidden="true" pointerEvents="none">
      {[batches.fallback, batches.current].map(batch => batch && (
        <g key={batch.level} data-street-level={batch.level}>
          {batch.tiles.map(({ id, x, y, width, height }) => (
            // Keep a full-size HTML image box so deep zoom does not magnify CSS layout rounding.
            <foreignObject key={id} width={STREET_TILE_SIZE} height={STREET_TILE_SIZE}
              transform={`translate(${x} ${y}) scale(${(width + batch.overlap) / STREET_TILE_SIZE} ${(height + batch.overlap) / STREET_TILE_SIZE})`}>
              {/* The browser preserves CDN caching and sends the origin. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.streetTile}
                src={`${STREET_TILES}/${id}${batch.suffix}.png`}
                alt=""
                draggable={false}
                referrerPolicy={TILE_REFERRER_POLICY}
                decoding="async"
                onLoad={event => markLoaded(event.currentTarget, batch)}
                onError={event => { event.currentTarget.dataset.streetTile = "error"; }}
              />
            </foreignObject>
          ))}
        </g>
      ))}
    </g>
  );
}

export function StreetAttribution() {
  return (
    <div className={styles.streetAttribution}>
      <span className={styles.streetUnavailable} role="status">Base de ruas indisponível</span>
      <span>© <a href="https://stadiamaps.com/attribution/" target="_blank" rel="noreferrer">Stadia Maps</a></span>
      <span>© <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a></span>
      <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></span>
    </div>
  );
}
