import type { TokenSummary } from './rest.js';

// Générateur HTML/CSS approximatif à partir de l’arbre REST Figma. Il ne
// contacte aucun service et ne renvoie jamais de code vers Figma : le résultat
// sert uniquement d’aperçu et de point de départ éditable dans DS-Studio.

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaPaint {
  type?: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  gradientStops?: Array<{ position?: number; color?: FigmaColor }>;
}

export interface FigmaEffect {
  type?: string;
  visible?: boolean;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  color?: FigmaColor;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
}

export interface FigmaNode {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  opacity?: number;
  styles?: Record<string, string>;
  width?: number;
  height?: number;
  absoluteBoundingBox?: { width?: number; height?: number; x?: number; y?: number };
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  layoutWrap?: 'NO_WRAP' | 'WRAP';
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  backgroundColor?: FigmaColor;
  fills?: FigmaPaint[];
  effects?: FigmaEffect[];
  style?: FigmaTextStyle;
  characters?: string;
  textAlignHorizontal?: string;
  clipsContent?: boolean;
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  children?: FigmaNode[];
}

export interface RenderResult {
  code: string;
  warnings: string[];
}

const MAX_CODE_LENGTH = 20_000;
const MAX_NODES = 350;
const MAX_DEPTH = 12;

const WARNING_TEXT: Record<string, string> = {
  image: 'Certaines images sont remplacées par un motif : importez-les séparément.',
  vector: 'Les vecteurs sont simplifiés en formes pleines.',
  instance: 'Une instance sans contenu détaillé est représentée par un bloc.',
  unsupported: 'Un nœud non pris en charge est représenté par un bloc neutre.',
  truncated: 'L’aperçu a été tronqué : le composant contient trop de calques.',
  empty: 'Le contenu de cette variante n’est pas disponible dans l’API Figma.',
  error: 'Le rendu de cette variante n’a pas pu être généré.',
};

interface TypographyToken {
  family: string;
  size: number;
  weight: number;
  name: string;
}

interface TokenMaps {
  colors: Map<string, string>;
  spacing: Map<number, string>;
  radius: Map<number, string>;
  typography: TypographyToken[];
  shadows: Map<string, string>;
}

function numberKey(value: number): number {
  return Math.round(value * 100) / 100;
}

function px(value: number): string {
  const rounded = numberKey(value);
  return rounded === 0 ? '0' : `${rounded}px`;
}

function hexByte(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function cssColor(color: FigmaColor | undefined): string | null {
  if (!color) return null;
  const alpha = color.a ?? 1;
  if (alpha <= 0.001) return 'transparent';
  if (alpha < 0.999) {
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(
      color.g * 255,
    )}, ${Math.round(color.b * 255)}, ${numberKey(alpha)})`;
  }
  return `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`;
}

function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex))
    return `#${hex
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toLowerCase();
  return null;
}

function parseTypography(value: string): TypographyToken | null {
  const match = value.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)px\s+(\d{3})$/);
  if (!match) return null;
  return {
    family: match[1].trim(),
    size: Number(match[2]),
    weight: Number(match[3]),
    name: '',
  };
}

function shadowKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function tokenMaps(tokens: TokenSummary[]): TokenMaps {
  const maps: TokenMaps = {
    colors: new Map(),
    spacing: new Map(),
    radius: new Map(),
    typography: [],
    shadows: new Map(),
  };
  for (const token of tokens) {
    const value = String(token.value);
    if (token.type === 'color') {
      const hex = normalizeHex(value);
      if (hex) maps.colors.set(hex, token.name);
      continue;
    }
    if (token.type === 'spacing' || token.type === 'radius') {
      const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/);
      if (!match) continue;
      const target = token.type === 'spacing' ? maps.spacing : maps.radius;
      target.set(numberKey(Number(match[1])), token.name);
      continue;
    }
    if (token.type === 'typography') {
      const parsed = parseTypography(value);
      if (parsed) maps.typography.push({ ...parsed, name: token.name });
      continue;
    }
    if (token.type === 'shadow' && value.trim() && value.trim() !== 'none')
      maps.shadows.set(shadowKey(value), token.name);
  }
  return maps;
}

