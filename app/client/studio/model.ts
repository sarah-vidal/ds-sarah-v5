export const TYPES = {
  color: 'Couleurs',
  spacing: 'Espacements',
  typography: 'Typographie',
  radius: 'Arrondis',
  shadow: 'Ombres',
} as const;

export type TokenType = keyof typeof TYPES;

export interface Token {
  id: string;
  name: string;
  type: TokenType;
  value: string;
  description: string;
}

/**
 * Une variante garde son identité, ses propriétés Figma structurées
 * (`Size=Large`, `State=Hover`) et son propre rendu HTML. Les champs `props`
 * restent vides pour les variantes créées à la main.
 */
export interface Variant {
  id: string;
  n: string;
  props: Record<string, string>;
  code: string;
  /** Avertissements d’aperçu (image simplifiée, code partiel, etc.). */
  warnings?: string[];
  /** Le code a été modifié dans le panneau : un ré-import ne l’écrase pas. */
  codeEdited?: boolean;
  /** Identifiant du nœud Figma, stable pour retrouver la variante au ré-import. */
  figmaNodeId?: string;
}

/**
 * `status` reste dans le contrat de stockage pour préserver les données
 * existantes de `dss-comps`. L’interface ne l’affiche ni ne le modifie plus.
 */
export type ComponentStatus = 'Stable' | 'En test' | 'Déprécié';

/** Champs rédigés à la main, à ne pas écraser lors d’un ré-import. */
export type ManualCopyField = 'description' | 'do' | 'dont';

export interface GeneratedCopy {
  description: string;
  do: string;
  dont: string;
}

/** Identité Figma stable d’un component set ou d’un composant isolé. */
export interface ComponentFigmaLink {
  key: string;
  setId?: string;
  nodeId?: string;
  updatedAt: number;
  /** Description portée par le composant ou le component set dans Figma. */
  description?: string;
}

export interface ComponentDoc {
  id: string;
  name: string;
  status: ComponentStatus;
  description: string;
  do: string;
  dont: string;
  variants: Variant[];
  /** Absent pour un composant créé à la main. */
  figma?: ComponentFigmaLink;
  /** Dernière version générée, utilisée pour détecter une rédaction manuelle. */
  generated?: GeneratedCopy;
  /** Champs que l’utilisateur a rédigés : le ré-import les préserve. */
  manual?: ManualCopyField[];
  origin?: 'manual' | 'figma' | 'import' | 'migrated';
}

export const TOKEN_STORAGE_KEY = 'dss-tokens';
/** Nouvelle clé : l’ancienne (`dss-comps`) reste intacte comme sauvegarde. */
export const COMP_STORAGE_KEY = 'dss-comps:v2';
export const LEGACY_COMP_STORAGE_KEY = 'dss-comps';

export function newId(prefix = 'v'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const MAX_PROP_VALUES = 24;

/** Lit `Size=Large, State=Hover` sans dépendre de la casse des clés. */
export function parseVariantProps(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const part of String(name).split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).replace(/\s+/g, ' ').trim();
    const value = part
      .slice(separator + 1)
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || !value || key.length > 60 || value.length > 120) continue;
    if (Object.keys(props).length >= MAX_PROP_VALUES) break;
    props[key] = value;
  }
  return props;
}

export function propsKey(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([key, value]) => `${key.toLowerCase()}=${value.toLowerCase()}`)
    .sort()
    .join('|');
}

