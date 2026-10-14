/** Everything printed on one Routing Form. Keys match the Form Template's field keys. */
export interface FormValues {
  provider: string; // last name only: the provider this appointment is with
  date: string; // MM/DD/YYYY
  appointmentTime: string; // 9:00 PM
  name: string; // First Last
  dob: string; // MM/DD/YYYY
  age: string;
  patientId: string;
  balanceDue: string; // dollars and cents, or '' when nothing is owed
  reasonForVisit: string; // `Exam type — reason`, or just the exam type
}

/** A calendar date as year, month (1-12), day: no time zone, so no off-by-one surprises. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** One line on a Provider Cover Page. */
export interface CoverRow {
  time: string;
  name: string;
  examType: string;
}

export interface CoverPage {
  provider: string;
  dateLabel: string;
  rows: CoverRow[];
}

/** The pieces of a printed document, in order. */
export type PrintPart = { kind: 'cover'; cover: CoverPage } | { kind: 'form'; values: FormValues };
