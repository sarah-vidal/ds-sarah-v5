import type { FigmaChange } from './figma.js';

// Contrat local du plugin Figma optionnel. Le fichier reste dans le navigateur :
// aucune variable importée n’est envoyée au serveur ni à Figma.

export const IMPORT_FORMAT = 'ds-studio/variables';
export const IMPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 512 * 1024;
export const MAX_IMPORT_VARIABLES = 500;
export const MAX_IMPORT_COMPONENTS = 200;
export const IMPORT_CHANGE_PREFIX = 'import:';
export const IMPORT_FILE_KEY = 'local-import';

export type ImportTokenType =
  'color' | 'spacing' | 'typography' | 'radius' | 'shadow';

export interface ImportVariable {
  name: string;
  type: ImportTokenType;
  value: string;
  description: string;
}

export interface ImportComponent {
  name: string;
  variants: string[];
}

export interface ParsedVariables {
  variables: ImportVariable[];
  components: ImportComponent[];
  warnings: string[];
}

export type ParseImportResult =
  { ok: true; data: ParsedVariables } | { ok: false; error: string };

export interface ImportTokenSummary {
  name: string;
  type: string;
  value: string;
}

export interface ImportComponentSummary {
  name: string;
  key?: string;
  variants: Array<{
    n: string;
    props?: Record<string, string>;
    nodeId?: string;
  }>;
}

export interface ImportConversion {
  changes: FigmaChange[];
  warnings: string[];
  variables: number;
  components: number;
  unchanged: number;
}

const TYPES: readonly ImportTokenType[] = [
  'color',
  'spacing',
  'typography',
  'radius',
  'shadow',
];

const TYPE_ALIASES: Record<string, ImportTokenType> = {
  color: 'color',
  colors: 'color',
  colour: 'color',
  colours: 'color',
  spacing: 'spacing',
  space: 'spacing',
  gap: 'spacing',
  dimension: 'spacing',
  typography: 'typography',
  font: 'typography',
  fonts: 'typography',
  text: 'typography',
  radius: 'radius',
  rounded: 'radius',
  cornerradius: 'radius',
  shadow: 'shadow',
  shadows: 'shadow',
  effect: 'shadow',
  effects: 'shadow',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lit `Size=Large, State=Hover` pour un import de variables Figma. */
function parseVariantPropsShared(name: string): Record<string, string> {
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
    if (Object.keys(props).length >= 24) break;
    props[key] = value;
  }
  return props;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Nom local compatible avec `dss-tokens` : minuscules, séparateurs uniques. */
export function normalizeVariableName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeComponentName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalizeType(raw: unknown, name: string): ImportTokenType | null {
  if (typeof raw === 'string') {
    const key = raw.toLowerCase().replace(/[^a-z]/g, '');
    const alias = TYPE_ALIASES[key];
    if (alias) return alias;
  }
  if (name.startsWith('color-')) return 'color';
  if (name.startsWith('spacing-') || name.startsWith('space-'))
    return 'spacing';
  if (name.startsWith('radius-') || name.startsWith('corner-')) return 'radius';
  if (name.startsWith('font-') || name.startsWith('text-')) return 'typography';
  if (name.startsWith('shadow-') || name.startsWith('effect-')) return 'shadow';
  return null;
}

function unsafeValue(value: string): boolean {
  return (
    /[;{}<>\r\n]/.test(value) ||
    /(?:url|expression)\s*\(/i.test(value) ||
    /javascript:/i.test(value)
  );
}

type ValueResult = { ok: true; value: string } | { ok: false; error: string };

function parseColor(raw: unknown): ValueResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'couleur attendue au format #RRGGBB.' };
  }
  let hex = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex
      .split('')
      .map((character) => character + character)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      ok: false,
      error: 'couleur attendue au format #RGB ou #RRGGBB, sans transparence.',
    };
  }
  return { ok: true, value: `#${hex.toLowerCase()}` };
}

