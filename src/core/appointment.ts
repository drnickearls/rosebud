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
