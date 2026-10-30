import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_VARIABLES,
  importVariablesToChanges,
  parseVariablesImport,
} from '../app/shared/variables.js';
import { applyFigmaChanges } from '../app/client/studio/figmaMock.js';
import type { Token } from '../app/client/studio/model.js';

const PLUGIN_EXPORT = {
  format: 'ds-studio/variables',
  version: 1,
  file: { name: 'DS-Sarah — Produit' },
  variables: [
    {
      name: 'Colors/Primary/500',
      type: 'COLOR',
      value: '#0EA5E9',
      description: 'Action principale.',
    },
    { name: 'spacing/md', type: 'spacing', value: 16 },
    {
      name: 'Font Heading',
      type: 'font',
      value: {
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 28,
        fontWeight: 'Bold',
      },
    },
    { name: 'radius-lg', type: 'radius', value: '16px' },
    {
      name: 'shadow/card',
      type: 'effect',
      value: '0 10px 15px -3px rgba(42,17,64,0.3)',
    },
  ],
  components: [{ name: 'Badge', variants: ['Par défaut', 'Info'] }],
};

test('import : format du plugin, noms normalisés et valeurs converties', () => {
  const parsed = parseVariablesImport(JSON.stringify(PLUGIN_EXPORT));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(
    parsed.data.variables.map((variable) => [variable.name, variable.type]),
    [
      ['colors-primary-500', 'color'],
      ['spacing-md', 'spacing'],
      ['font-heading', 'typography'],
      ['radius-lg', 'radius'],
      ['shadow-card', 'shadow'],
    ],
  );
  assert.equal(parsed.data.variables[0].value, '#0ea5e9');
  assert.equal(parsed.data.variables[1].value, '16px');
  assert.equal(parsed.data.variables[2].value, 'Plus Jakarta Sans 28px 700');
  assert.deepEqual(parsed.data.components, [
    { name: 'Badge', variants: ['Par défaut', 'Info'] },
  ]);
  assert.deepEqual(parsed.data.warnings, []);
});

test('import : conversion en changements sans suppression ni écrasement de code', () => {
  const parsed = parseVariablesImport(JSON.stringify(PLUGIN_EXPORT));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const tokens: Token[] = [
    {
      id: 't1',
      name: 'colors-primary-500',
      type: 'color',
      value: '#000000',
      description: '',
    },
    {
      id: 't2',
      name: 'spacing-md',
      type: 'spacing',
      value: '16px',
      description: '',
    },
  ];
  const components = [
    {
      id: 'c1',
      name: 'Bouton',
      status: 'Stable' as const,
      description: '',
      do: '',
      dont: '',
      variants: [
        {
          id: 'v1',
          n: 'Principal',
          props: {},
          code: '<button>Garder</button>',
        },
      ],
    },
  ];

  const converted = importVariablesToChanges(parsed.data, tokens, components);
  assert.equal(converted.unchanged, 1);
  assert.equal(converted.variables, 5);
  assert.equal(converted.components, 1);
  assert.equal(
    converted.changes.find((change) => change.name === 'colors-primary-500')
      ?.oldValue,
    '#000000',
  );
  assert.equal(
    converted.changes.find((change) => change.name === 'colors-primary-500')
      ?.newValue,
    '#0ea5e9',
  );
  assert.ok(
    converted.changes.every((change) => change.id.startsWith('import:')),
  );
  assert.equal(
    converted.changes.filter((change) => change.category === 'component')
      .length,
    1,
  );
  const badgeChange = converted.changes.find(
    (change) => change.category === 'component',
  );
  assert.equal(badgeChange?.component?.variants.length, 2);
  assert.equal(badgeChange?.component?.variants[1]?.name, 'Info');

  const applied = applyFigmaChanges(tokens, components, converted.changes);
  const button = applied.components.find(
    (component) => component.name === 'Bouton',
  );
  assert.equal(button?.variants[0].code, '<button>Garder</button>');
  assert.equal(button?.variants.length, 1);
  const badge = applied.components.find(
    (component) => component.name === 'Badge',
  );
  assert.deepEqual(
    badge?.variants.map((variant) => variant.n),
    ['Par défaut', 'Info'],
  );
  assert.equal(applied.tokens.length, 5);
  assert.equal(
    applied.tokens.find((token) => token.name === 'radius-lg')?.type,
    'radius',
  );
  assert.equal(
    applied.tokens.find((token) => token.name === 'shadow-card')?.description,
    'Importé depuis un fichier de variables.',
  );
});