function mapColor(value: string, maps: TokenMaps): string {
  const hex = normalizeHex(value);
  const name = hex ? maps.colors.get(hex) : undefined;
  return name ? `var(--${name},${value})` : value;
}

function mapSpacing(value: number, maps: TokenMaps): string {
  if (value === 0) return '0';
  const name = maps.spacing.get(numberKey(value));
  return name ? `var(--${name},${px(value)})` : px(value);
}

function mapRadius(value: number, maps: TokenMaps): string {
  if (value === 0) return '0';
  const name = maps.radius.get(numberKey(value));
  return name ? `var(--${name},${px(value)})` : px(value);
}

function mapTypography(
  style: FigmaTextStyle | undefined,
  maps: TokenMaps,
): string {
  const family = style?.fontFamily?.trim() || 'Inter';
  const size = style?.fontSize && style.fontSize > 0 ? style.fontSize : 14;
  const weight = style?.fontWeight && style.fontWeight > 0 ? style.fontWeight : 400;
  const token = maps.typography.find(
    (candidate) =>
      candidate.size === numberKey(size) &&
      candidate.weight === weight &&
      candidate.family.toLowerCase() === family.toLowerCase(),
  );
  const familyCss = /\s/.test(family) ? `'${family}'` : family;
  const fallback = `${weight} ${px(size)} ${familyCss},sans-serif`;
  return token ? `var(--${token.name},${fallback})` : fallback;
}

function mapShadow(effects: FigmaEffect[], maps: TokenMaps): string | null {
  const parts: string[] = [];
  for (const effect of effects) {
    if (effect.visible === false) continue;
    if (effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW') continue;
    const color = cssColor(effect.color);
    if (!color) continue;
    const offset = effect.offset ?? { x: 0, y: 0 };
    parts.push(
      `${effect.type === 'INNER_SHADOW' ? 'inset ' : ''}${px(
        offset.x,
      )} ${px(offset.y)} ${px(effect.radius ?? 0)} ${px(
        effect.spread ?? 0,
      )} ${color}`,
    );
  }
  if (!parts.length) return null;
  const value = parts.join(', ');
  const name = maps.shadows.get(shadowKey(value));
  return name ? `var(--${name},${value})` : value;
}

function solidColor(paints: FigmaPaint[] | undefined): string | null {
  if (!paints) return null;
  for (const paint of paints) {
    if (paint.visible === false) continue;
    if (paint.type !== 'SOLID') continue;
    const color = cssColor(paint.color);
    if (color) return color;
  }
  return null;
}

function gradientBackground(paints: FigmaPaint[] | undefined): string | null {
  if (!paints) return null;
  for (const paint of paints) {
    if (paint.visible === false) continue;
    if (paint.type !== 'GRADIENT_LINEAR' && paint.type !== 'GRADIENT_RADIAL')
      continue;
    const stops = (paint.gradientStops ?? [])
      .map((stop) => {
        const color = cssColor(stop.color);
        if (!color) return null;
        const position = Math.max(0, Math.min(1, stop.position ?? 0));
        return `${color} ${Math.round(position * 100)}%`;
      })
      .filter((stop): stop is string => !!stop);
    if (stops.length < 2) continue;
    return `${
      paint.type === 'GRADIENT_RADIAL' ? 'radial-gradient' : 'linear-gradient'
    }(180deg, ${stops.join(', ')})`;
  }
  return null;
}

function background(
  node: FigmaNode,
  maps: TokenMaps,
  warn: (key: string) => void,
): string | null {
  const solid = solidColor(node.fills);
  if (solid) return mapColor(solid, maps);
  const gradient = gradientBackground(node.fills);
  if (gradient) return gradient;
  if (
    node.fills?.some(
      (paint) => paint.visible !== false && paint.type === 'IMAGE',
    )
  ) {
    warn('image');
    return 'repeating-linear-gradient(45deg, #f1f5f9 0 8px, #e2e8f0 8px 16px)';
  }
  if (node.backgroundColor) {
    const color = cssColor(node.backgroundColor);
    if (color) return mapColor(color, maps);
  }
  return null;
}

function border(
  node: FigmaNode,
  maps: TokenMaps,
): { width: number; color: string } | null {
  const color = solidColor(node.strokes);
  if (!color) return null;
  return { width: node.strokeWeight ?? 1, color: mapColor(color, maps) };
}

function cornerRadius(node: FigmaNode, maps: TokenMaps): string | null {
  const radii = node.rectangleCornerRadii;
  if (Array.isArray(radii) && radii.length === 4) {
    if (radii.every((value) => value === radii[0]))
      return mapRadius(radii[0] ?? 0, maps);
    return radii.map((value) => mapRadius(value, maps)).join(' ');
  }
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0)
    return mapRadius(node.cornerRadius, maps);
  return null;
}

