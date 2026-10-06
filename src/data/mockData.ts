export type CrimeNature = "Furto" | "Roubo" | "Lesão Corporal" | "Ameaça" | "Homicídio" | "Tráfico" | "Estelionato" | "Vandalismo";

export interface RAData {
  codigo: string;
  nome: string;        // matches ra_nome in GeoJSON (uppercase)
  nomeDisplay: string; // formatted for UI display
  nomeCompleto: string;
  occurrence_count: number;
  variation: number;
  most_common_crime: CrimeNature;
  peak_hour: string;
  peak_day: string;
  crimes_by_nature: Record<CrimeNature, number>;
  bounds: [[number, number], [number, number]];
}

export interface Occurrence {
  id: string;
  lat: number;
  lng: number;
  ra_nome: string;
  natureza: CrimeNature;
  data: string;
  horario: string;
}

// nome must match feature.properties.ra_nome (uppercase) from the GeoJSON file
export const RA_LIST: RAData[] = [
  { codigo: "RA-I", nome: "PLANO PILOTO", nomeDisplay: "Plano Piloto", nomeCompleto: "RA I — Plano Piloto", occurrence_count: 1120, variation: 5.2, most_common_crime: "Furto", peak_hour: "18h–22h", peak_day: "Sexta", crimes_by_nature: { Furto: 420, Roubo: 180, "Lesão Corporal": 120, Ameaça: 90, Homicídio: 15, Tráfico: 85, Estelionato: 160, Vandalismo: 50 }, bounds: [[-15.87, -47.98], [-15.72, -47.82]] },
  { codigo: "RA-II", nome: "GAMA", nomeDisplay: "Gama", nomeCompleto: "RA II — Gama", occurrence_count: 830, variation: -3.1, most_common_crime: "Roubo", peak_hour: "20h–00h", peak_day: "Sábado", crimes_by_nature: { Furto: 200, Roubo: 280, "Lesão Corporal": 140, Ameaça: 80, Homicídio: 20, Tráfico: 60, Estelionato: 30, Vandalismo: 20 }, bounds: [[-16.04, -48.08], [-15.96, -47.98]] },
  { codigo: "RA-III", nome: "TAGUATINGA", nomeDisplay: "Taguatinga", nomeCompleto: "RA III — Taguatinga", occurrence_count: 1050, variation: 2.8, most_common_crime: "Furto", peak_hour: "17h–21h", peak_day: "Sexta", crimes_by_nature: { Furto: 380, Roubo: 220, "Lesão Corporal": 160, Ameaça: 100, Homicídio: 18, Tráfico: 70, Estelionato: 62, Vandalismo: 40 }, bounds: [[-15.87, -48.08], [-15.78, -48.01]] },
  { codigo: "RA-IV", nome: "BRAZLÂNDIA", nomeDisplay: "Brazlândia", nomeCompleto: "RA IV — Brazlândia", occurrence_count: 310, variation: 8.4, most_common_crime: "Lesão Corporal", peak_hour: "21h–01h", peak_day: "Domingo", crimes_by_nature: { Furto: 80, Roubo: 60, "Lesão Corporal": 100, Ameaça: 40, Homicídio: 8, Tráfico: 12, Estelionato: 5, Vandalismo: 5 }, bounds: [[-15.73, -48.2], [-15.62, -48.1]] },
  { codigo: "RA-V", nome: "SOBRADINHO", nomeDisplay: "Sobradinho", nomeCompleto: "RA V — Sobradinho", occurrence_count: 1248, variation: 12.4, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Sábado", crimes_by_nature: { Furto: 280, Roubo: 410, "Lesão Corporal": 210, Ameaça: 120, Homicídio: 28, Tráfico: 100, Estelionato: 60, Vandalismo: 40 }, bounds: [[-15.68, -47.82], [-15.55, -47.72]] },
  { codigo: "RA-VI", nome: "PLANALTINA", nomeDisplay: "Planaltina", nomeCompleto: "RA VI — Planaltina", occurrence_count: 1560, variation: 28.6, most_common_crime: "Roubo", peak_hour: "20h–00h", peak_day: "Sábado", crimes_by_nature: { Furto: 350, Roubo: 520, "Lesão Corporal": 280, Ameaça: 150, Homicídio: 45, Tráfico: 130, Estelionato: 50, Vandalismo: 35 }, bounds: [[-15.65, -47.7], [-15.38, -47.5]] },
  { codigo: "RA-VII", nome: "PARANOÁ", nomeDisplay: "Paranoá", nomeCompleto: "RA VII — Paranoá", occurrence_count: 680, variation: 4.1, most_common_crime: "Furto", peak_hour: "18h–22h", peak_day: "Quinta", crimes_by_nature: { Furto: 220, Roubo: 160, "Lesão Corporal": 130, Ameaça: 80, Homicídio: 15, Tráfico: 40, Estelionato: 20, Vandalismo: 15 }, bounds: [[-15.78, -47.78], [-15.62, -47.58]] },
  { codigo: "RA-VIII", nome: "NÚCLEO BANDEIRANTE", nomeDisplay: "Núcleo Bandeirante", nomeCompleto: "RA VIII — Núcleo Bandeirante", occurrence_count: 290, variation: -5.8, most_common_crime: "Furto", peak_hour: "17h–20h", peak_day: "Sexta", crimes_by_nature: { Furto: 110, Roubo: 60, "Lesão Corporal": 55, Ameaça: 35, Homicídio: 5, Tráfico: 10, Estelionato: 10, Vandalismo: 5 }, bounds: [[-15.89, -48.0], [-15.86, -47.97]] },
  { codigo: "RA-IX", nome: "CEILÂNDIA", nomeDisplay: "Ceilândia", nomeCompleto: "RA IX — Ceilândia", occurrence_count: 1842, variation: 6.2, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Sábado", crimes_by_nature: { Furto: 480, Roubo: 620, "Lesão Corporal": 350, Ameaça: 180, Homicídio: 52, Tráfico: 90, Estelionato: 40, Vandalismo: 30 }, bounds: [[-15.9, -48.14], [-15.78, -48.04]] },
  { codigo: "RA-X", nome: "GUARÁ", nomeDisplay: "Guará", nomeCompleto: "RA X — Guará", occurrence_count: 620, variation: -2.3, most_common_crime: "Furto", peak_hour: "17h–21h", peak_day: "Sexta", crimes_by_nature: { Furto: 240, Roubo: 130, "Lesão Corporal": 90, Ameaça: 60, Homicídio: 8, Tráfico: 40, Estelionato: 35, Vandalismo: 17 }, bounds: [[-15.84, -48.01], [-15.79, -47.95]] },
  { codigo: "RA-XI", nome: "CRUZEIRO", nomeDisplay: "Cruzeiro", nomeCompleto: "RA XI — Cruzeiro", occurrence_count: 310, variation: 1.5, most_common_crime: "Furto", peak_hour: "17h–20h", peak_day: "Quinta", crimes_by_nature: { Furto: 130, Roubo: 60, "Lesão Corporal": 50, Ameaça: 30, Homicídio: 4, Tráfico: 15, Estelionato: 14, Vandalismo: 7 }, bounds: [[-15.8, -47.97], [-15.77, -47.94]] },
  { codigo: "RA-XII", nome: "SAMAMBAIA", nomeDisplay: "Samambaia", nomeCompleto: "RA XII — Samambaia", occurrence_count: 1350, variation: 9.7, most_common_crime: "Roubo", peak_hour: "20h–00h", peak_day: "Sábado", crimes_by_nature: { Furto: 320, Roubo: 450, "Lesão Corporal": 270, Ameaça: 140, Homicídio: 38, Tráfico: 80, Estelionato: 28, Vandalismo: 24 }, bounds: [[-15.96, -48.1], [-15.86, -48.0]] },
  { codigo: "RA-XIII", nome: "SANTA MARIA", nomeDisplay: "Santa Maria", nomeCompleto: "RA XIII — Santa Maria", occurrence_count: 980, variation: 7.3, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Sábado", crimes_by_nature: { Furto: 250, Roubo: 320, "Lesão Corporal": 200, Ameaça: 100, Homicídio: 28, Tráfico: 50, Estelionato: 20, Vandalismo: 12 }, bounds: [[-16.0, -48.07], [-15.93, -47.98]] },
  { codigo: "RA-XIV", nome: "SÃO SEBASTIÃO", nomeDisplay: "São Sebastião", nomeCompleto: "RA XIV — São Sebastião", occurrence_count: 750, variation: 3.9, most_common_crime: "Furto", peak_hour: "18h–22h", peak_day: "Sexta", crimes_by_nature: { Furto: 270, Roubo: 190, "Lesão Corporal": 140, Ameaça: 75, Homicídio: 16, Tráfico: 30, Estelionato: 19, Vandalismo: 10 }, bounds: [[-15.92, -47.85], [-15.82, -47.75]] },
  { codigo: "RA-XV", nome: "RECANTO DAS EMAS", nomeDisplay: "Recanto das Emas", nomeCompleto: "RA XV — Recanto das Emas", occurrence_count: 870, variation: 5.1, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Domingo", crimes_by_nature: { Furto: 220, Roubo: 290, "Lesão Corporal": 180, Ameaça: 90, Homicídio: 24, Tráfico: 40, Estelionato: 15, Vandalismo: 11 }, bounds: [[-16.01, -48.08], [-15.96, -48.02]] },
  { codigo: "RA-XVI", nome: "LAGO SUL", nomeDisplay: "Lago Sul", nomeCompleto: "RA XVI — Lago Sul", occurrence_count: 280, variation: -8.2, most_common_crime: "Furto", peak_hour: "15h–19h", peak_day: "Quinta", crimes_by_nature: { Furto: 140, Roubo: 50, "Lesão Corporal": 30, Ameaça: 20, Homicídio: 3, Tráfico: 10, Estelionato: 22, Vandalismo: 5 }, bounds: [[-15.88, -47.9], [-15.79, -47.8]] },
  { codigo: "RA-XVII", nome: "RIACHO FUNDO", nomeDisplay: "Riacho Fundo", nomeCompleto: "RA XVII — Riacho Fundo", occurrence_count: 410, variation: 2.7, most_common_crime: "Furto", peak_hour: "18h–22h", peak_day: "Sexta", crimes_by_nature: { Furto: 160, Roubo: 100, "Lesão Corporal": 80, Ameaça: 40, Homicídio: 8, Tráfico: 10, Estelionato: 8, Vandalismo: 4 }, bounds: [[-15.93, -48.05], [-15.88, -47.99]] },
  { codigo: "RA-XVIII", nome: "LAGO NORTE", nomeDisplay: "Lago Norte", nomeCompleto: "RA XVIII — Lago Norte", occurrence_count: 240, variation: -1.4, most_common_crime: "Furto", peak_hour: "16h–20h", peak_day: "Quinta", crimes_by_nature: { Furto: 110, Roubo: 40, "Lesão Corporal": 35, Ameaça: 20, Homicídio: 2, Tráfico: 8, Estelionato: 18, Vandalismo: 7 }, bounds: [[-15.73, -47.88], [-15.68, -47.82]] },
  { codigo: "RA-XIX", nome: "CANDANGOLÂNDIA", nomeDisplay: "Candangolândia", nomeCompleto: "RA XIX — Candangolândia", occurrence_count: 195, variation: -4.6, most_common_crime: "Furto", peak_hour: "17h–21h", peak_day: "Sexta", crimes_by_nature: { Furto: 80, Roubo: 40, "Lesão Corporal": 35, Ameaça: 18, Homicídio: 3, Tráfico: 8, Estelionato: 7, Vandalismo: 4 }, bounds: [[-15.88, -47.97], [-15.85, -47.94]] },
  { codigo: "RA-XX", nome: "ÁGUAS CLARAS", nomeDisplay: "Águas Claras", nomeCompleto: "RA XX — Águas Claras", occurrence_count: 690, variation: 11.2, most_common_crime: "Furto", peak_hour: "17h–21h", peak_day: "Sexta", crimes_by_nature: { Furto: 260, Roubo: 150, "Lesão Corporal": 110, Ameaça: 70, Homicídio: 10, Tráfico: 35, Estelionato: 45, Vandalismo: 10 }, bounds: [[-15.88, -48.04], [-15.82, -47.98]] },
  { codigo: "RA-XXI", nome: "RIACHO FUNDO II", nomeDisplay: "Riacho Fundo II", nomeCompleto: "RA XXI — Riacho Fundo II", occurrence_count: 380, variation: 6.8, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Sábado", crimes_by_nature: { Furto: 120, Roubo: 130, "Lesão Corporal": 70, Ameaça: 35, Homicídio: 8, Tráfico: 10, Estelionato: 5, Vandalismo: 2 }, bounds: [[-15.97, -48.08], [-15.93, -48.03]] },
  { codigo: "RA-XXII", nome: "SUDOESTE/OCTOGONAL", nomeDisplay: "Sudoeste/Octogonal", nomeCompleto: "RA XXII — Sudoeste/Octogonal", occurrence_count: 195, variation: -18.7, most_common_crime: "Furto", peak_hour: "16h–20h", peak_day: "Quinta", crimes_by_nature: { Furto: 90, Roubo: 30, "Lesão Corporal": 30, Ameaça: 15, Homicídio: 2, Tráfico: 8, Estelionato: 15, Vandalismo: 5 }, bounds: [[-15.81, -47.96], [-15.79, -47.93]] },
  { codigo: "RA-XXIII", nome: "VARJÃO", nomeDisplay: "Varjão", nomeCompleto: "RA XXIII — Varjão", occurrence_count: 220, variation: 14.3, most_common_crime: "Roubo", peak_hour: "21h–01h", peak_day: "Domingo", crimes_by_nature: { Furto: 60, Roubo: 80, "Lesão Corporal": 45, Ameaça: 18, Homicídio: 6, Tráfico: 8, Estelionato: 2, Vandalismo: 1 }, bounds: [[-15.73, -47.87], [-15.71, -47.85]] },
  { codigo: "RA-XXIV", nome: "PARK WAY", nomeDisplay: "Park Way", nomeCompleto: "RA XXIV — Park Way", occurrence_count: 175, variation: -2.8, most_common_crime: "Furto", peak_hour: "15h–18h", peak_day: "Quarta", crimes_by_nature: { Furto: 85, Roubo: 35, "Lesão Corporal": 25, Ameaça: 15, Homicídio: 2, Tráfico: 5, Estelionato: 5, Vandalismo: 3 }, bounds: [[-15.96, -48.01], [-15.9, -47.95]] },
  { codigo: "RA-XXV", nome: "SCIA", nomeDisplay: "SCIA/Estrutural", nomeCompleto: "RA XXV — SCIA/Estrutural", occurrence_count: 640, variation: 15.8, most_common_crime: "Tráfico", peak_hour: "22h–02h", peak_day: "Domingo", crimes_by_nature: { Furto: 140, Roubo: 160, "Lesão Corporal": 120, Ameaça: 60, Homicídio: 22, Tráfico: 100, Estelionato: 20, Vandalismo: 18 }, bounds: [[-15.8, -48.04], [-15.77, -48.01]] },
  { codigo: "RA-XXVI", nome: "SOBRADINHO II", nomeDisplay: "Sobradinho II", nomeCompleto: "RA XXVI — Sobradinho II", occurrence_count: 720, variation: 10.5, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Sábado", crimes_by_nature: { Furto: 180, Roubo: 240, "Lesão Corporal": 150, Ameaça: 75, Homicídio: 18, Tráfico: 35, Estelionato: 14, Vandalismo: 8 }, bounds: [[-15.6, -47.82], [-15.48, -47.7]] },
  { codigo: "RA-XXVII", nome: "JARDIM BOTÂNICO", nomeDisplay: "Jardim Botânico", nomeCompleto: "RA XXVII — Jardim Botânico", occurrence_count: 215, variation: -1.2, most_common_crime: "Furto", peak_hour: "16h–20h", peak_day: "Quinta", crimes_by_nature: { Furto: 100, Roubo: 45, "Lesão Corporal": 35, Ameaça: 18, Homicídio: 2, Tráfico: 5, Estelionato: 8, Vandalismo: 2 }, bounds: [[-15.88, -47.82], [-15.82, -47.76]] },
  { codigo: "RA-XXVIII", nome: "ITAPOÃ", nomeDisplay: "Itapoã", nomeCompleto: "RA XXVIII — Itapoã", occurrence_count: 520, variation: 8.9, most_common_crime: "Roubo", peak_hour: "20h–00h", peak_day: "Sábado", crimes_by_nature: { Furto: 150, Roubo: 180, "Lesão Corporal": 100, Ameaça: 50, Homicídio: 12, Tráfico: 20, Estelionato: 5, Vandalismo: 3 }, bounds: [[-15.74, -47.79], [-15.68, -47.73]] },
  { codigo: "RA-XXIX", nome: "SIA", nomeDisplay: "SIA", nomeCompleto: "RA XXIX — SIA", occurrence_count: 180, variation: -6.2, most_common_crime: "Furto", peak_hour: "08h–12h", peak_day: "Terça", crimes_by_nature: { Furto: 90, Roubo: 40, "Lesão Corporal": 20, Ameaça: 12, Homicídio: 2, Tráfico: 5, Estelionato: 8, Vandalismo: 3 }, bounds: [[-15.84, -47.99], [-15.82, -47.96]] },
  { codigo: "RA-XXX", nome: "VICENTE PIRES", nomeDisplay: "Vicente Pires", nomeCompleto: "RA XXX — Vicente Pires", occurrence_count: 490, variation: 3.4, most_common_crime: "Furto", peak_hour: "17h–21h", peak_day: "Sexta", crimes_by_nature: { Furto: 200, Roubo: 120, "Lesão Corporal": 85, Ameaça: 45, Homicídio: 7, Tráfico: 15, Estelionato: 12, Vandalismo: 6 }, bounds: [[-15.85, -48.07], [-15.79, -48.01]] },
  { codigo: "RA-XXXI", nome: "FERCAL", nomeDisplay: "Fercal", nomeCompleto: "RA XXXI — Fercal", occurrence_count: 260, variation: 18.2, most_common_crime: "Lesão Corporal", peak_hour: "21h–01h", peak_day: "Sábado", crimes_by_nature: { Furto: 60, Roubo: 70, "Lesão Corporal": 85, Ameaça: 28, Homicídio: 7, Tráfico: 6, Estelionato: 2, Vandalismo: 2 }, bounds: [[-15.6, -47.96], [-15.52, -47.86]] },
  { codigo: "RA-XXXII", nome: "SOL NASCENTE E POR DO SOL", nomeDisplay: "Sol Nascente e Pôr do Sol", nomeCompleto: "RA XXXII — Sol Nascente e Pôr do Sol", occurrence_count: 820, variation: 12.1, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Sábado", crimes_by_nature: { Furto: 200, Roubo: 280, "Lesão Corporal": 160, Ameaça: 80, Homicídio: 22, Tráfico: 50, Estelionato: 18, Vandalismo: 10 }, bounds: [[-15.91, -48.17], [-15.85, -48.11]] },
  { codigo: "RA-XXXIII", nome: "ARNIQUEIRA", nomeDisplay: "Arniqueira", nomeCompleto: "RA XXXIII — Arniqueira", occurrence_count: 340, variation: 7.6, most_common_crime: "Furto", peak_hour: "17h–21h", peak_day: "Sexta", crimes_by_nature: { Furto: 140, Roubo: 80, "Lesão Corporal": 60, Ameaça: 30, Homicídio: 5, Tráfico: 12, Estelionato: 8, Vandalismo: 5 }, bounds: [[-15.84, -48.11], [-15.79, -48.06]] },
  { codigo: "RA-XXXIV", nome: "ARAPOANGA", nomeDisplay: "Arapoanga", nomeCompleto: "RA XXXIV — Arapoanga", occurrence_count: 450, variation: 22.4, most_common_crime: "Roubo", peak_hour: "20h–00h", peak_day: "Domingo", crimes_by_nature: { Furto: 110, Roubo: 160, "Lesão Corporal": 100, Ameaça: 45, Homicídio: 12, Tráfico: 15, Estelionato: 5, Vandalismo: 3 }, bounds: [[-15.48, -47.68], [-15.35, -47.55]] },
  { codigo: "RA-XXXV", nome: "AGUA QUENTE", nomeDisplay: "Água Quente", nomeCompleto: "RA XXXV — Água Quente", occurrence_count: 190, variation: 9.3, most_common_crime: "Lesão Corporal", peak_hour: "21h–01h", peak_day: "Sábado", crimes_by_nature: { Furto: 50, Roubo: 55, "Lesão Corporal": 60, Ameaça: 15, Homicídio: 4, Tráfico: 4, Estelionato: 1, Vandalismo: 1 }, bounds: [[-16.06, -47.98], [-15.99, -47.9]] },
  { codigo: "RA-XXXVI", nome: "26 DE SETEMBRO", nomeDisplay: "26 de Setembro", nomeCompleto: "RA XXXVI — 26 de Setembro", occurrence_count: 310, variation: 5.0, most_common_crime: "Roubo", peak_hour: "19h–23h", peak_day: "Sábado", crimes_by_nature: { Furto: 90, Roubo: 105, "Lesão Corporal": 60, Ameaça: 28, Homicídio: 7, Tráfico: 12, Estelionato: 5, Vandalismo: 3 }, bounds: [[-15.82, -48.1], [-15.77, -48.05]] },
  { codigo: "RA-S", nome: "PONTE ALTA", nomeDisplay: "Ponte Alta", nomeCompleto: "Ponte Alta", occurrence_count: 275, variation: 6.1, most_common_crime: "Furto", peak_hour: "18h–22h", peak_day: "Sexta", crimes_by_nature: { Furto: 110, Roubo: 65, "Lesão Corporal": 50, Ameaça: 22, Homicídio: 5, Tráfico: 10, Estelionato: 8, Vandalismo: 5 }, bounds: [[-16.08, -48.01], [-16.02, -47.95]] },
];

export function getRAByNome(nomeDisplay: string): RAData | undefined {
  return RA_LIST.find((r) => r.nomeDisplay === nomeDisplay || r.nome === nomeDisplay.toUpperCase());
}

export function getRAByGeoNome(geoNome: string): RAData | undefined {
  const upper = geoNome.toUpperCase().trim();
  return RA_LIST.find((r) => r.nome === upper);
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const natures: CrimeNature[] = ["Furto", "Roubo", "Lesão Corporal", "Ameaça", "Homicídio", "Tráfico", "Estelionato", "Vandalismo"];

function generateOccurrences(): Occurrence[] {
  const occs: Occurrence[] = [];
  let id = 1;
  for (const ra of RA_LIST) {
    const count = Math.max(4, Math.floor(ra.occurrence_count / 8));
    const [[minLat, minLng], [maxLat, maxLng]] = ra.bounds;
    for (let i = 0; i < count; i++) {
      const hour = Math.floor(Math.random() * 24);
      const minute = Math.floor(Math.random() * 60);
      occs.push({
        id: `#${String(id).padStart(5, "0")}`,
        lat: randomInRange(minLat, maxLat),
        lng: randomInRange(minLng, maxLng),
        ra_nome: ra.nomeDisplay,
        natureza: natures[Math.floor(Math.random() * natures.length)],
        data: `${String(Math.floor(randomInRange(1, 28))).padStart(2, "0")}/${String(Math.floor(randomInRange(1, 8))).padStart(2, "0")}/2026`,
        horario: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      });
      id++;
    }
  }
  return occs;
}

export const OCCURRENCES: Occurrence[] = generateOccurrences();

export const CRIME_NATURES: CrimeNature[] = ["Furto", "Roubo", "Lesão Corporal", "Ameaça", "Homicídio", "Tráfico", "Estelionato", "Vandalismo"];

export const PERIODS = [
  { label: "Hoje", value: "today" },
  { label: "Últimos 7 dias", value: "7d" },
  { label: "Último mês", value: "1m" },
  { label: "Últimos 3 meses", value: "3m" },
  { label: "Últimos 6 meses", value: "6m" },
  { label: "Últimos 12 meses", value: "12m" },
  { label: "Personalizado", value: "custom" },
];

export const HOURS = [
  { label: "Qualquer horário", value: "" },
  { label: "00h–06h (Madrugada)", value: "0-6" },
  { label: "06h–12h (Manhã)", value: "6-12" },
  { label: "12h–18h (Tarde)", value: "12-18" },
  { label: "18h–00h (Noite)", value: "18-24" },
];

export const WEEKDAYS = [
  { label: "Todos os dias", value: "" },
  { label: "Segunda", value: "seg" },
  { label: "Terça", value: "ter" },
  { label: "Quarta", value: "qua" },
  { label: "Quinta", value: "qui" },
  { label: "Sexta", value: "sex" },
  { label: "Sábado", value: "sab" },
  { label: "Domingo", value: "dom" },
];

export const DONUT_COLORS = ["#2563eb", "#22c55e", "#f97316", "#ef4444", "#a855f7", "#06b6d4", "#eab308", "#ec4899"];
