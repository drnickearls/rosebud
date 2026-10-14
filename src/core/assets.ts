import blankPdf from '../assets/blank-routing-form.pdf';
import template from '../assets/routing-form.template.json';
import type { FormAssets, FormTemplate } from './pdf.js';

/** The Routing Form artwork and field positions shipped inside the extension (CONTEXT.md, "Form Template"). */
export const bundledAssets: FormAssets = { blankPdf, template: template as FormTemplate };