function parseDimension(raw: unknown, label: string): ValueResult {
  const numeric =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim())
        ? Number(raw)
        : null;
  if (numeric !== null) {
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1000) {
      return { ok: false, error: `${label} attendu entre 0 et 1000 px.` };
    }
    return { ok: true, value: `${Number(numeric.toFixed(2))}px` };
  }
  if (
    typeof raw === 'string' &&
    /^\d+(?:\.\d+)?(?:px|rem)$/i.test(raw.trim())
  ) {
    const value = raw.trim().toLowerCase();
    if (unsafeValue(value)) {
      return { ok: false, error: `${label} contient un caractère refusé.` };
    }
    return { ok: true, value };
  }
  return {
    ok: false,
    error: `${label} attendu en nombre ou avec l’unité px/rem.`,
  };
}

const WEIGHTS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

function parseWeight(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 100 && raw <= 900 && raw % 100 === 0
      ? raw
      : null;
  }
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (/^\d{3}$/.test(value)) {
    const numeric = Number(value);
    return numeric >= 100 && numeric <= 900 && numeric % 100 === 0
      ? numeric
      : null;
  }
  return WEIGHTS[value.toLowerCase().replace(/[\s_-]+/g, '')] ?? null;
}

function parseTypography(raw: unknown): ValueResult {
  let family = '';
  let size: number | null = null;
  let weight: number | null = null;

  if (typeof raw === 'string') {
    const match = raw
      .trim()
      .match(/^(.{1,80}?)\s+(\d+(?:\.\d+)?)px\s+(\d{3})$/i);
    if (!match) {
      return {
        ok: false,
        error:
          'typographie attendue comme « Inter 24px 700 » ou un objet { fontFamily, fontSize, fontWeight }.',
      };
    }
    family = match[1].trim();
    size = Number(match[2]);
    weight = parseWeight(match[3]);
  } else if (isRecord(raw)) {
    family = text(raw.fontFamily ?? raw.family);
    const rawSize = raw.fontSize ?? raw.size;
    size = typeof rawSize === 'number' ? rawSize : Number(rawSize);
    weight = parseWeight(raw.fontWeight ?? raw.weight);
  } else {
    return {
      ok: false,
      error:
        'typographie attendue comme « Inter 24px 700 » ou un objet { fontFamily, fontSize, fontWeight }.',
    };
  }

  if (!family || unsafeValue(family)) {
    return { ok: false, error: 'famille de police absente ou invalide.' };
  }
  if (size === null || !Number.isFinite(size) || size < 1 || size > 200) {
    return { ok: false, error: 'taille de police attendue entre 1 et 200 px.' };
  }
  if (weight === null) {
    return { ok: false, error: 'graisse attendue entre 100 et 900.' };
  }
  return {
    ok: true,
    value: `${family.replace(/\s+/g, ' ')} ${Number(size.toFixed(2))}px ${weight}`,
  };
}

function parseShadow(raw: unknown): ValueResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'ombre attendue sous forme de valeur CSS.' };
  }
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!value || value.length > 200 || unsafeValue(value)) {
    return { ok: false, error: 'ombre absente, trop longue ou invalide.' };
  }
  if (!/\d/.test(value) || !/(?:#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(value)) {
    return {
      ok: false,
      error: 'ombre attendue avec des décalages et une couleur CSS.',
    };
  }
  return { ok: true, value };
}

function parseVariable(
  raw: unknown,
  index: number,
  seen: Set<string>,
  warnings: string[],
): ImportVariable | null {
  if (!isRecord(raw)) {
    warnings.push(`variables[${index}] ignorée : objet attendu.`);
    return null;
  }
  const name = normalizeVariableName(text(raw.name));
  if (!name) {
    warnings.push(`variables[${index}] ignorée : nom absent ou invalide.`);
    return null;
  }
  const type = normalizeType(raw.type, name);
  if (!type) {
    warnings.push(
      `variables[${index}] « ${name} » ignorée : type absent ou inconnu.`,
    );
    return null;
  }
  if (!TYPES.includes(type)) {
    warnings.push(`variables[${index}] « ${name} » ignorée : type inconnu.`);
    return null;
  }

  let parsed: ValueResult;
  if (type === 'color') parsed = parseColor(raw.value);
  else if (type === 'spacing' || type === 'radius')
    parsed = parseDimension(
      raw.value,
      type === 'spacing' ? 'espacement' : 'arrondi',
    );
  else if (type === 'typography') parsed = parseTypography(raw.value);
  else parsed = parseShadow(raw.value);

  if (!parsed.ok) {
    warnings.push(`variables[${index}] « ${name} » ignorée : ${parsed.error}`);
    return null;
  }
  if (seen.has(name)) {
    warnings.push(`variables[${index}] « ${name} » ignorée : nom en doublon.`);
    return null;
  }
  seen.add(name);

  return {
    name,
    type,
    value: parsed.value,
    description: text(raw.description).slice(0, 280),
  };
}

