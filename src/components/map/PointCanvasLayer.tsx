"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MapOccurrence } from "@/components/map/MapaDF";
import type { MarkerHover } from "@/components/map/MapOccurrenceTooltip";
import {
  closestPointSymbol, indexPointSymbols, pointAppearance, pointScene, pointSymbolRecords, type PointScene,
} from "@/components/map/pointSymbols";
import styles from "@/components/map/AnalyticMap.module.css";

type Camera = { scale: number; x: number; y: number };
type Selection = { title: string; records: MapOccurrence[]; restoreFocus: boolean; source: readonly MapOccurrence[] };
const PAGE_SIZE = 20;
const EMPTY_SCENE: PointScene = { symbols: [], count: 0, grouped: 0 };

function paintSymbols(context: CanvasRenderingContext2D, scene: PointScene, camera: Camera, zoom: number) {
  const { radius, opacity } = pointAppearance(zoom);
  for (const grouped of [false, true]) {
    const size = grouped ? radius + 1.65 : radius;
    context.beginPath();
    for (const symbol of scene.symbols) {
      if ((symbol.count > 1) !== grouped) continue;
      const x = symbol.x * camera.scale + camera.x;
      const y = symbol.y * camera.scale + camera.y;
      context.moveTo(x + size, y);
      context.arc(x, y, size, 0, 2 * Math.PI);
    }
    context.globalAlpha = opacity;
    context.fillStyle = "#ef4444";
    context.fill();
    context.globalAlpha = grouped ? 0.95 : 0.65;
    context.strokeStyle = "#fecaca";
    context.lineWidth = grouped ? 1.4 : 0.65;
    context.stroke();
  }
  context.globalAlpha = 1;
}

