import {
  checkboxList,
  colorPicker,
  datePicker,
  field,
  form,
  inputField,
  panel,
  radioGroup,
  rangeSlider,
  sidePanel,
  slider,
  stack,
  text,
  toggleSwitch,
  wizardDialog
} from '@ismail-elkorchi/terminal-ui/widgets';

import { inspectorCard, printProductExample } from './product-shell.mjs';

const beforeStep = 1;
const afterStep = 2;

printProductExample({
  id: 'form-wizard-product',
  source: 'examples/products/form-wizard.mjs',
  workflow: 'form-wizard',
  action: 'advance review step',
  appName: 'Launch Planner',
  route: 'Deployment wizard',
  subtitle: 'Caller-owned form state with wizard progress and controls',
  status: 'ready',
  commandValue: '/advance review',
  commandFooter: 'Wizard advanced to the review step',
  main: panel({
    title: 'Wizard form',
    body: stack([
      wizardDialog({
        id: 'deployment-wizard',
        title: 'Publish deployment',
        width: 72,
        height: 21,
        steps: [
          { id: 'scope', label: 'Scope' },
          { id: 'controls', label: 'Controls' },
          { id: 'review', label: 'Review' }
        ],
        currentStep: afterStep,
        body: form([
          field(inputField({ value: 'northstar-control', cursor: 17 }), { label: 'Release name', required: true }),
          field(radioGroup({
            label: 'Track',
            selected: 'stable',
            options: [
              { value: 'canary', label: 'Canary' },
              { value: 'stable', label: 'Stable' }
            ]
          }), { label: 'Track' }),
          field(checkboxList({
            label: 'Checks',
            selected: ['a11y', 'fixtures'],
            options: [
              { value: 'a11y', label: 'Accessibility' },
              { value: 'fixtures', label: 'Visual fixtures' },
              { value: 'docs', label: 'Docs' }
            ]
          }), { label: 'Required checks' }),
          field(stack([
            slider({ label: 'Traffic', value: 40, min: 0, max: 100, width: 24 }),
            rangeSlider({ label: 'Window', start: 2, end: 8, min: 0, max: 12, width: 24 })
          ], { gap: 1 }), { label: 'Rollout' })
        ])
      })
    ])
  }),
  side: sidePanel({
    title: 'Review',
    body: stack([
      inspectorCard('Wizard state', [
        `step before: ${String(beforeStep)}`,
        `step after: ${String(afterStep)}`,
        'track: stable',
        'traffic: 40%'
      ]),
      toggleSwitch({ label: 'Ready to publish', checked: true }),
      colorPicker({
        label: 'Theme',
        selected: 'blue',
        columns: 3,
        options: [
          { value: 'blue', label: 'blue' },
          { value: 'green', label: 'green' },
          { value: 'amber', label: 'amber' }
        ]
      }),
      datePicker({
        label: 'Window',
        selected: 'wed',
        columns: 3,
        days: [
          { value: 'mon', label: 'Mon' },
          { value: 'tue', label: 'Tue' },
          { value: 'wed', label: 'Wed' },
          { value: 'thu', label: 'Thu' },
          { value: 'fri', label: 'Fri' }
        ]
      }),
      text('Review step is visible after the scripted transition.')
    ], { gap: 1 })
  }),
  meta: {
    stepBefore: beforeStep,
    stepAfter: afterStep,
    ready: true
  }
});
