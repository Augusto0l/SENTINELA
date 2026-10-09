export interface RaFeature {
  type: "Feature";
  properties: {
    ra_codigo: string;
    ra_nome: string;
    ra_areakm2?: number;
    [key: string]: unknown;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface RaGeoJSON {
  type: "FeatureCollection";
  features: RaFeature[];
}

export async function loadRaGeoJSON(): Promise<RaGeoJSON | null> {
  try {
    const res = await fetch("/data/ras-df.geojson");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.features?.length) return null;
    return data as RaGeoJSON;
  } catch {
    return null;
  }
}
