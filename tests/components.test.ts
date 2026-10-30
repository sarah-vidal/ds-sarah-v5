import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFigmaChanges,
  componentSummaries,
} from '../app/client/studio/figmaMock.js';
import { generateComponentCopy } from '../app/client/studio/copy.js';
import {
  mergeImportedComponents,
  mergeableImportGroups,
  type ComponentDoc,
} from '../app/client/studio/model.js';
import type { FigmaChange } from '../app/shared/figma.js';

function component(overrides: Partial<ComponentDoc> = {}): ComponentDoc {
  return {
    id: 'c1',
    name: 'Bouton',
    status: 'Stable',
    description: '',
    do: '',
    dont: '',
    variants: [
      {
        id: 'v1',
        n: 'Par défaut',
        props: {},
        code: '<button>OK</button>',
      },
    ],
    origin: 'manual',
    ...overrides,
  };
}

test('anciens imports éclatés : détection puis fusion sans perte de code', () => {
  const legacy = [
    component({
      id: 'c-primaire',
      name: 'Bouton/Primaire',
      origin: 'import',
      description: 'Importé depuis Figma.',
      variants: [
        {
          id: 'v-primaire',
          n: 'Par défaut',
          props: {},
          code: '<button class="p">Primaire</button>',
        },
      ],
    }),
    component({
      id: 'c-secondaire',
      name: 'Bouton/Secondaire',
      origin: 'import',
      description: 'Importé depuis Figma.',
      variants: [
        {
          id: 'v-secondaire',
          n: 'Par défaut',
          props: {},
          code: '<button class="s">Secondaire</button>',
        },
      ],
    }),
  ];

  const groups = mergeableImportGroups(legacy);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].base, 'Bouton');
  assert.equal(groups[0].components.length, 2);

  const merged = mergeImportedComponents(legacy);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'Bouton');
  assert.equal(merged[0].description, '');
  assert.deepEqual(
    merged[0].variants.map((variant) => variant.n),
    ['Primaire', 'Secondaire'],
  );
  assert.deepEqual(
    merged[0].variants.map((variant) => variant.code),
    [
      '<button class="p">Primaire</button>',
      '<button class="s">Secondaire</button>',
    ],
  );
});

test('ré-import Figma : un seul composant, variantes fusionnées par nœud', () => {
  const changes: FigmaChange[] = [
    {
      id: 'component:set:CS:button',
      category: 'component',
      name: 'Bouton',
      component: {
        key: 'set:CS:button',
        setId: 'CS:button',
        nodeId: 'CS:button',
        description: 'Action principale du produit.',
        variants: [
          {
            nodeId: 'C:small',
            name: 'Size=Small',
            props: { Size: 'Small' },
            code: '<button>Petit</button>',
          },
          {
            nodeId: 'C:large',
            name: 'Size=Large',
            props: { Size: 'Large' },
            code: '<button>Grand</button>',
          },
        ],
      },
    },
  ];

  const first = applyFigmaChanges([], [], changes);
  assert.equal(first.components.length, 1);
  const [created] = first.components;
  assert.equal(created.name, 'Bouton');
  assert.equal(created.figma?.key, 'set:CS:button');
  assert.deepEqual(
    created.variants.map((variant) => [variant.n, variant.figmaNodeId]),
    [
      ['Size=Small', 'C:small'],
      ['Size=Large', 'C:large'],
    ],
  );
  assert.match(created.description, /Action principale/);
  assert.ok(created.do.length > 0);
  assert.ok(created.dont.length > 0);

  const second = applyFigmaChanges([], first.components, [
    {
      ...changes[0],
      component: {
        ...changes[0].component!,
        variants: [
          {
            nodeId: 'C:small',
            name: 'Size=Small',
            props: { Size: 'Small' },
            code: '<button>Petit v2</button>',
          },
        ],
      },
    },
  ]);
  assert.equal(second.components.length, 1);
  assert.equal(second.components[0].variants[0].code, '<button>Petit v2</button>');
  // La variante retirée de Figma disparaît, le composant reste unique.
  assert.deepEqual(
    second.components[0].variants.map((variant) => variant.figmaNodeId),
    ['C:small'],
  );
});

test('ré-import Figma : code et textes manuels préservés', () => {
  const base = component({
    id: 'c-figma',
    name: 'Carte',
    origin: 'figma',
    description: 'Texte maison.',
    do: 'Faire maison.',
    dont: 'Éviter maison.',
    manual: ['description', 'do', 'dont'],
    figma: {
      key: 'set:CS:card',
      nodeId: 'CS:card',
      updatedAt: 1,
    },
    variants: [
      {
        id: 'v-card',
        n: 'Size=Small',
        props: { Size: 'Small' },
        code: '<div class="maison">Carte</div>',
        codeEdited: true,
        figmaNodeId: 'C:card',
      },
    ],
  });

  const next = applyFigmaChanges([], [base], [
    {
      id: 'component:set:CS:card',
      category: 'component',
      name: 'Carte',
      component: {
        key: 'set:CS:card',
        setId: 'CS:card',
        nodeId: 'CS:card',
        description: 'Description Figma.',
        variants: [
          {
            nodeId: 'C:card',
            name: 'Size=Small',
            props: { Size: 'Small' },
            code: '<div class="figma">Nouvelle carte</div>',
          },
        ],
      },
    },
  ]);

  assert.equal(next.components.length, 1);
  const [saved] = next.components;
  assert.equal(saved.description, 'Texte maison.');
  assert.equal(saved.do, 'Faire maison.');
  assert.equal(saved.dont, 'Éviter maison.');
  assert.equal(saved.variants[0].code, '<div class="maison">Carte</div>');
  assert.equal(saved.generated?.description.includes('Description Figma'), true);
});

test('textes générés : déterministes, propriétés et règles d’usage', () => {
  const input = {
    name: 'Bouton',
    variants: [
      {
        id: 'v1',
        n: 'Size=Large, State=Hover',
        props: { Size: 'Large', State: 'Hover' },
        code: '<button>OK</button>',
      },
      {
        id: 'v2',
        n: 'Size=Small, State=Default',
        props: { Size: 'Small', State: 'Default' },
        code: '<button>OK</button>',
      },
    ],
  };

  const first = generateComponentCopy(input);
  const second = generateComponentCopy(input);
  assert.deepEqual(first, second);
  assert.match(first.description, /Bouton/);
  assert.match(first.description, /2 variantes/);
  assert.match(first.description, /Size \(Large, Small\)/);
  assert.match(first.do, /À faire|•/);
  assert.match(first.do, /survol/);
  assert.match(first.dont, /•/);
});

test('résumés envoyés au serveur : identité et propriétés, sans code', () => {
  const summaries = componentSummaries([
    component({
      figma: { key: 'set:CS:button', setId: 'CS:button', updatedAt: 1 },
      variants: [
        {
          id: 'v1',
          n: 'Size=Small',
          props: { Size: 'Small' },
          code: '<button>Petit</button>',
          figmaNodeId: 'C:small',
        },
      ],
    }),
  ]);

  assert.deepEqual(summaries, [
    {
      name: 'Bouton',
      key: 'set:CS:button',
      setId: 'CS:button',
      variants: [{ n: 'Size=Small', props: { Size: 'Small' }, nodeId: 'C:small' }],
    },
  ]);
  assert.ok(!JSON.stringify(summaries).includes('<button>'));
});
