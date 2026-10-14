import { timeToMinutes } from './format.js';

/** One appointment as it is ordered and listed for printing. */
export interface ScheduleEntry {
  provider: string; // "Last, First", as the schedule's column header shows it
  time: string; // start, "9:00 AM"
  chartName: string; // "Potter, Harry"
  patientId: string;
}

export interface ProviderGroup<T extends ScheduleEntry = ScheduleEntry> {
  provider: string;
  entries: T[];
}

/**
 * One group per provider, providers in the order given (the columns' order on screen),
 * each provider's patients by time; a patient with two appointments for the same provider
 * keeps only the earlier one.
 */
export function groupByProvider<T extends ScheduleEntry>(entries: T[], providerOrder: string[]): ProviderGroup<T>[] {
  const order = [...providerOrder];
  for (const entry of entries) if (!order.includes(entry.provider)) order.push(entry.provider);
  const groups: ProviderGroup<T>[] = [];
  for (const provider of order) {
    const mine = entries
      .filter((e) => e.provider === provider)
      .sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0));
    const seen = new Set<string>();
    const unique = mine.filter((e) => {
      if (seen.has(e.patientId)) return false;
      seen.add(e.patientId);
      return true;
    });
    if (unique.length > 0) groups.push({ provider, entries: unique });
  }
  return groups;
}
