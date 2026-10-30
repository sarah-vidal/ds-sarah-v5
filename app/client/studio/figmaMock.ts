import type {
  ComponentDoc,
  GeneratedCopy,
  ManualCopyField,
  Token,
  Variant,
} from './model.js';
import { newId, parseVariantProps, propsLabel, propsKey } from './model.js';
import { generateComponentCopy } from './copy.js';
import type {
  FigmaComponentPayload,
  FigmaComponentVariant,
} from '../../shared/figma.js';
import {
  extractFigmaKey,
  isFigmaDemo,
  type FigmaCategory,
  type FigmaChange,
  type FigmaFile,
  type FigmaSelection,
  type FigmaServerStatus,
  type FigmaStatus,
} from '../../shared/figma.js';
import { IMPORT_CHANGE_PREFIX } from '../../shared/variables.js';

export type {
  FigmaCategory,
  FigmaChange,
  FigmaFile,
  FigmaSelection,
  FigmaServerStatus,
  FigmaStatus,
} from '../../shared/figma.js';
export { extractFigmaKey, isFigmaDemo } from '../../shared/figma.js';

export interface FigmaSession {
  status: FigmaStatus;
  user: string | null;
  file: FigmaFile | null;
  changes: FigmaChange[];
  selection: FigmaSelection;
  lastSync: number | null;
  step: 'connect' | 'content';
}

export interface FigmaImportMeta {
  name: string;
  count: number;
  variables: number;
  components: number;
  warnings: string[];
}

export interface FigmaUndoSnapshot {
  tokens: Token[];
  components: ComponentDoc[];
  changes: FigmaChange[];
  selection: FigmaSelection;
  lastSync: number | null;
  status?: FigmaStatus;
  file?: FigmaFile | null;
  importMeta?: FigmaImportMeta | null;
}

export const ALL_CATEGORIES: FigmaSelection = {
  color: true,
  spacing: true,
  typography: true,
  radius: true,
  shadow: true,
  component: true,
};

export const UNDO_STORAGE_KEY = 'dss-undo';

/**
 * Données simulées conservées pour `?figma=…`. Le chemin réel interroge les
 * routes serveur ; ces valeurs ne servent jamais quand `reel=1` est présent.
 */
export const FIGMA_MOCK: {
  user: { name: string };
  file: FigmaFile;
  changes: FigmaChange[];
} = {
  user: { name: 'Sarah Dupont' },
  file: {
    key: 'dSsarah2026',
    name: 'DS-Sarah — Produit',
    modified: 'modifié il y a 3 h',
  },
  changes: [
    {
      id: 'color-primary',
      category: 'color',
      name: 'color-primary-500',
      oldValue: '#0ea5e9',
      newValue: '#7c3aed',
    },
    {
      id: 'color-surface',
      category: 'color',
      name: 'color-surface-900',
      oldValue: '#0f172a',
      newValue: '#1e1b4b',
    },
    {
      id: 'color-accent',
      category: 'color',
      name: 'color-accent-500',
      newValue: '#14b8a6',
    },
    {
      id: 'font-heading',
      category: 'typography',
      name: 'font-heading-lg',
      oldValue: 'Inter 24px 700',
      newValue: 'Plus Jakarta Sans 28px 700',
    },
    {
      id: 'shadow-card',
      category: 'shadow',
      name: 'shadow-card',
      oldValue: '0 10px 15px -3px rgba(0,0,0,0.3)',
      newValue: '0 12px 20px -4px rgba(42,17,64,0.28)',
    },
    {
      id: 'component-badge',
      category: 'component',
      name: 'Badge',
      variant: 'Par défaut',
    },
    {
      id: 'component-button-link',
      category: 'component',
      name: 'Bouton',
      variant: 'Lien',
    },
  ],
};

const DEMO_STATES = new Set<FigmaStatus>([
  'deconnecte',
  'connecte_sans_fichier',
  'connecte',
  'erreur_autorisation',
]);

function disconnectedSession(): FigmaSession {
  return {
    status: 'deconnecte',
    user: null,
    file: null,
    changes: [],
    selection: { ...ALL_CATEGORIES },
    lastSync: null,
    step: 'connect',
  };
}