function parseComponentVariants(
  raw: unknown,
  index: number,
  warnings: string[],
): string[] {
  if (raw === undefined) return ['Par défaut'];
  if (!Array.isArray(raw)) {
    warnings.push(`components[${index}] : liste de variantes attendue.`);
    return ['Par défaut'];
  }
  const variants: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name =
      typeof item === 'string'
        ? normalizeComponentName(item)
        : isRecord(item)
          ? normalizeComponentName(text(item.name ?? item.n))
          : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(name);
  }
  return variants.length ? variants : ['Par défaut'];
}

function parseComponents(raw: unknown, warnings: string[]): ImportComponent[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push('components ignoré : tableau attendu.');
    return [];
  }
  if (raw.length > MAX_IMPORT_COMPONENTS) {
    warnings.push(
      `components tronqué à ${MAX_IMPORT_COMPONENTS} entrées sur ${raw.length}.`,
    );
  }
  const components: ImportComponent[] = [];
  const byName = new Map<string, ImportComponent>();
  for (const [index, item] of raw.slice(0, MAX_IMPORT_COMPONENTS).entries()) {
    if (!isRecord(item)) {
      warnings.push(`components[${index}] ignoré : objet attendu.`);
      continue;
    }
    const name = normalizeComponentName(text(item.name));
    if (!name) {
      warnings.push(`components[${index}] ignoré : nom absent.`);
      continue;
    }
    const variants = parseComponentVariants(item.variants, index, warnings);
    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      for (const variant of variants) {
        if (
          !existing.variants.some(
            (candidate) => candidate.toLowerCase() === variant.toLowerCase(),
          )
        ) {
          existing.variants.push(variant);
        }
      }
      continue;
    }
    const component: ImportComponent = { name, variants };
    byName.set(key, component);
    components.push(component);
  }
  return components;
}

/**
 * Lit le JSON exporté par `figma-plugin/`. Accepte aussi l’export natif de
 * DS-Studio (`{ tokens: [...] }`) pour rejouer un fichier de tokens.
 * Les erreurs structurelles bloquent l’import ; les entrées isolées sont
 * signalées et ignorées sans supprimer ni modifier le reste du carnet.
 */