function boxWidth(node: FigmaNode): number | null {
  const width = node.absoluteBoundingBox?.width ?? node.width;
  return typeof width === 'number' && width > 0 ? width : null;
}

function boxHeight(node: FigmaNode): number | null {
  const height = node.absoluteBoundingBox?.height ?? node.height;
  return typeof height === 'number' && height > 0 ? height : null;
}

const ALIGN_PRIMARY: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
};

const ALIGN_CROSS: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  BASELINE: 'baseline',
};

const TEXT_ALIGN: Record<string, string> = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
  JUSTIFIED: 'justify',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SHAPES = new Set([
  'RECTANGLE',
  'ELLIPSE',
  'VECTOR',
  'LINE',
  'POLYGON',
  'STAR',
  'BOOLEAN_OPERATION',
]);

const CONTAINERS = new Set([
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
]);

/**
 * Produit un aperçu HTML d’un nœud Figma. Les couleurs, espacements,
 * arrondis et typographies sont remplacés par les tokens locaux quand une
 * valeur identique existe.
 */
export function renderFigmaNode(
  root: FigmaNode | undefined,
  tokens: TokenSummary[] = [],
): RenderResult {
  const maps = tokenMaps(tokens);
  const warnings = new Set<string>();
  let nodeCount = 0;
  let truncated = false;

  const warn = (key: string) => warnings.add(key);

  const render = (node: FigmaNode, depth: number): string => {
    if (!node || node.visible === false) return '';
    if (depth > MAX_DEPTH) {
      truncated = true;
      return '';
    }
    nodeCount += 1;
    if (nodeCount > MAX_NODES) {
      truncated = true;
      return '';
    }

    const type = node.type ?? '';
    const indent = '  '.repeat(depth);
    const declarations: string[] = [];

    if (type === 'TEXT') {
      const typography = mapTypography(node.style, maps);
      declarations.push(`font:${typography}`);
      const color = solidColor(node.fills);
      if (color) declarations.push(`color:${mapColor(color, maps)}`);
      else if (node.style && /bold/i.test(String(node.style.fontWeight)))
        declarations.push('color:currentColor');
      if (node.style?.lineHeightPx)
        declarations.push(`line-height:${px(node.style.lineHeightPx)}`);
      if (node.style?.letterSpacing)
        declarations.push(`letter-spacing:${px(node.style.letterSpacing)}`);
      const align = node.textAlignHorizontal
        ? TEXT_ALIGN[node.textAlignHorizontal]
        : undefined;
      if (align) declarations.push(`text-align:${align}`);
      const characters = node.characters ?? '';
      if (!characters.trim()) return '';
      if (characters.includes('\n'))
        declarations.push('white-space:pre-wrap');
      return `<span style="${declarations.join(';')}">${escapeHtml(
        characters,
      )}</span>`;
    }

    const isShape = SHAPES.has(type);
    const isContainer = CONTAINERS.has(type);
    const children = (node.children ?? [])
      .map((child) => render(child, depth + 1))
      .filter(Boolean);

    if (isContainer || (!isShape && children.length)) {
      const layoutMode = node.layoutMode ?? 'NONE';
      if (layoutMode !== 'NONE') {
        declarations.push('display:flex');
        declarations.push(
          `flex-direction:${layoutMode === 'VERTICAL' ? 'column' : 'row'}`,
        );
        if (node.layoutWrap === 'WRAP') declarations.push('flex-wrap:wrap');
        if (node.itemSpacing && node.itemSpacing > 0)
          declarations.push(`gap:${mapSpacing(node.itemSpacing, maps)}`);
        const primary = node.primaryAxisAlignItems
          ? ALIGN_PRIMARY[node.primaryAxisAlignItems]
          : undefined;
        if (primary) declarations.push(`justify-content:${primary}`);
        const cross = node.counterAxisAlignItems
          ? ALIGN_CROSS[node.counterAxisAlignItems]
          : undefined;
        if (cross) declarations.push(`align-items:${cross}`);
      }
      const top = node.paddingTop ?? 0;
      const right = node.paddingRight ?? 0;
      const bottom = node.paddingBottom ?? 0;
      const left = node.paddingLeft ?? 0;
      if (top || right || bottom || left) {
        declarations.push(
          top === right && right === bottom && bottom === left
            ? `padding:${mapSpacing(top, maps)}`
            : `padding:${mapSpacing(top, maps)} ${mapSpacing(
                right,
                maps,
              )} ${mapSpacing(bottom, maps)} ${mapSpacing(left, maps)}`,
        );
      }
    }

    if (isShape) {
      const width = boxWidth(node);
      const height = boxHeight(node);
      if (width) declarations.push(`width:${px(width)}`);
      if (height) declarations.push(`height:${px(height)}`);
      if (!width) declarations.push('width:100%');
      if (type === 'ELLIPSE') declarations.push('border-radius:9999px');
      if (type === 'LINE') declarations.push('height:1px');
    } else {
      const width = boxWidth(node);
      const height = boxHeight(node);
      const fixed =
        node.layoutSizingHorizontal === 'FIXED' || node.layoutSizingHorizontal === undefined;
      if (width && fixed && width <= 640) declarations.push(`width:${px(width)}`);
      else if (width) declarations.push('width:100%');
      if (height && !children.length) declarations.push(`height:${px(height)}`);
    }

    const fill = background(node, maps, warn);
    if (fill) declarations.push(`background:${fill}`);
    const stroke = border(node, maps);
    if (stroke)
      declarations.push(
        `border:${px(stroke.width)} solid ${stroke.color}`,
      );
    const radius = cornerRadius(node, maps);
    if (radius) declarations.push(`border-radius:${radius}`);
    if (node.effects?.length) {
      const shadow = mapShadow(node.effects, maps);
      if (shadow) declarations.push(`box-shadow:${shadow}`);
    }
    if (typeof node.opacity === 'number' && node.opacity < 1)
      declarations.push(`opacity:${numberKey(node.opacity)}`);
    if (node.clipsContent) declarations.push('overflow:hidden');
    if (isContainer) declarations.push('max-width:100%');

    const style = declarations.join(';');
    const open = `<div${style ? ` style="${style}"` : ''}>`;
    if (!children.length) {
      if (type === 'INSTANCE') {
        warn('instance');
        return `${indent}${open}${
          node.name ? escapeHtml(node.name) : 'Instance'
        }</div>`;
      }
      if (isShape) {
        if (type === 'VECTOR' || type === 'BOOLEAN_OPERATION') warn('vector');
        return `${indent}${open}</div>`;
      }
      if (type && !isContainer) {
        warn('unsupported');
        return `${indent}${open}</div>`;
      }
      return `${indent}${open}</div>`;
    }
    return `${indent}${open}\n${children.join('\n')}\n${indent}</div>`;
  };

  try {
    if (!root) {
      return { code: '', warnings: [WARNING_TEXT.empty] };
    }
    let code = render(root, 0).trim();
    if (truncated)
      code += '\n<!-- Aperçu tronqué : trop de calques Figma. -->';
    if (code.length > MAX_CODE_LENGTH)
      code = `${code.slice(0, MAX_CODE_LENGTH)}\n<!-- Aperçu tronqué. -->`;
    if (!code) warn('empty');
    if (truncated) warn('truncated');
    return {
      code,
      warnings: [...warnings]
        .map((key) => WARNING_TEXT[key])
        .filter(Boolean)
        .slice(0, 4),
    };
  } catch {
    return { code: '', warnings: [WARNING_TEXT.error] };
  }
}

/** Indexe récursivement les nœuds du document par identifiant Figma. */
export function indexFigmaNodes(
  root: FigmaNode | undefined,
): Map<string, FigmaNode> {
  const index = new Map<string, FigmaNode>();
  const walk = (node: FigmaNode | undefined, depth: number) => {
    if (!node || depth > 40) return;
    if (node.id) index.set(node.id, node);
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return index;
}
