const number = (value: number) => value.toLocaleString("pt-BR");

/**
 * Text for an RA tooltip on persistent maps. Statistical occurrences and published map points are
 * different measures; an RA without published points is not reported as an RA without crimes.
 */
export function officialRaLines(occurrences: number | undefined, points: number) {
  const lines: string[] = [];
  if (occurrences !== undefined) lines.push(`${number(occurrences)} ${occurrences === 1 ? "ocorrência" : "ocorrências"}`);
  lines.push(points > 0 ? `${number(points)} ${points === 1 ? "ponto" : "pontos"} no mapa` : "Sem pontos georreferenciados");
  return lines;
}