export function propsLabel(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

/** Signature stable utilisée pour rapprocher une variante d’un ré-import. */
export function variantIdentity(variant: Variant): string {
  if (variant.figmaNodeId) return `node:${variant.figmaNodeId}`;
  if (Object.keys(variant.props).length) return `props:${propsKey(variant.props)}`;
  return `name:${variant.n.trim().toLowerCase()}`;
}

export function variantPropsList(
  variant: Variant,
): Array<{ key: string; value: string }> {
  return Object.entries(variant.props).map(([key, value]) => ({ key, value }));
}

// Helpers de démonstration : les variantes fournies n’ont pas de propriétés
// Figma, mais elles reçoivent une identité stable pour l’édition et la copie.
let demoVariantSequence = 0;
function demoVariant(n: string, code: string): Variant {
  demoVariantSequence += 1;
  return {
    id: `demo-${demoVariantSequence}`,
    n,
    props: {},
    code,
  };
}

export const T0: Token[] = [
  {
    id: 't1',
    name: 'color-primary-500',
    type: 'color',
    value: '#0ea5e9',
    description: 'Action principale.',
  },
  {
    id: 't2',
    name: 'color-secondary-600',
    type: 'color',
    value: '#6366f1',
    description: 'Accent secondaire.',
  },
  {
    id: 't3',
    name: 'color-danger-500',
    type: 'color',
    value: '#ef4444',
    description: 'Alertes et actions destructives.',
  },
  {
    id: 't4',
    name: 'color-surface-900',
    type: 'color',
    value: '#0f172a',
    description: 'Fond sombre des conteneurs.',
  },
  {
    id: 't5',
    name: 'spacing-xs',
    type: 'spacing',
    value: '4px',
    description: 'Espacement minimal.',
  },
  {
    id: 't6',
    name: 'spacing-md',
    type: 'spacing',
    value: '16px',
    description: 'Espacement standard des cartes.',
  },
  {
    id: 't7',
    name: 'spacing-xl',
    type: 'spacing',
    value: '32px',
    description: 'Séparation des grandes sections.',
  },
  {
    id: 't8',
    name: 'font-heading-lg',
    type: 'typography',
    value: 'Inter 24px 700',
    description: 'Titre principal.',
  },
  {
    id: 't9',
    name: 'font-body-sm',
    type: 'typography',
    value: 'Inter 12px 400',
    description: 'Texte secondaire.',
  },
  {
    id: 't10',
    name: 'radius-sm',
    type: 'radius',
    value: '6px',
    description: 'Boutons et champs.',
  },
  {
    id: 't11',
    name: 'radius-lg',
    type: 'radius',
    value: '16px',
    description: 'Cartes et fenêtres.',
  },
  {
    id: 't12',
    name: 'shadow-card',
    type: 'shadow',
    value: '0 10px 15px -3px rgba(0,0,0,0.3)',
    description: 'Cartes surélevées.',
  },
];

/**
 * Les aperçus utilisent les classes de niveau de bouton : elles portent les
 * états hover/active/focus, contrairement aux fonds posés en style inline.
 */
const btn = (
  label: string,
  variant = 'p',
  pad = '10px var(--spacing-md,16px)',
  fontSize = 14,
  attrs = '',
) =>
  `<button class="b ${variant}" ${attrs}style="padding:${pad};border-radius:var(--radius-sm,6px);font:500 ${fontSize}px Inter,sans-serif">${label}</button>`;

const card = (
  css: string,
  inner = '',
  pad = 'var(--spacing-xl,32px)',
  titleFont = 'font:var(--font-heading-lg,700 24px Inter,sans-serif)',
) =>
  `<div style="padding:${pad};border-radius:var(--radius-lg,16px);font:var(--font-body-sm,400 12px Inter,sans-serif);${css}">\n  <strong style="${titleFont}">Titre de la carte</strong>\n  <p>Description courte.</p>${inner}\n</div>`;

const inp = (css: string, attrs = '', help = '') =>
  `<div style="width:100%">\n  <label style="display:block;font:500 12px Inter,sans-serif;margin-bottom:var(--spacing-xs,4px);color:#12141A">Nom</label>\n  <input type="text" ${attrs}style="width:100%;padding:10px 12px;border-radius:var(--radius-sm,6px);font:var(--font-body-sm,400 12px Inter,sans-serif);background:#fff;color:#12141A;${css}">${help}\n</div>`;

const small = (color: string, text: string) =>
  `\n  <small style="display:block;margin-top:var(--spacing-xs,4px);color:${color};font:var(--font-body-sm,400 12px Inter,sans-serif)">${text}</small>`;

const DK =
  'background:var(--x-surf,#0f172a);color:var(--x-surf-ink,#fff);box-shadow:var(--shadow-card,0 10px 15px -3px rgba(0,0,0,.3))';

export const C0: ComponentDoc[] = [
  {
    id: 'c1',
    name: 'Bouton',
    status: 'Stable',
    description: 'Déclenche l’action principale d’un écran.',
    do: 'Un seul bouton principal par écran, avec un verbe court.',
    dont: 'Ne pas aligner plusieurs boutons principaux ni écrire de longs libellés.',
    variants: [
      demoVariant('Principal', btn('Action principale', 'p')),
      demoVariant('Secondaire', btn('Secondaire', 's')),
      demoVariant('Danger', btn('Supprimer', 'd')),
      demoVariant('Discret', btn('Annuler', 'discret')),
      demoVariant(
        'Désactivé',
        btn(
          'Indisponible',
          'p',
          '10px var(--spacing-md,16px)',
          14,
          'disabled ',
        ),
      ),
      demoVariant('Petit', btn('Petit', 'p', '6px 12px', 12)),
      demoVariant('Grand', btn('Grand', 'p', '14px var(--spacing-xl,32px)', 16)),
    ],
  },
  {
    id: 'c2',
    name: 'Carte',
    status: 'Stable',
    description: 'Regroupe les informations et actions d’un même sujet.',
    do: 'Garder les mêmes marges internes d’une carte à l’autre.',
    dont: 'Ne pas imbriquer plus de deux niveaux de cartes.',
    variants: [
      demoVariant('Sombre', card(DK)),
      demoVariant(
        'Claire',
        card('background:#fff;color:#12141A;border:1px solid #8A94A6'),
      ),
      demoVariant(
        'Sélectionnée',
        card(
          'background:#fff;color:#12141A;border:2px solid var(--x-p-text,#0369a1)',
        ),
      ),
      demoVariant(
        'Avec action',
        card(
          DK,
          `\n  ${btn('Ouvrir', 'p', '8px var(--spacing-md,16px)', 13)}`,
        ),
      ),
      demoVariant(
        'Compacte',
        card(
          DK,
          '',
          'var(--spacing-md,16px)',
          'font:700 16px Inter,sans-serif',
        ),
      ),
    ],
  },
  {
    id: 'c3',
    name: 'Champ de saisie',
    status: 'En test',
    description: 'Saisie de texte avec états de focus et d’erreur.',
    do: 'Toujours placer un libellé visible au-dessus du champ.',
    dont: 'Ne pas remplacer le libellé par un texte indicatif.',
    variants: [
      demoVariant(
        'Par défaut',
        inp('border:1px solid #8A94A6', 'placeholder="Marie Dupont" '),
      ),
      demoVariant(
        'Rempli',
        inp('border:1px solid #8A94A6', 'value="Marie Dupont" '),
      ),
      demoVariant(
        'Focus',
        inp(
          'border:2px solid var(--x-p-text,#0369a1);outline:0',
          'value="Marie" ',
        ),
      ),
      demoVariant(
        'Erreur',
        inp(
          'border:1.5px solid var(--x-d-text,#b91c1c)',
          '',
          small('var(--x-d-text,#b91c1c)', 'Ce champ est obligatoire.'),
        ),
      ),
      demoVariant(
        'Désactivé',
        inp(
          'border:1px solid #C9CED6;background:#F2F4F7;color:#667085',
          'value="Marie Dupont" disabled ',
        ),
      ),
      demoVariant(
        'Avec aide',
        inp(
          'border:1px solid #8A94A6',
          'placeholder="Marie Dupont" ',
          small('#5C6675', 'Prénom et nom, comme sur votre pièce d’identité.'),
        ),
      ),
    ],
  },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function loadTokens(): Token[] {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (t): t is Token =>
              !!t &&
              typeof t === 'object' &&
              typeof (t as Token).id === 'string' &&
              typeof (t as Token).name === 'string' &&
              typeof (t as Token).value === 'string' &&
              (t as Token).type in TYPES,
          )
          .map((t) => ({
            ...t,
            description: String(t.description ?? ''),
          }));
      }
    }
  } catch {
    /* Stockage indisponible : on repart des valeurs de démonstration. */
  }
  return clone(T0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COPY_FIELDS: readonly ManualCopyField[] = [
  'description',
  'do',
  'dont',
];

function storedFigma(value: unknown): ComponentFigmaLink | undefined {
  if (!isRecord(value)) return undefined;
  const key = typeof value.key === 'string' ? value.key.trim().slice(0, 200) : '';
  if (!key) return undefined;
  const setId =
    typeof value.setId === 'string' && value.setId.trim()
      ? value.setId.trim().slice(0, 200)
      : undefined;
  const nodeId =
    typeof value.nodeId === 'string' && value.nodeId.trim()
      ? value.nodeId.trim().slice(0, 200)
      : undefined;
  return {
    key,
    ...(setId ? { setId } : {}),
    ...(nodeId ? { nodeId } : {}),
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : 0,
    ...(typeof value.description === 'string' && value.description.trim()
      ? { description: value.description.trim().slice(0, 2000) }
      : {}),
  };
}

function storedCopy(value: unknown): GeneratedCopy | undefined {
  if (!isRecord(value)) return undefined;
  return {
    description:
      typeof value.description === 'string' ? value.description.slice(0, 4000) : '',
    do: typeof value.do === 'string' ? value.do.slice(0, 4000) : '',
    dont: typeof value.dont === 'string' ? value.dont.slice(0, 4000) : '',
  };
}

function storedVariant(value: unknown, fallbackId: string): Variant | null {
  if (!isRecord(value)) return null;
  const n = String(value.n ?? '').trim().slice(0, 160);
  const props: Record<string, string> = {};
  if (isRecord(value.props)) {
    for (const [key, raw] of Object.entries(value.props)) {
      const name = String(key).trim().slice(0, 60);
      const text = String(raw ?? '').trim().slice(0, 120);
      if (!name || !text) continue;
      if (Object.keys(props).length >= 24) break;
      props[name] = text;
    }
  }
  if (!Object.keys(props).length && n.includes('='))
    Object.assign(props, parseVariantProps(n));
  const label = n || propsLabel(props) || 'Variante';
  const id =
    typeof value.id === 'string' && value.id.trim()
      ? value.id.trim().slice(0, 200)
      : fallbackId;
  return {
    id,
    n: label,
    props,
    code: String(value.code ?? ''),
    ...(Array.isArray(value.warnings)
      ? {
          warnings: value.warnings
            .filter((warning): warning is string => typeof warning === 'string')
            .map((warning) => warning.slice(0, 300))
            .slice(0, 6),
        }
      : {}),
    ...(value.codeEdited === true ? { codeEdited: true } : {}),
    ...(typeof value.figmaNodeId === 'string' && value.figmaNodeId.trim()
      ? { figmaNodeId: value.figmaNodeId.trim().slice(0, 200) }
      : {}),
  };
}

/** Normalise une entrée stockée, y compris l’ancien format `{n, code}`. */
export function normalizeStoredComponent(value: unknown): ComponentDoc | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 200) : '';
  const name =
    typeof value.name === 'string' ? value.name.trim().slice(0, 160) : '';
  if (!id || !name) return null;

  const figma = storedFigma(value.figma);
  const fallbackVariants = C0.find((demo) => demo.id === id)?.variants;
  let variants = Array.isArray(value.variants)
    ? value.variants
        .map((variant, variantIndex) =>
          storedVariant(
            variant,
            fallbackVariants?.[variantIndex]?.id ?? `legacy-${id}-${variantIndex}`,
          ),
        )
        .filter((variant): variant is Variant => !!variant)
    : [];
  if (!variants.length) variants = clone(fallbackVariants ?? []);
  if (!variants.length)
    variants = [{ id: newId('v'), n: 'Par défaut', props: {}, code: '' }];

  const usedIds = new Set<string>();
  variants = variants.map((variant, variantIndex) => {
    let variantId = variant.id;
    if (usedIds.has(variantId))
      variantId = `legacy-${id}-${variantIndex}-${variantId}`;
    usedIds.add(variantId);
    return { ...variant, id: variantId };
  });

  const manualValues = Array.isArray(value.manual)
    ? value.manual.filter((field): field is string => typeof field === 'string')
    : [];
  const manual = COPY_FIELDS.filter((field) => manualValues.includes(field));
  const origin = ['manual', 'figma', 'import', 'migrated'].includes(
    String(value.origin),
  )
    ? (value.origin as ComponentDoc['origin'])
    : figma
      ? 'figma'
      : value.description === 'Importé depuis un fichier de variables.'
        ? 'import'
        : 'manual';

  return {
    id,
    name,
    status:
      value.status === 'Stable' ||
      value.status === 'En test' ||
      value.status === 'Déprécié'
        ? value.status
        : 'Stable',
    description: String(value.description ?? ''),
    do: String(value.do ?? ''),
    dont: String(value.dont ?? ''),
    variants,
    ...(figma ? { figma } : {}),
    ...(storedCopy(value.generated)
      ? { generated: storedCopy(value.generated) }
      : {}),
    ...(manual.length ? { manual } : {}),
    origin,
  };
}

