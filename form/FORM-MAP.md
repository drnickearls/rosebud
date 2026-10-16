# Routing Form — machine-readable map

Early cell map, from the 10/12 version of the sheet (the current form is `Routing Form 2026-10-14 (edited).xlsx`, whose rows have moved since: see TODO.md; current field positions are in `src/assets/routing-form.template.json`). Sheet1 only; Sheet2/3 empty. Grid A1:K50, portrait, fit-to-page, 0.25–0.28" margins, centered.
Cell addresses are the xlsx cells where the label text starts. Underscores (`____`) are the handwriting blanks.

## Fields Rosebud pre-fills (v1)

| Field | Cell | Printed text | Notes |
|---|---|---|---|
| Date | D1 | `Date:__________________` | Appointment date |
| Appointment Time | H1 | `Appointment Time:__________________` | |
| Name | A3 | `Name ______________________________` | **A3 is ONE string** holding all four fields below |
| D.O.B. | A3 | `D.O.B. ____/____/____` | substring of A3 |
| Age | A3 | `Age_________` | substring of A3 |
| ID # | A3 | `ID #____________` | substring of A3 |
| Balance due | I7 | `Balance due: $____` | |

Because A3 is a single text run, Name/DOB/Age/ID positions must be measured as sub-spans of that string
(character offsets: Name blank, D.O.B. blanks, Age blank, ID # blank), not as separate cells.

## Handwritten-only sections (left blank by Rosebud)

Rows 5–6 Vision insurance (VSP, Eye Med, AE Assurance Gold/Silver, Other), Vision CoPay (A6), screening photo covered (D6), COB (H6).
Rows 8–10 Medical insurance checkboxes (Aetna, BCBS, Cigna, Encore, Humana, IU Health, IU MC, Medicare, Sagamore, Tricare, UHC, Other, OON), Medical CoPay (A10), Exam Cash Discount (H10).
Row 12 Reason For Visit. Rows 13–40 clinical block: Tech/Dr In-Out/Scribe/Extern (J13–J17), Last Manifest + PD/NCT/BP/Dilation/Acuities (A15–A26, C15–G22), DM/A1C (J19–K20), Additional Tests (G21–J25), Reason For Next Visit A/B/C (A28–A41) with visit-type checkboxes (A31–J40).
Rows 42–50 Supplies, CL Information, CL co-pays (A49, A50).

## Full cell dump (Sheet1)

Row 1: D1 `Date:___`, H1 `Appointment Time:___`
Row 3: A3 `Name ___ D.O.B. ___ Age___ ID #___`
Row 5: A5 Vision Insurance:, C5 VSP, D5 Eye Med, E5 AE Assurance - Gold __ Silver___, H5 Other
Row 6: A6 Vision CoPay: $___, D6 Screening photo covered: Yes/No, H6 COB: Yes/No
Row 7: **I7 Balance due: $____**
Row 8: A8 Medical Insurance:, C8 Aetna, D8 BCBS, E8 Cigna, F8 Encore, G8 Humana, H8 IU Health, I8 IU MC
Row 9: C9 Medicare, D9 Sagamore, E9 Tricare, F9 UHC, G9 Other, I9 OON, J9 ______
Row 10: A10 Medical CoPay: $___, H10 Exam Cash Discount: -$48.60 from refraction____
Row 12: A12 Reason For Visit (RFV):
Rows 13–50: see source file (clinical block, next-visit grid, supplies, CL info).

## Open items before building the PDF template
- Blank-PDF export of this sheet (no Excel/LibreOffice on this PC yet) — needed for the overlay approach.
- Merged cells: E5:G5, G21:I21, J22:K22, J23:K23, J17:K17, D37:E37, A14:I14, A15:B15, A26:C26, G27:H27, G19:I19, C17:D17, E30:F30, C16:D16, D34:E34, G17:I17, G20:I20.
