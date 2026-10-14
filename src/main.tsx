import { printFromChart, printFromSchedule } from './app.js';
import { watchScheduleLocation } from './ehr/api.js';
import { revolutionEhr } from './ehr/revolution.js';
import { chartPatientId, onSchedulePage } from './ehr/screen.js';
import { currentForm } from './platform/formStore.js';
import { createRoutingForms } from './routingForms/index.js';
import { isBusy, showButton } from './ui/Panel.js';

/**
 * Entry point (MAIN world, at document start so the schedule's own requests are seen).
 * RevolutionEHR is a single-page app with no load events between screens, so the button is
 * reconciled with the current page on a timer (as the Coding Companion does).
 */

watchScheduleLocation();

const forms = createRoutingForms({
  ehr: revolutionEhr,
  form: currentForm,
  now: () => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  },
});

let shown = '';

function sync(): void {
  if (isBusy() || !document.body) return;
  const kind = chartPatientId() ? 'chart' : onSchedulePage() ? 'schedule' : 'none';
  if (kind === shown) return;
  shown = kind;
  showButton(
    kind === 'chart'
      ? { label: 'Routing Form', run: (ui) => printFromChart(ui, forms) }
      : kind === 'schedule'
        ? { label: 'Routing Forms', run: (ui) => printFromSchedule(ui, forms) }
        : null,
  );
}

setInterval(sync, 1000);
sync();
