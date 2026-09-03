// N7: the preferences link must appear in the RENDERED HTML of every alert
// family, not merely in a source file.
import { assert, done } from './_util.mjs';
import { renderTemplate } from './_render-template.mjs';

const LINK_TEXT = 'Gérer vos préférences de notification';
const LINK_HREF = '/settings/notifications';

const rows = [
  { assetName: 'Nacelle Haulotte HA16RTJ', serialNumber: 'NAC-1', category: 'Nacelle', location: 'Depot', dueDate: '10/09/2026', daysRemaining: 4 },
];

const cases = [
  { file: 'lib/email/templates/vgp-overdue.tsx', export: 'VGPOverdue',
    props: { organizationName: 'Org', schedules: rows, alertType: 'overdue', appUrl: 'https://app.example.com' } },
  { file: 'lib/email/templates/vgp-reminder-1day.tsx', export: 'VGPReminder1Day',
    props: { organizationName: 'Org', schedules: rows, alertType: 'reminder_1day', appUrl: 'https://app.example.com' } },
  { file: 'lib/email/templates/vgp-reminder-7day.tsx', export: 'VGPReminder7Day',
    props: { organizationName: 'Org', schedules: rows, alertType: 'reminder_7day', appUrl: 'https://app.example.com' } },
  { file: 'lib/email/templates/vgp-reminder-15day.tsx', export: 'VGPReminder15Day',
    props: { organizationName: 'Org', schedules: rows, alertType: 'reminder_15day', appUrl: 'https://app.example.com' } },
  { file: 'lib/email/templates/vgp-reminder-30day.tsx', export: 'VGPReminder30Day',
    props: { organizationName: 'Org', schedules: rows, alertType: 'reminder_30day', appUrl: 'https://app.example.com' } },
  { file: 'lib/email/templates/vgp-digest.tsx', export: 'VGPDigest',
    props: { organizationName: 'Org', totalCount: 1, appUrl: 'https://app.example.com', period: 'daily',
             sections: [{ alertType: 'overdue', urgencyLevel: 'overdue', schedules: rows }] } },
  { file: 'lib/email/templates/vgp-digest.tsx', export: 'VGPDigest', label: 'weekly digest',
    props: { organizationName: 'Org', totalCount: 1, appUrl: 'https://app.example.com', period: 'weekly',
             sections: [{ alertType: 'reminder_7day', urgencyLevel: 'urgent', schedules: rows }] } },
];

const NBSP = String.fromCharCode(0x00a0);
function plain(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&apos;|&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .split(NBSP).join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const c of cases) {
  const label = c.label || c.export;
  const html = await renderTemplate(c.file, c.export, c.props);
  const text = plain(html);

  // Control: the render actually produced the email, so a missing link below
  // is a real absence rather than an empty render.
  assert(text.length > 300, `${label}: rendered non-trivially (${text.length} chars)`);
  assert(text.includes('TraviXO'), `${label}: render control - brand present`);

  assert(text.includes(LINK_TEXT), `${label}: carries the preferences link text`);
  assert(html.includes(`https://app.example.com${LINK_HREF}`),
    `${label}: link points at ${LINK_HREF}`);
}

// Negative control: the checker can detect absence. A string that is NOT in the
// footer must fail the same test, proving the assertion is not vacuous.
const html = await renderTemplate(cases[0].file, cases[0].export, cases[0].props);
assert(!plain(html).includes('Gérer vos préférences de facturation'),
  'negative control: an absent phrase is correctly reported as absent');

done('N7_FOOTER_VERIFIED');
