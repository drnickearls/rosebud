# Rosebud

An Edge extension that sits on top of RevolutionEHR, reads a patient's scheduling and demographic details, and prints them onto the practice's paper form as a PDF, so staff handwrite only the clinical parts. Related to, but separate from, the Coding Companion (see ../revolutionehr-code-packages/CONTEXT.md); it reuses that project's techniques, not its code or vocabulary.

## Language

**Routing Form**:
The one-page paper form the practice prints per patient visit and fills in by hand during the exam. Rosebud pre-fills part of it. "Facesheet" is an accepted informal synonym the user sometimes uses (settled 2026-10-13).
_Avoid_: print form

**Pre-filled Field**:
A Routing Form field Rosebud prints for the user, as opposed to one left blank for handwriting. Now (v0.1.3): Provider, Date, Appointment Time, Name, D.O.B., Age, ID #, Balance Due, Reason For Visit. The set is expected to change later.
_Avoid_: autofill (RevolutionEHR-side meaning), merge field

**Form Template**:
The blank Routing Form artwork plus the position and style of each Pre-filled Field on it. Swappable without changing Rosebud's code (see Form Settings). The original spreadsheet is only how the first template was authored; it is not kept as the working format.
_Avoid_: spreadsheet, layout

**Balance Due**:
The dollar amount the patient owes, printed on the Routing Form's "Balance due" line as dollars and cents, or as "0" when nothing is owed (blank only if the balance could not be read).

(Balance Due = RevolutionEHR's **Patient Balance** on the Account panel — not Insurance Balance, Family Balance or any credit. Settled 2026-10-13.)

**Chart Mode**:
Rosebud started from a patient's chart (patient summary page); prints one Routing Form for that patient.

**Schedule Mode**:
Rosebud started from the schedule screen, for the date and providers on screen; prints the whole day, or only the selected patient.

**Next Appt / Last Exam**:
The two RevolutionEHR patient-summary entries (Exam History panel) that decide which appointment a Chart Mode form is for; Rosebud reads the same facts from the service behind that panel. A patient who has been checked in moves from Next Appt to Last Exam, and Last Exam shows a date only, never a time.

**Appointment Time**:
The start time of the patient's earliest appointment on the Routing Form's date, taken from Next Appt when possible, otherwise from the schedule.

**RFV (Reason For Visit)**:
The short reason for the appointment, typed by staff into the appointment's Comments box after the letters "RFV", and printed on the Routing Form's Reason For Visit line after the exam type. Ends at the first line break.

**Provider Cover Page**:
A summary page in a multi-provider print that names one provider and how many exams they have, placed before that provider's Routing Forms so where one provider's stack ends and the next begins is obvious. Not a Routing Form.

**Form Settings**:
The extension's settings page (opened from the toolbar button or the extension's "Extension options") where the office manager replaces the Routing Form artwork, drags the fields into place, test prints with a made-up patient, and saves it on that computer. **Share form** writes the form as a file into the `forms` folder inside the Rosebud folder, and **Load a form file** on another computer reads it from there. The result is still a Form Template; "reformatting the form" means using this, not changing Rosebud's code.
