// Settings: one page with tabs for everything that is not the daily work of sending letters.
// Each tab is an existing page, shown under the tab bar: General (signatory, sending rules,
// operators, backups), Templates, Connection (the seven flows) and Activity (every report).

import { esc } from '../util.js';
import * as General from './settings.js';
import * as Templates from './templates.js';
import * as Connection from './flows.js';
import * as Activity from './activity.js';

const TABS = [
  ['general', 'General', General, 'Signatory, sending rules, operators and backups'],
  ['templates', 'Templates', Templates, 'The wording of each kind of letter'],
  ['connection', 'Connection', Connection, 'The seven Power Automate flows and SharePoint'],
  ['activity', 'Activity', Activity, 'A report of everything the mailer has done'],
];

export async function render(app, params = []) {
  const [tab = 'general', ...rest] = params;
  const [key, , view] = TABS.find((t) => t[0] === tab) || TABS[0];
  const out = await view.render(app, rest);
  const bar = `<nav class="tabs" aria-label="Settings">${TABS.map(([k, label, , hint]) => `<a href="#/settings/${k}" title="${esc(hint)}" class="${k === key ? 'active' : ''}" ${k === key ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>`;
  return { ...out, title: `Settings · ${out.title || ''}`, html: bar + out.html };
}