export function parseVariablesImport(input: string): ParseImportResult {
  if (input.length > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `Le fichier dépasse la limite de ${Math.round(MAX_IMPORT_BYTES / 1024)} Ko.`,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch {
    return {
      ok: false,
      error: 'Ce fichier n’est pas un JSON valide.',
    };
  }

  if (isRecord(payload) && isRecord(payload.meta) && payload.meta.variables) {
    return {
      ok: false,
      error:
        'Ce fichier semble être une réponse REST Figma. Utilisez le plugin DS-Studio pour exporter les variables locales.',
    };
  }

  if (
    isRecord(payload) &&
    payload.format !== undefined &&
    payload.format !== IMPORT_FORMAT
  ) {
    return {
      ok: false,
      error: `Format non reconnu. Attendu : « ${IMPORT_FORMAT} », version ${IMPORT_VERSION}.`,
    };
  }
  if (
    isRecord(payload) &&
    payload.version !== undefined &&
    payload.version !== IMPORT_VERSION
  ) {
    return {
      ok: false,
      error: `Version d’import non prise en charge (${String(payload.version)}). Version attendue : ${IMPORT_VERSION}.`,
    };
  }

  let variablesRaw: unknown;
  let componentsRaw: unknown;
  if (Array.isArray(payload)) {
    variablesRaw = payload;
  } else if (isRecord(payload)) {
    variablesRaw = payload.variables ?? payload.tokens;
    componentsRaw = payload.components;
  }
  if (!Array.isArray(variablesRaw)) {
    return {
      ok: false,
      error:
        'Format non reconnu. Attendu : { "format": "ds-studio/variables", "variables": [...] }.',
    };
  }
  if (variablesRaw.length > MAX_IMPORT_VARIABLES) {
    return {
      ok: false,
      error: `Le fichier contient ${variablesRaw.length} variables ; la limite est de ${MAX_IMPORT_VARIABLES}.`,
    };
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  const variables: ImportVariable[] = [];
  for (const [index, raw] of variablesRaw.entries()) {
    const variable = parseVariable(raw, index, seen, warnings);
    if (variable) variables.push(variable);
  }
  const components = parseComponents(componentsRaw, warnings);

  return { ok: true, data: { variables, components, warnings } };
}

/**
 * Convertit un import en changements comparables, sans suppression : les noms
 * absents deviennent de nouveaux tokens/composants, les valeurs identiques sont
 * ignorées et un conflit de type est signalé au lieu d’être écrasé.
 */
export function importVariablesToChanges(
  data: ParsedVariables,
  tokens: ImportTokenSummary[],
  components: ImportComponentSummary[],
): ImportConversion {
  const warnings = [...data.warnings];
  const changes: FigmaChange[] = [];
  let unchanged = 0;

  const tokensByName = new Map(
    tokens.map((token) => [normalizeVariableName(token.name), token]),
  );
  for (const variable of data.variables) {
    const existing = tokensByName.get(variable.name);
    if (existing && existing.type !== variable.type) {
      warnings.push(
        `« ${variable.name} » ignorée : le token local ${existing.name} n’est pas du type ${variable.type}.`,
      );
      continue;
    }
    if (existing && existing.value === variable.value) {
      unchanged += 1;
      continue;
    }
    changes.push({
      id: `${IMPORT_CHANGE_PREFIX}${variable.type}:${variable.name}`,
      category: variable.type,
      name: existing?.name ?? variable.name,
      ...(existing ? { oldValue: existing.value } : {}),
      newValue: variable.value,
    });
  }

  const componentsByName = new Map<
    string,
    { name: string; variants: Set<string> }
  >();
  const variantKey = (name: string, props?: Record<string, string>) =>
    Object.keys(props ?? {}).length
      ? Object.entries(props!)
          .map(([key, value]) => `${key.toLowerCase()}=${value.toLowerCase()}`)
          .sort()
          .join('|')
      : name.trim().toLowerCase();
  for (const component of components) {
    componentsByName.set(component.name.toLowerCase(), {
      name: component.name,
      variants: new Set(
        component.variants.map((variant) =>
          variantKey(variant.n, variant.props),
        ),
      ),
    });
  }
  for (const component of data.components) {
    const existing = componentsByName.get(component.name.toLowerCase());
    const variants = component.variants.map((variant) => ({
      name: variant,
      props: parseVariantPropsShared(variant),
    }));
    if (
      existing &&
      variants.every((variant) =>
        existing.variants.has(variantKey(variant.name, variant.props)),
      )
    ) {
      unchanged += variants.length;
      continue;
    }
    const slug = component.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    const key = `${IMPORT_CHANGE_PREFIX}component:${slug || 'composant'}`;
    changes.push({
      id: key,
      category: 'component',
      name: existing?.name ?? component.name,
      component: {
        key,
        nodeId: key,
        variants: variants.map((variant, index) => ({
          nodeId: `${key}:${index}`,
          name: variant.name,
          props: variant.props,
          code: '',
        })),
      },
    });
  }

  return {
    changes,
    warnings,
    variables: data.variables.length,
    components: data.components.length,
    unchanged,
  };
}

export function isImportedChange(change: Pick<FigmaChange, 'id'>): boolean {
  return change.id.startsWith(IMPORT_CHANGE_PREFIX);
}
