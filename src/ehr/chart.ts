import { parseNextApptText } from '../core/appointment.js';
import { parseUsDate } from '../core/format.js';
import type { CalendarDate } from '../core/types.js';
import { clean, isShown, linesOf } from './dom.js';

/** What the patient summary page shows (CONTEXT.md, "Next Appt / Last Exam"). */
export interface ChartRead {
  patientId: string;
  chartName: string; // "Potter, Harry"
  dob: CalendarDate;
  balance: string | null; // Patient Balance as shown, "$0.00"
  next: { date: CalendarDate; time: string; examType: string; link: HTMLElement } | null;
  lastExamDate: CalendarDate | null;
}

/** The patient id in the address of a patient summary page, or null on any other page. */
export function chartPatientId(hash = location.hash): string | null {
  return /\/patients\/patient\/(\d+)\/patient-summary/.exec(hash)?.[1] ?? null;
}

/** The second cell of an Exam History row ("Last Exam" / "Next Appt"). */
function examHistoryCell(label: string): HTMLElement | null {
  const strong = [...document.querySelectorAll('strong')].find((s) => clean(s.textContent) === label && isShown(s));
  const row = strong?.closest('tr');
  return (row?.children[1] as HTMLElement | undefined) ?? null;
}

/**
 * Reads the open patient summary page; null while it is still loading. The header's id is
 * checked against the address, so a stale panel from another patient is never read.
 */
export function readChart(): ChartRead | null {
  const patientId = chartPatientId();
  if (!patientId) return null;
  const header = document.querySelector<HTMLElement>('#patient-info-panel');
  const h4 = header?.querySelector<HTMLElement>('h4.media-heading');
  if (!header || !h4 || !isShown(h4)) return null;

  const headerId = /#(\d+)/.exec(h4.querySelector('small')?.textContent ?? '')?.[1];
  if (headerId !== patientId) return null;
  const chartName = clean([...h4.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && clean(n.textContent))?.textContent);
  const dobText = [...header.querySelectorAll('li')].map((li) => clean(li.textContent)).find((t) => /\d{1,2}\/\d{1,2}\/\d{4}\s*\(/.test(t));
  const dob = dobText ? parseUsDate(dobText) : null;
  if (!chartName || !dob) return null;

  const balanceLabel = [...document.querySelectorAll('td')].find((td) => clean(td.textContent) === 'Patient Balance' && isShown(td));
  const balance = balanceLabel?.nextElementSibling ? clean(balanceLabel.nextElementSibling.textContent) : null;

  const nextCell = examHistoryCell('Next Appt');
  const nextLink = nextCell?.querySelector<HTMLElement>('a') ?? null;
  const nextParsed = nextLink ? parseNextApptText(nextLink.textContent ?? '') : null;
  const nextLines = nextCell ? linesOf(nextCell) : [];
  const next =
    nextLink && nextParsed
      ? { date: nextParsed.date, time: nextParsed.time, examType: nextLines[1] ?? '', link: nextLink }
      : null;

  const lastCell = examHistoryCell('Last Exam');
  const lastExamDate = lastCell ? parseUsDate(lastCell.textContent ?? '') : null;

  return { patientId, chartName, dob, balance, next, lastExamDate };
}

/** True once the Exam History panel has drawn (so "no appointment" is a fact, not a loading state). */
export function chartIsLoaded(): boolean {
  return examHistoryCell('Next Appt') !== null && examHistoryCell('Last Exam') !== null && document.querySelector('#patient-info-panel h4.media-heading small') !== null;
}
