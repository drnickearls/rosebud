import type { CalendarDate } from './types.js';
import { parseUsDate } from './format.js';

/** "Tuesday 10/13/2026 at 9:00 PM" (the chart's Next Appt link) to its date and time. */
export function parseNextApptText(text: string): { date: CalendarDate; time: string } | null {
  const date = parseUsDate(text);
  const m = /(\d{1,2}:\d{2})\s*([AP]M)/i.exec(text);
  if (!date || !m) return null;
  return { date, time: `${m[1]} ${m[2]!.toUpperCase()}` };
}

/** "Cataract Post Op Exam (1. Cataract Post Op)" to "Cataract Post Op Exam". */
export function cleanExamType(text: string): string {
  let type = text.replace(/\s+/g, ' ').trim();
  for (;;) {
    const next = type.replace(/\s*\([^()]*\)\s*$/, '');
    if (next === type) return type;
    type = next;
  }
}

/**
 * The reason for visit staff typed after "RFV" in an appointment's Comments: the first
 * "RFV" anywhere, in any capitals, then an optional colon, dash or space, to the end of
 * that line. null when there is none (other comments are staff notes and never print).
 */
export function parseRfv(comments: string | null | undefined): string | null {
  if (!comments) return null;
  const m = /\brfv\b[ \t:\-\u2013\u2014.]*([^\r\n]*)/i.exec(comments);
  const reason = m?.[1]?.replace(/\s+/g, ' ').trim();
  return reason ? reason : null;
}
