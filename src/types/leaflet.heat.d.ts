import * as L from "leaflet";

declare module "leaflet" {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<string, string>;
  }

  class HeatLayer extends L.Layer {
    constructor(latlngs: [number, number, number?][], options?: HeatLayerOptions);
    setLatLngs(latlngs: [number, number, number?][]): this;
    addLatLng(latlng: [number, number, number?]): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  function heatLayer(latlngs: [number, number, number?][], options?: HeatLayerOptions): HeatLayer;
}

export {};