export function loadComponents(): ComponentDoc[] {
  try {
    // Nouvelle clé d’abord, puis reprise non destructive de l’ancienne.
    const raw =
      localStorage.getItem(COMP_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_COMP_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed
          .map((component) => normalizeStoredComponent(component))
          .filter((component): component is ComponentDoc => !!component);
    }
  } catch {
    /* Stockage indisponible : on repart des valeurs de démonstration. */
  }
  return clone(C0);
}

export function saveTokens(tokens: Token[]): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    /* Mode privé ou quota : l’édition reste utilisable dans l’onglet. */
  }
}

export function saveComponents(components: ComponentDoc[]): void {
  try {
    localStorage.setItem(COMP_STORAGE_KEY, JSON.stringify(components));
  } catch {
    /* Mode privé ou quota : l’édition reste utilisable dans l’onglet. */
  }
}

const LEGACY_IMPORT_DESCRIPTION =
  /^Importé depuis (Figma|un fichier de variables)\.?$/i;

function isImportedComponent(component: ComponentDoc): boolean {
  return (
    component.origin === 'figma' ||
    component.origin === 'import' ||
    LEGACY_IMPORT_DESCRIPTION.test(component.description.trim())
  );
}

export interface ImportMergeGroup {
  base: string;
  components: ComponentDoc[];
}

