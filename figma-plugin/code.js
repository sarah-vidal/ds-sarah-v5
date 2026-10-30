// Plugin Figma optionnel : lit les variables et styles locaux du fichier ouvert
// et prépare le JSON attendu par DS-Studio. Aucun réseau, aucune écriture.

const FORMAT = 'ds-studio/variables';
const VERSION = 1;

function hex(value) {
  if (!value || typeof value.r !== 'number') return null;
  const alpha = value.a === undefined ? 1 : value.a;
  if (alpha < 0.999) return null;
  const channel = (component) =>
    Math.round(Math.max(0, Math.min(1, component)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(value.r)}${channel(value.g)}${channel(value.b)}`;
}

function rgba(value) {
  const channel = (component) =>
    Math.round(Math.max(0, Math.min(1, component)) * 255);
  const alpha = Math.max(0, Math.min(1, value.a === undefined ? 1 : value.a));
  return `rgba(${channel(value.r)},${channel(value.g)},${channel(value.b)},${Number(
    alpha.toFixed(2),
  )})`;
}

function weightFromStyle(style) {
  const key = String(style || 'Regular')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  const weights = {
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
  return weights[key] || 400;
}

function shadowValue(effect) {
  if (!effect || !effect.color) return null;
  const parts = [
    effect.type === 'INNER_SHADOW' ? 'inset' : '',
    `${Number((effect.offset && effect.offset.x ? effect.offset.x : 0).toFixed(2))}px`,
    `${Number((effect.offset && effect.offset.y ? effect.offset.y : 0).toFixed(2))}px`,
    `${Number((effect.radius || 0).toFixed(2))}px`,
    `${Number((effect.spread || 0).toFixed(2))}px`,
    rgba(effect.color),
  ].filter(Boolean);
  return parts.join(' ');
}

function variantLabel(node) {
  if (node.variantProperties) {
    const values = Object.values(node.variantProperties).filter(Boolean);
    if (values.length) return values.join(' / ');
  }
  const parts = String(node.name || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || 'Par défaut';
}

async function resolveVariable(variable, modeId, seen) {
  if (!variable || seen.has(variable.id)) return null;
  seen.add(variable.id);
  const values = variable.valuesByMode || {};
  const ownMode =
    values[modeId] !== undefined ? modeId : Object.keys(values)[0];
  const value = ownMode ? values[ownMode] : undefined;
  if (value && value.type === 'VARIABLE_ALIAS' && value.id) {
    const next = await figma.variables.getVariableByIdAsync(value.id);
    return resolveVariable(next, modeId, seen);
  }
  return value;
}

function floatKind(variable) {
  const scopes = Array.isArray(variable.scopes) ? variable.scopes : [];
  if (
    scopes.includes('CORNER_RADIUS') ||
    /radius|corner|rounded/i.test(variable.name)
  )
    return 'radius';
  if (
    scopes.includes('GAP') ||
    scopes.includes('WIDTH_HEIGHT') ||
    /space|spacing|gap|padding|margin/i.test(variable.name)
  )
    return 'spacing';
  return null;
}

async function collectVariables(warnings) {
  const items = [];
  if (!figma.variables || !figma.variables.getLocalVariablesAsync) {
    warnings.push(
      'Variables indisponibles dans cette version de Figma : les styles locaux restent exportés.',
    );
    return items;
  }
  let variables = [];
  let collections = [];
  try {
    variables = await figma.variables.getLocalVariablesAsync();
    collections = await figma.variables.getLocalVariableCollectionsAsync();
  } catch (error) {
    warnings.push(
      `Variables illisibles : ${error && error.message ? error.message : String(error)}`,
    );
    return items;
  }
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  for (const variable of variables) {
    const collection = collectionById.get(variable.variableCollectionId);
    const modeId =
      (collection && collection.defaultModeId) ||
      Object.keys(variable.valuesByMode || {})[0];
    if (!modeId) continue;
    const resolved = await resolveVariable(variable, modeId, new Set());
    if (variable.resolvedType === 'COLOR') {
      const value = hex(resolved);
      if (!value) {
        warnings.push(
          `Variable ${variable.name} ignorée : couleur non résolue ou transparente.`,
        );
        continue;
      }
      items.push({
        name: variable.name,
        type: 'color',
        value,
        description: variable.description || '',
      });
      continue;
    }
    if (variable.resolvedType === 'FLOAT' && typeof resolved === 'number') {
      const type = floatKind(variable);
      if (!type) continue;
      items.push({
        name: variable.name,
        type,
        value: `${Number(resolved.toFixed(2))}px`,
        description: variable.description || '',
      });
    }
  }
  return items;
}

async function collectStyles(warnings) {
  const items = [];
  try {
    for (const style of await figma.getLocalPaintStylesAsync()) {
      const paint = (style.paints || []).find(
        (candidate) =>
          candidate.visible !== false && candidate.type === 'SOLID',
      );
      const value = paint ? hex(paint.color) : null;
      if (value)
        items.push({
          name: style.name,
          type: 'color',
          value,
          description: style.description || '',
        });
    }
  } catch (error) {
    warnings.push(
      `Styles de couleur illisibles : ${error && error.message ? error.message : String(error)}`,
    );
  }
  try {
    for (const style of await figma.getLocalTextStylesAsync()) {
      if (!style.fontName || !style.fontSize) continue;
      items.push({
        name: style.name,
        type: 'typography',
        value: `${style.fontName.family} ${Number(style.fontSize.toFixed(2))}px ${weightFromStyle(style.fontName.style)}`,
        description: style.description || '',
      });
    }
  } catch (error) {
    warnings.push(
      `Styles de texte illisibles : ${error && error.message ? error.message : String(error)}`,
    );
  }
  try {
    for (const style of await figma.getLocalEffectStylesAsync()) {
      const effect = (style.effects || []).find(
        (candidate) =>
          candidate.visible !== false &&
          (candidate.type === 'DROP_SHADOW' ||
            candidate.type === 'INNER_SHADOW'),
      );
      const value = effect ? shadowValue(effect) : null;
      if (value)
        items.push({
          name: style.name,
          type: 'shadow',
          value,
          description: style.description || '',
        });
    }
  } catch (error) {
    warnings.push(
      `Styles d’effet illisibles : ${error && error.message ? error.message : String(error)}`,
    );
  }
  return items;
}

function collectComponents() {
  const components = [];
  const inSet = new Set();
  const sets = figma.root.findAll((node) => node.type === 'COMPONENT_SET');
  for (const set of sets) {
    const variants = [];
    for (const child of set.children || []) {
      if (child.type !== 'COMPONENT') continue;
      inSet.add(child.id);
      const label = variantLabel(child);
      if (
        label &&
        !variants.some(
          (candidate) => candidate.toLowerCase() === label.toLowerCase(),
        )
      )
        variants.push(label);
    }
    components.push({
      name: set.name,
      variants: variants.length ? variants : ['Par défaut'],
    });
  }
  const standalone = figma.root.findAll(
    (node) => node.type === 'COMPONENT' && !inSet.has(node.id),
  );
  for (const component of standalone) {
    const parts = String(component.name || '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
    const name =
      parts.length > 1 ? parts.slice(0, -1).join(' / ') : component.name;
    const variant = parts.length > 1 ? parts[parts.length - 1] : 'Par défaut';
    if (!name) continue;
    const existing = components.find(
      (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      if (
        !existing.variants.some(
          (candidate) => candidate.toLowerCase() === variant.toLowerCase(),
        )
      )
        existing.variants.push(variant);
    } else {
      components.push({ name, variants: [variant] });
    }
  }
  return components;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${String(item.name).trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function build() {
  const warnings = [];
  try {
    const variables = [
      ...(await collectVariables(warnings)),
      ...(await collectStyles(warnings)),
    ].sort((first, second) =>
      `${first.type}:${first.name}`.localeCompare(
        `${second.type}:${second.name}`,
      ),
    );
    const payload = {
      format: FORMAT,
      version: VERSION,
      file: { name: figma.root.name || 'Fichier Figma' },
      exportedAt: new Date().toISOString(),
      variables: dedupe(variables),
      components: collectComponents().sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    };
    figma.ui.postMessage({
      type: 'export',
      json: JSON.stringify(payload, null, 2),
      variables: payload.variables.length,
      components: payload.components.length,
      warnings,
    });
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error),
    });
  }
}

figma.showUI(__html__, { width: 560, height: 620, themeColors: true });
figma.ui.onmessage = (message) => {
  if (message && message.type === 'refresh') void build();
};
void build();