function PointCanvasLayer({ points, focusedPoint, svgRef, fittedWidth, onHover, onOpen }: {
  points: readonly MapOccurrence[];
  focusedPoint?: MapOccurrence;
  svgRef: RefObject<SVGSVGElement | null>;
  fittedWidth: number;
  onHover?: (marker: MarkerHover | null) => void;
  onOpen: (point: MapOccurrence) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const halo = useRef<HTMLSpanElement>(null);
  const focusedMarker = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const choiceId = useId();
  const view = useRef<{ camera: Camera; scene: PointScene } | null>(null);
  const hovered = useRef<MapOccurrence | null>(null);
  const index = useMemo(() => indexPointSymbols(points), [points]);
  const interactive = useMemo(() => points.some(point => point.occurrenceId), [points]);
  const [counts, setCounts] = useState({ symbols: 0, points: 0, grouped: 0 });
  const [unavailable, setUnavailable] = useState(false);
  const [openedSelection, setSelection] = useState<Selection | null>(null);
  const selection = openedSelection?.source === points ? openedSelection : null;
  const [page, setPage] = useState(0);

  const clearHighlight = useCallback(() => {
    if (halo.current) halo.current.hidden = true;
    if (hovered.current) {
      hovered.current = null;
      onHover?.(null);
    }
  }, [onHover]);

  const highlight = useCallback((location: { x: number; y: number }, point: MapOccurrence | null) => {
    const camera = view.current?.camera;
    const element = canvas.current;
    if (!camera || !element || !halo.current) return;
    const x = location.x * camera.scale + camera.x;
    const y = location.y * camera.scale + camera.y;
    halo.current.hidden = false;
    halo.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    if (hovered.current === point) return;
    hovered.current = point;
    const bounds = element.getBoundingClientRect();
    onHover?.(point ? { point, clientX: bounds.left + x, clientY: bounds.top + y } : null);
  }, [onHover]);

  const showSelection = useCallback((title: string, records: MapOccurrence[], restoreFocus: boolean) => {
    setPage(0);
    setSelection({ title, records, restoreFocus, source: points });
  }, [points]);

  const closeSelection = () => {
    if (selection?.restoreFocus) trigger.current?.focus();
    setSelection(null);
    clearHighlight();
  };

  useEffect(() => {
    if (selection) firstChoice.current?.focus({ preventScroll: true });
  }, [selection, page]);

  useLayoutEffect(() => {
    const element = canvas.current;
    const svg = svgRef.current;
    if (!element || !svg) return;
    const context = element.getContext("2d");
    let frame = 0;
    let navigating = false;
    let lastCounts = { symbols: -1, points: -1, grouped: -1 };

    const draw = () => {
      frame = 0;
      if (!context) {
        setUnavailable(true);
        return;
      }
      const matrix = svg.getScreenCTM();
      const bounds = element.getBoundingClientRect();
      if (!matrix || matrix.a <= 0 || matrix.d <= 0 || !bounds.width || !bounds.height) return;
      const camera = { scale: matrix.a, x: matrix.e - bounds.left, y: matrix.f - bounds.top };
      const scene = pointScene(index, {
        left: -camera.x / camera.scale, right: (bounds.width - camera.x) / camera.scale,
        top: -camera.y / camera.scale, bottom: (bounds.height - camera.y) / camera.scale,
      }, camera.scale);
      view.current = { camera, scene };
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (element.width !== width) element.width = width;
      if (element.height !== height) element.height = height;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      paintSymbols(context, scene, camera, fittedWidth / svg.viewBox.baseVal.width);
      if (focusedPoint && focusedMarker.current) {
        const x = focusedPoint.x * camera.scale + camera.x;
        const y = focusedPoint.y * camera.scale + camera.y;
        focusedMarker.current.hidden = x < 0 || y < 0 || x > bounds.width || y > bounds.height;
        focusedMarker.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
      if (lastCounts.symbols !== scene.symbols.length || lastCounts.points !== scene.count || lastCounts.grouped !== scene.grouped) {
        lastCounts = { symbols: scene.symbols.length, points: scene.count, grouped: scene.grouped };
        setCounts(lastCounts);
      }
    };

    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const hit = (event: MouseEvent) => {
      if (!view.current || svg.dataset.navigating === "true") return;
      const { camera, scene } = view.current;
      const { left, top } = element.getBoundingClientRect();
      return closestPointSymbol(scene.symbols, (event.clientX - left - camera.x) / camera.scale,
        (event.clientY - top - camera.y) / camera.scale, 12 / camera.scale);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const symbol = hit(event);
      if (!symbol) {
        clearHighlight();
        return;
      }
      const record = symbol.count === 1 && "records" in symbol ? symbol.records[0] : null;
      highlight(symbol, record?.occurrenceId ? record : null);
    };
    const click = (event: MouseEvent) => {
      // Keyboard activation of an SVG region belongs to the region.
      if (event.detail === 0) return;
      const symbol = hit(event);
      const records = symbol && pointSymbolRecords(symbol).filter(point => point.occurrenceId);
      if (!symbol || !records?.length) return;
      event.stopPropagation();
      if (records.length === 1 && symbol.count === 1) onOpen(records[0]);
      else showSelection(`${symbol.count.toLocaleString("pt-BR")} ocorrências no símbolo`, records, false);
    };
    const mutations = new MutationObserver(() => {
      const moving = svg.dataset.navigating === "true";
      if (moving && !navigating) {
        clearHighlight();
        setSelection(null);
      }
      navigating = moving;
      schedule();
    });
    mutations.observe(svg, { attributes: true, attributeFilter: ["viewBox", "data-navigating"] });
    const sizes = new ResizeObserver(schedule);
    sizes.observe(element);
    if (interactive) {
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerleave", clearHighlight);
      svg.addEventListener("click", click);
    }
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerleave", clearHighlight);
      svg.removeEventListener("click", click);
      clearHighlight();
      view.current = null;
    };
  }, [svgRef, index, fittedWidth, focusedPoint, interactive, clearHighlight, highlight, onOpen, showSelection]);

  const showViewport = () => {
    const scene = view.current?.scene ?? EMPTY_SCENE;
    showSelection("Ocorrências no enquadramento", scene.symbols.flatMap(pointSymbolRecords).filter(point => point.occurrenceId), true);
  };
  const first = page * PAGE_SIZE;

  return <>
    <canvas ref={canvas} className={styles.pointsCanvas} aria-hidden="true"
      data-testid="occurrence-points" data-point-count={counts.points} data-symbol-count={counts.symbols} />
    <span ref={halo} className={styles.pointHalo} hidden aria-hidden="true" />
    {focusedPoint?.occurrenceId && <button ref={focusedMarker} type="button" hidden className={styles.focusedPointMarker}
      data-testid="occurrence-marker" data-occurrence={focusedPoint.occurrenceId} data-selected="true"
      aria-label={`${focusedPoint.underReview ? "Ocorrência selecionada em revisão" : "Ocorrência selecionada"} em ${focusedPoint.raName}`}
      onFocus={() => highlight(focusedPoint, focusedPoint)} onBlur={clearHighlight}
      onMouseEnter={() => highlight(focusedPoint, focusedPoint)} onMouseLeave={clearHighlight}
      onClick={() => onOpen(focusedPoint)} />}
    <div className={`${styles.legend} ${styles.pointLegend}`}>
      <div><span className={`${styles.legendSymbol} ${styles.pointSymbol}`} />Ocorrência individual</div>
      {counts.grouped > 0 && <div><span className={`${styles.legendSymbol} ${styles.pointGroupSymbol}`} />Ocorrências agrupadas ou coincidentes</div>}
      <div data-testid="point-symbol-count">{counts.symbols.toLocaleString("pt-BR")} símbolos · {counts.points.toLocaleString("pt-BR")} pontos no enquadramento</div>
      {unavailable && <div role="status">A camada de pontos está indisponível neste navegador.</div>}
      {interactive && <button ref={trigger} type="button" aria-expanded={Boolean(selection)} aria-controls={selection ? choiceId : undefined}
        onClick={selection ? closeSelection : showViewport} disabled={counts.points === 0}>Selecionar ocorrências</button>}
    </div>
    {selection && <section id={choiceId} className={styles.pointChoices} aria-label={selection.title}
      onKeyDown={event => { if (event.key === "Escape") closeSelection(); }}>
      <div className={styles.pointChoicesHeading}>
        <strong>{selection.title}</strong>
        <button type="button" onClick={closeSelection}>Fechar</button>
      </div>
      {selection.records.length === 0 ? <p>Nenhuma ocorrência com detalhes neste enquadramento.</p> :
        <ol start={first + 1}>
          {selection.records.slice(first, first + PAGE_SIZE).map((point, index) => <li key={point.id}>
            <button ref={index === 0 ? firstChoice : undefined} type="button" onFocus={() => highlight(point, point)}
              onBlur={clearHighlight} onMouseEnter={() => highlight(point, point)} onMouseLeave={clearHighlight}
              onClick={() => onOpen(point)}>Ocorrência {first + index + 1} · {point.raName}</button>
          </li>)}
        </ol>}
      {selection.records.length > PAGE_SIZE && <div className={styles.pointChoicesHeading}>
        <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Anterior</button>
        <span>{first + 1}–{Math.min(first + PAGE_SIZE, selection.records.length)} de {selection.records.length.toLocaleString("pt-BR")}</span>
        <button type="button" disabled={first + PAGE_SIZE >= selection.records.length} onClick={() => setPage(value => value + 1)}>Próxima</button>
      </div>}
    </section>}
  </>;
}

export default memo(PointCanvasLayer);
