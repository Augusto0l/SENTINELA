import { RA_LIST, type CrimeNature } from "./mockData";
import { MOCK_OCCURRENCES } from "./mockOccurrences";
import { summarizeDemo } from "./demoAnalytics";

// Only client screens import this module, preserving the Canvas-based mocks.
export const DEMO_SUMMARY = summarizeDemo(MOCK_OCCURRENCES);
export const DEMO_RA_LIST = RA_LIST.map((ra) => {
  const summary = summarizeDemo(MOCK_OCCURRENCES.filter((record) => record.raCode === ra.codigo));
  return {
    ...ra,
    occurrence_count: summary.total,
    crimes_by_nature: summary.byNature as Record<CrimeNature, number>,
    most_common_crime: summary.topNature as CrimeNature,
    peak_hour: summary.peakHour,
    peak_day: summary.peakDay,
  };
});