export function disconnectedFigmaSession(): FigmaSession {
  return disconnectedSession();
}

/**
 * `?figma=connecte`, `?figma=erreur_autorisation`… permet de prévisualiser
 * chaque état de démonstration. Sans ce paramètre, le client interroge le
 * serveur réel via `/api/figma/status`.
 */
export function initialFigmaSession(search = ''): FigmaSession {
  const requested = new URLSearchParams(search).get('figma');
  if (
    !isFigmaDemo(search) ||
    !requested ||
    !DEMO_STATES.has(requested as FigmaStatus)
  ) {
    return disconnectedSession();
  }

  const status = requested as FigmaStatus;
  if (status === 'deconnecte') return disconnectedSession();

  const session: FigmaSession = {
    status,
    user: FIGMA_MOCK.user.name,
    file: status === 'connecte_sans_fichier' ? null : FIGMA_MOCK.file,
    changes: status === 'connecte_sans_fichier' ? [] : [...FIGMA_MOCK.changes],
    selection: { ...ALL_CATEGORIES },
    lastSync: status === 'connecte' ? Date.now() - 2 * 60 * 1000 : null,
    step: 'connect',
  };
  return session;
}

/**
 * Fusionne l’état réel renvoyé par le serveur avec la session locale. Les
 * changements et la sélection restent gérés par l’interface ; le serveur ne
 * connaît ni les tokens locaux ni les composants.
 */
export function serverFigmaSession(
  status: FigmaServerStatus,
  current: FigmaSession,
): FigmaSession {
  return {
    ...current,
    status: status.status,
    user: status.user,
    file: status.file,
    lastSync: status.lastSync ?? current.lastSync,
    step: 'connect',
  };
}

/** Résumé minimal envoyé au serveur : ni identifiant, ni description, ni code. */
export function tokenSummaries(tokens: Token[]) {
  return tokens.map((token) => ({
    name: token.name,
    type: token.type,
    value: token.value,
  }));
}

export function componentSummaries(components: ComponentDoc[]) {
  return components.map((component) => ({
    name: component.name,
    ...(component.figma?.key ? { key: component.figma.key } : {}),
    ...(component.figma?.setId ? { setId: component.figma.setId } : {}),
    variants: component.variants.map((variant) => ({
      n: variant.n,
      ...(Object.keys(variant.props).length
        ? { props: { ...variant.props } }
        : {}),
      ...(variant.figmaNodeId ? { nodeId: variant.figmaNodeId } : {}),
    })),
  }));
}

export function countFigmaChanges(
  changes: FigmaChange[],
): Record<FigmaCategory, number> {
  const counts: Record<FigmaCategory, number> = {
    color: 0,
    spacing: 0,
    typography: 0,
    radius: 0,
    shadow: 0,
    component: 0,
  };
  for (const change of changes) {
    counts[change.category] += 1;
  }
  return counts;
}

export function selectedFigmaChanges(
  changes: FigmaChange[],
  selection: FigmaSelection,
): FigmaChange[] {
  return changes.filter((change) => selection[change.category]);
}