/**
 * Repère les anciens imports où chaque variante est devenue un composant
 * séparé (`Bouton / Primaire`, `Bouton / Secondaire`). La fusion reste une
 * proposition : rien n’est modifié sans action de l’utilisateur.
 */
export function mergeableImportGroups(
  components: ComponentDoc[],
): ImportMergeGroup[] {
  const groups = new Map<string, ImportMergeGroup>();
  for (const component of components) {
    if (!isImportedComponent(component)) continue;
    const index = component.name.lastIndexOf('/');
    if (index <= 1) continue;
    const base = component.name.slice(0, index).trim();
    const suffix = component.name.slice(index + 1).trim();
    if (!base || !suffix) continue;
    const key = base.toLowerCase();
    const group = groups.get(key) ?? { base, components: [] };
    group.components.push(component);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.components.length > 1);
}

/** Fusionne les groupes détectés, sans supprimer le code existant. */
export function mergeImportedComponents(
  components: ComponentDoc[],
): ComponentDoc[] {
  const groups = mergeableImportGroups(components);
  if (!groups.length) return components;

  const merged = new Map(components.map((component) => [component.id, component]));
  for (const group of groups) {
    const [first, ...rest] = group.components;
    const variants: Variant[] = [];
    const seen = new Set<string>();
    for (const component of group.components) {
      const suffix =
        component.name.slice(component.name.lastIndexOf('/') + 1).trim() ||
        component.name;
      for (const variant of component.variants) {
        const fallbackName =
          !variant.n ||
          /^(par défaut|variante)$/i.test(variant.n.trim()) ||
          variant.n.trim().toLowerCase() === component.name.toLowerCase();
        const name = fallbackName ? suffix : variant.n;
        const props = Object.keys(variant.props).length
          ? variant.props
          : parseVariantProps(name);
        const identity = Object.keys(props).length
          ? `props:${propsKey(props)}`
          : `name:${name.toLowerCase()}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        variants.push({
          ...variant,
          n: name,
          props,
        });
      }
    }
    const target: ComponentDoc = {
      ...first,
      name: group.base,
      description:
        first.description && !LEGACY_IMPORT_DESCRIPTION.test(first.description)
          ? first.description
          : '',
      variants: variants.length
        ? variants
        : [{ id: newId('v'), n: 'Par défaut', props: {}, code: '' }],
      origin: first.origin === 'import' ? 'import' : 'migrated',
    };
    merged.set(first.id, target);
    for (const component of rest) merged.delete(component.id);
  }
  return components
    .map((component) => merged.get(component.id))
    .filter((component): component is ComponentDoc => !!component);
}

export function font(value: string): string {
  const match = String(value).match(/^(.+?)\s+(\d+(?:\.\d+)?px)\s+(\d{3})$/);
  return match
    ? `${match[3]} ${match[2]} ${match[1]},sans-serif`
    : '400 14px sans-serif';
}

export function tokenValue(token: Token): string {
  return token.type === 'typography' ? font(token.value) : token.value;
}

export function normalizeHex(input: string): string | null {
  let hex = String(input).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex))
    hex = hex
      .split('')
      .map((character) => character + character)
      .join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex) ?? '#000000';
  return [1, 3, 5].map((index) =>
    parseInt(normalized.slice(index, index + 2), 16),
  ) as [number, number, number];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((component) =>
      Math.max(0, Math.min(255, Math.round(component)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function luminance(color: string): number {
  const channels = hexToRgb(color).map((component) => {
    const value = component / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Ratio WCAG 2.x entre deux couleurs #RRGGBB. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Remplace l'ancien seuil YIQ de la référence par un vrai choix WCAG :
 * on garde la couleur de texte qui offre le meilleur ratio.
 */
export function ink(background: string): '#000000' | '#FFFFFF' {
  if (!normalizeHex(background)) return '#FFFFFF';
  return contrastRatio(background, '#FFFFFF') >=
    contrastRatio(background, '#000000')
    ? '#FFFFFF'
    : '#000000';
}

function mix(color: string, target: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(color);
  const [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(
    r1 + (r2 - r1) * amount,
    g1 + (g2 - g1) * amount,
    b1 + (b2 - b1) * amount,
  );
}

/**
 * Dérive une teinte de texte accessible sur un fond donné, sans modifier le
 * token. On assombrit sur fond clair, on éclaircit sur fond sombre.
 */
export function accessibleText(
  color: string,
  background: string,
  minimum = 4.5,
): string {
  const normalized = normalizeHex(color);
  if (!normalized) return '#2A1140';
  if (contrastRatio(normalized, background) >= minimum) return normalized;
  const target = luminance(background) > 0.35 ? '#000000' : '#FFFFFF';
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mix(normalized, target, step / 100);
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return target;
}

const ALIASES = [
  ['p', 'primary'],
  ['s', 'secondary'],
  ['d', 'danger'],
  ['surf', 'surface'],
  ['sps', 'spacing-xs'],
  ['sp', 'spacing-md'],
  ['spl', 'spacing-xl'],
  ['r', 'radius-sm'],
  ['rl', 'radius-lg'],
  ['fh', 'font-heading'],
  ['fb', 'font-body'],
  ['sh', 'shadow-card'],
] as const;

let appliedNames = new Set<string>();

/**
 * Pose chaque token sur :root, ainsi que les alias --x-* utilisés par les
 * aperçus. Les couleurs de texte dérivées sont recalculées à chaque passage.
 */
export function applyVars(
  tokens: Token[],
  root: HTMLElement = document.documentElement,
): void {
  const style = root.style;
  for (const name of appliedNames) style.removeProperty(`--${name}`);
  appliedNames = new Set<string>();

  for (const token of tokens) {
    if (!token.name) continue;
    style.setProperty(`--${token.name}`, tokenValue(token));
    appliedNames.add(token.name);
  }

  for (const [alias, needle] of ALIASES) {
    const token = tokens.find((candidate) => candidate.name.includes(needle));
    if (token) style.setProperty(`--x-${alias}`, tokenValue(token));
    else style.removeProperty(`--x-${alias}`);
  }

  const color = (needle: string, fallback: string) =>
    tokens.find(
      (token) => token.type === 'color' && token.name.includes(needle),
    )?.value ?? fallback;

  const primary = color('primary', '#0ea5e9');
  const secondary = color('secondary', '#6366f1');
  const danger = color('danger', '#ef4444');
  const surface = color('surface', '#0f172a');

  style.setProperty('--x-p-ink', ink(primary));
  style.setProperty('--x-p-text', accessibleText(primary, '#FFFFFF'));
  style.setProperty('--x-p-on-dark', accessibleText(primary, surface));
  style.setProperty('--x-s-ink', ink(secondary));
  style.setProperty('--x-s-text', accessibleText(secondary, '#FFFFFF'));
  style.setProperty('--x-s-on-dark', accessibleText(secondary, surface));
  style.setProperty('--x-d-ink', ink(danger));
  style.setProperty('--x-d-text', accessibleText(danger, '#FFFFFF'));
  style.setProperty('--x-d-on-dark', accessibleText(danger, surface));
  style.setProperty('--x-surf-ink', ink(surface));
}