test('import : conflit de type signalé, jamais appliqué', () => {
  const parsed = parseVariablesImport(
    JSON.stringify({
      format: 'ds-studio/variables',
      version: 1,
      variables: [{ name: 'spacing-md', type: 'color', value: '#ffffff' }],
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const converted = importVariablesToChanges(
    parsed.data,
    [{ name: 'spacing-md', type: 'spacing', value: '16px' }],
    [],
  );
  assert.deepEqual(converted.changes, []);
  assert.match(converted.warnings.join(' '), /n’est pas du type color/);
});

test('import : export natif DS-Studio et tableau brut acceptés', () => {
  const tokensExport = parseVariablesImport(
    JSON.stringify({
      tokens: [
        {
          id: 't1',
          name: 'color-primary-500',
          type: 'color',
          value: '#0ea5e9',
          description: '',
        },
      ],
    }),
  );
  assert.equal(tokensExport.ok, true);
  if (tokensExport.ok)
    assert.equal(tokensExport.data.variables[0].name, 'color-primary-500');

  const bare = parseVariablesImport(
    JSON.stringify([{ name: 'radius-sm', type: 'radius', value: 6 }]),
  );
  assert.equal(bare.ok, true);
  if (bare.ok) assert.equal(bare.data.variables[0].value, '6px');
});

test('import : erreurs structurelles et limites', () => {
  const invalidJson = parseVariablesImport('{');
  assert.equal(invalidJson.ok, false);
  if (!invalidJson.ok) assert.match(invalidJson.error, /JSON valide/);

  const invalidFormat = parseVariablesImport(
    JSON.stringify({ format: 'autre/format', variables: [] }),
  );
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok)
    assert.match(invalidFormat.error, /Format non reconnu/);

  const restExport = parseVariablesImport(
    JSON.stringify({ meta: { variables: {} }, status: 200 }),
  );
  assert.equal(restExport.ok, false);
  if (!restExport.ok) assert.match(restExport.error, /plugin DS-Studio/);

  const tooMany = parseVariablesImport(
    JSON.stringify({
      variables: Array.from(
        { length: MAX_IMPORT_VARIABLES + 1 },
        (_, index) => ({
          name: `color-${index}`,
          type: 'color',
          value: '#000000',
        }),
      ),
    }),
  );
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.match(tooMany.error, /limite/);

  const tooLarge = parseVariablesImport('x'.repeat(MAX_IMPORT_BYTES + 1));
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) assert.match(tooLarge.error, /limite/);

  const noVariables = parseVariablesImport(JSON.stringify({ version: 1 }));
  assert.equal(noVariables.ok, false);
  if (!noVariables.ok) assert.match(noVariables.error, /Format non reconnu/);
});

test('import : entrées invalides ignorées avec avertissement, valeurs sûres', () => {
  const parsed = parseVariablesImport(
    JSON.stringify({
      variables: [
        { name: 'color-alpha', type: 'color', value: '#12345678' },
        {
          name: 'shadow-danger',
          type: 'shadow',
          value: '0 0 4px red; background:url(x)',
        },
        {
          name: 'font-broken',
          type: 'typography',
          value: 'Inter 12px',
        },
        { name: 'radius-negative', type: 'radius', value: -4 },
        { name: 'color-ok', type: 'color', value: '#ABC' },
        { name: 'color-ok', type: 'color', value: '#ffffff' },
      ],
      components: [{ name: '', variants: [] }],
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(
    parsed.data.variables.map((variable) => variable.name),
    ['color-ok'],
  );
  assert.equal(parsed.data.variables[0].value, '#aabbcc');
  assert.ok(parsed.data.warnings.length >= 5);
  assert.deepEqual(parsed.data.components, []);
});