export function relativeTime(
  timestamp: number | null,
  now = Date.now(),
): string {
  if (timestamp === null) return 'inconnue';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'à l’instant';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

/**
 * Applique uniquement les changements choisis. Un composant Figma arrive avec
 * toutes ses variantes : le composant existant est mis à jour par clé (ou par
 * nom pour les anciens imports), sans doublon. Un code modifié à la main et les
 * textes marqués manuels sont préservés.
 */
export function applyFigmaChanges(
  tokens: Token[],
  components: ComponentDoc[],
  changes: FigmaChange[],
): { tokens: Token[]; components: ComponentDoc[] } {
  const nextTokens = tokens.map((token) => ({ ...token }));
  const nextComponents = components.map((component) => ({
    ...component,
    variants: component.variants.map((variant) => ({ ...variant })),
  }));

  for (const change of changes) {
    const imported = change.id.startsWith(IMPORT_CHANGE_PREFIX);
    if (change.category === 'component') {
      const payload = change.component;
      const remote = !imported && !!payload;
      const incoming = incomingVariants(change);
      const name = cleanName(change.name);
      if (!name && !payload) continue;

      let index = -1;
      if (payload?.key)
        index = nextComponents.findIndex(
          (component) => component.figma?.key === payload.key,
        );
      if (index === -1)
        index = nextComponents.findIndex(
          (component) =>
            component.name.toLowerCase() === name.toLowerCase() &&
            (!remote || isImportedComponent(component)),
        );

      if (index === -1) {
        const created: ComponentDoc = {
          id: newId('c'),
          name: name || 'Composant Figma',
          status: 'Stable',
          description: '',
          do: '',
          dont: '',
          variants: [],
          origin: remote ? 'figma' : 'import',
          ...(remote && payload
            ? {
                figma: {
                  key: payload.key,
                  ...(payload.setId ? { setId: payload.setId } : {}),
                  nodeId: payload.nodeId,
                  ...(payload.description
                    ? { description: payload.description.slice(0, 2000) }
                    : {}),
                  updatedAt: Date.now(),
                },
              }
            : {}),
        };
        created.variants = incoming.map((variant) => ({
          id: newId('v'),
          n: variantName(variant),
          props: { ...variant.props },
          code: variant.code,
          ...(variant.warnings?.length
            ? { warnings: [...variant.warnings].slice(0, 6) }
            : {}),
          ...(variant.nodeId ? { figmaNodeId: variant.nodeId } : {}),
        }));
        if (!created.variants.length)
          created.variants = [
            { id: newId('v'), n: 'Par défaut', props: {}, code: '' },
          ];
        const generated = safeCopy(created);
        created.description = generated.description;
        created.do = generated.do;
        created.dont = generated.dont;
        created.generated = generated;
        nextComponents.push(created);
        continue;
      }

      const existing = nextComponents[index];
      const merged = existing.variants.map((variant) => ({ ...variant }));
      const incomingIds = new Set<string>();
      for (const variant of incoming) {
        if (variant.nodeId) incomingIds.add(variant.nodeId);
        const at = findVariant(merged, variant);
        if (at === -1) {
          merged.push({
            id: newId('v'),
            n: variantName(variant),
            props: { ...variant.props },
            code: variant.code,
            ...(variant.warnings?.length
              ? { warnings: [...variant.warnings].slice(0, 6) }
              : {}),
            ...(variant.nodeId ? { figmaNodeId: variant.nodeId } : {}),
          });
          continue;
        }
        const current = merged[at];
        const code = current.codeEdited
          ? current.code
          : variant.code.trim()
            ? variant.code
            : current.code;
        merged[at] = {
          ...current,
          n: variantName(variant) || current.n,
          props: Object.keys(variant.props).length
            ? { ...variant.props }
            : current.props,
          code,
          ...(variant.warnings?.length
            ? { warnings: [...variant.warnings].slice(0, 6) }
            : {}),
          ...(variant.nodeId ? { figmaNodeId: variant.nodeId } : {}),
        };
      }

      let variants = merged;
      // Une variante supprimée dans Figma disparaît, sauf si son code a été
      // retravaillé localement. Les variantes ajoutées à la main restent.
      if (remote && incomingIds.size)
        variants = merged.filter(
          (variant) =>
            !variant.figmaNodeId ||
            incomingIds.has(variant.figmaNodeId) ||
            variant.codeEdited,
        );
      if (!variants.length)
        variants = [
          { id: newId('v'), n: 'Par défaut', props: {}, code: '' },
        ];

      const generatedSource = { ...existing, name: name || existing.name, variants };
      const generated = safeCopy(generatedSource);
      const manual = new Set<ManualCopyField>(existing.manual ?? []);
      // Détecte une rédaction manuelle même si elle précède le marquage
      // explicite : un champ différent du dernier texte généré est préservé.
      for (const field of ['description', 'do', 'dont'] as const) {
        if (!existing[field].trim()) continue;
        if (!existing.generated || existing[field] !== existing.generated[field])
          manual.add(field);
      }
      const figmaDescription = remote
        ? payload?.description?.trim().slice(0, 2000)
        : undefined;

      nextComponents[index] = {
        ...existing,
        name: name || existing.name,
        description: manual.has('description')
          ? existing.description
          : figmaDescription || generated.description,
        do: manual.has('do') ? existing.do : generated.do,
        dont: manual.has('dont') ? existing.dont : generated.dont,
        variants,
        ...(manual.size
          ? { manual: [...manual] }
          : existing.manual
            ? { manual: existing.manual }
            : {}),
        generated: {
          description: figmaDescription || generated.description,
          do: generated.do,
          dont: generated.dont,
        },
        origin: existing.origin ?? (remote ? 'figma' : 'import'),
        ...(remote && payload
          ? {
              figma: {
                key: payload.key,
                ...(payload.setId ? { setId: payload.setId } : {}),
                nodeId: payload.nodeId,
                ...(figmaDescription
                  ? { description: figmaDescription }
                  : existing.figma?.description
                    ? { description: existing.figma.description }
                    : {}),
                updatedAt: Date.now(),
              },
            }
          : existing.figma
            ? { figma: existing.figma }
            : {}),
      };
      continue;
    }

    if (!change.newValue) continue;
    const index = nextTokens.findIndex((token) => token.name === change.name);
    if (index === -1) {
      nextTokens.push({
        id: `t${Date.now()}-${change.id}`,
        name: change.name,
        type: change.category,
        value: change.newValue,
        description: imported
          ? 'Importé depuis un fichier de variables.'
          : 'Importé depuis Figma.',
      });
    } else {
      nextTokens[index] = {
        ...nextTokens[index],
        value: change.newValue,
      };
    }
  }

  return { tokens: nextTokens, components: nextComponents };
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function isImportedComponent(component: ComponentDoc): boolean {
  return (
    !!component.figma ||
    component.origin === 'figma' ||
    component.origin === 'import' ||
    component.origin === 'migrated' ||
    /^Importé depuis/.test(component.description.trim())
  );
}

function incomingVariants(change: FigmaChange): FigmaComponentVariant[] {
  const payload: FigmaComponentPayload | undefined = change.component;
  if (payload?.variants?.length) return payload.variants;
  if (change.variant) {
    return [
      {
        nodeId: '',
        name: change.variant,
        props: parseVariantProps(change.variant),
        code: '',
      },
    ];
  }
  return [
    { nodeId: '', name: 'Par défaut', props: {}, code: '' },
  ];
}

function variantName(variant: FigmaComponentVariant): string {
  return (
    cleanName(variant.name) ||
    propsLabel(variant.props) ||
    'Variante'
  );
}

function findVariant(
  variants: Variant[],
  incoming: FigmaComponentVariant,
): number {
  if (incoming.nodeId) {
    const byNode = variants.findIndex(
      (variant) => variant.figmaNodeId === incoming.nodeId,
    );
    if (byNode !== -1) return byNode;
  }
  if (Object.keys(incoming.props).length) {
    const key = propsKey(incoming.props);
    const byProps = variants.findIndex(
      (variant) =>
        Object.keys(variant.props).length > 0 &&
        propsKey(variant.props) === key,
    );
    if (byProps !== -1) return byProps;
  }
  const name = variantName(incoming).toLowerCase();
  return variants.findIndex(
    (variant) => variant.n.trim().toLowerCase() === name,
  );
}

function safeCopy(component: ComponentDoc): GeneratedCopy {
  try {
    return generateComponentCopy(component);
  } catch {
    // La génération ne doit jamais bloquer un import : champs vides éditables.
    return { description: '', do: '', dont: '' };
  }
}

export function parseUndoSnapshot(
  raw: string | null,
): FigmaUndoSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FigmaUndoSnapshot> | null;
    if (
      !value ||
      !Array.isArray(value.tokens) ||
      !Array.isArray(value.components) ||
      !Array.isArray(value.changes) ||
      !value.selection
    ) {
      return null;
    }
    return value as FigmaUndoSnapshot;
  } catch {
    return null;
  }
}
