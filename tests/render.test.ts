import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  indexFigmaNodes,
  renderFigmaNode,
  type FigmaNode,
} from '../connectors/figma/render.js';
import type { TokenSummary } from '../connectors/figma/rest.js';

const TOKENS: TokenSummary[] = [
  { name: 'color-primary', type: 'color', value: '#0ea5e9' },
  { name: 'color-ink', type: 'color', value: '#2a1140' },
  { name: 'spacing-md', type: 'spacing', value: '16px' },
  { name: 'spacing-sm', type: 'spacing', value: '8px' },
  { name: 'radius-lg', type: 'radius', value: '12px' },
  { name: 'font-body', type: 'typography', value: 'Inter 16px 600' },
];

test('rendu Figma : auto-layout, tokens et texte échappé', () => {
  const node: FigmaNode = {
    type: 'FRAME',
    layoutMode: 'VERTICAL',
    itemSpacing: 8,
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    cornerRadius: 12,
    fills: [
      {
        type: 'SOLID',
        color: { r: 0x0e / 255, g: 0xa5 / 255, b: 0xe9 / 255, a: 1 },
      },
    ],
    children: [
      {
        type: 'TEXT',
        characters: 'Bonjour <Équipe> & co',
        style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600 },
        fills: [
          {
            type: 'SOLID',
            color: { r: 0x2a / 255, g: 0x11 / 255, b: 0x40 / 255, a: 1 },
          },
        ],
      },
    ],
  };

  const rendered = renderFigmaNode(node, TOKENS);
  assert.equal(rendered.warnings.length, 0);
  assert.match(rendered.code, /display:flex/);
  assert.match(rendered.code, /flex-direction:column/);
  assert.match(rendered.code, /gap:var\(--spacing-sm,8px\)/);
  assert.match(rendered.code, /padding:var\(--spacing-md,16px\)/);
  assert.match(rendered.code, /border-radius:var\(--radius-lg,12px\)/);
  assert.match(rendered.code, /background:var\(--color-primary,#0ea5e9\)/);
  assert.match(rendered.code, /font:var\(--font-body,600 16px Inter,sans-serif\)/);
  assert.match(rendered.code, /color:var\(--color-ink,#2a1140\)/);
  assert.match(rendered.code, /Bonjour &lt;Équipe&gt; &amp; co/);
});

test('rendu Figma : image simplifiée et aperçu vide signalés', () => {
  const image = renderFigmaNode(
    {
      type: 'RECTANGLE',
      fills: [{ type: 'IMAGE', visible: true }],
      width: 120,
      height: 80,
    },
    TOKENS,
  );
  assert.match(image.warnings.join(' '), /images/);
  assert.match(image.code, /repeating-linear-gradient/);

  const empty = renderFigmaNode(undefined, TOKENS);
  assert.equal(empty.code, '');
  assert.match(empty.warnings.join(' '), /pas disponible/);
});

test('index Figma : retrouve les nœuds par identifiant, sans récursion infinie', () => {
  const root: FigmaNode = {
    id: 'root',
    type: 'DOCUMENT',
    children: [
      { id: 'child', type: 'FRAME', children: [{ id: 'text', type: 'TEXT' }] },
    ],
  };
  const index = indexFigmaNodes(root);
  assert.deepEqual([...index.keys()], ['root', 'child', 'text']);
});
