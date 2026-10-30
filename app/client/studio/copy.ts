import type { ComponentDoc, GeneratedCopy, Variant } from './model.js';

// Génération locale et déterministe des textes de documentation. Aucun appel
// réseau, aucun modèle de langage : les mêmes entrées produisent les mêmes
// textes, ce qui les rend testables et utilisables hors ligne.

const USAGES: Array<[RegExp, string]> = [
  [/bouton|button|cta|action/i, 'déclenche une action claire et immédiate'],
  [
    /champ|input|field|saisie|formulaire|search|recherche/i,
    'permet de saisir et de valider une information',
  ],
  [/carte|card|tuile|panel/i, 'regroupe une information liée dans un conteneur lisible'],
  [/badge|étiquette|etiquette|tag|pill|chip/i, 'signale un statut ou une catégorie'],
  [
    /alerte|alert|notification|toast|message|banner/i,
    'attire l’attention sur une information importante',
  ],
  [
    /onglet|tab|navigation|nav|menu|fil d’ariane|breadcrumb/i,
    'organise la navigation entre plusieurs contenus',
  ],
  [/modale|modal|dialog|fenêtre|fenetre/i, 'interrompt le parcours pour demander une décision'],
  [/table|tableau/i, 'présente des données comparables de façon structurée'],
  [/avatar|profil|personne/i, 'représente une personne ou une entité'],
  [/icône|icone|icon/i, 'illustre une action ou un repère visuel'],
  [
    /case|checkbox|switch|toggle|interrupteur|radio/i,
    'permet d’activer ou de choisir une option',
  ],
  [/accordéon|accordeon|accordion|disclosure/i, 'déplie un contenu secondaire à la demande'],
];

const DESTRUCTIVE =
  /danger|destruct|supprim|delete|remove|erreur|error|annul|cancel/i;

function singleLine(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function usageFor(name: string): string {
  for (const [pattern, usage] of USAGES) if (pattern.test(name)) return usage;
  return 'structure et présente un contenu réutilisable dans l’interface';
}

function propertySummary(variants: Variant[]): string[] {
  const properties = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant.props)) {
      const values = properties.get(key) ?? new Set<string>();
      values.add(value);
      properties.set(key, values);
    }
  }
  return [...properties.entries()].map(([key, values]) => {
    const list = [...values];
    const shown = list.slice(0, 4).join(', ');
    const more = list.length > 4 ? ` et ${list.length - 4} autre${list.length > 5 ? 's' : ''}` : '';
    return `${key} (${shown}${more})`;
  });
}

function bulletList(items: string[], max: number): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    const line = `• ${singleLine(item, 180)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= max) break;
  }
  return lines.join('\n');
}

/**
 * Produit une description, une liste « À faire » et une liste « À éviter » à
 * partir du nom, des propriétés de variantes et de la description Figma.
 */
export function generateComponentCopy(
  component: Pick<ComponentDoc, 'name' | 'variants'> & {
    figma?: ComponentDoc['figma'];
  },
): GeneratedCopy {
  const name = singleLine(component.name || 'Composant', 80) || 'Composant';
  const variants = Array.isArray(component.variants) ? component.variants : [];
  const properties = propertySummary(variants);
  const figmaDescription = singleLine(
    component.figma?.description ?? '',
    260,
  );
  const usage = usageFor(name);
  const count = variants.length;

  const sentences = [
    figmaDescription || `Le composant ${name} ${usage}.`,
  ];
  if (properties.length) {
    sentences.push(
      `Il se décline en ${count} variante${
        count > 1 ? 's' : ''
      }, organisées par ${properties.join(' ; ')}.`,
    );
  } else if (count > 1) {
    sentences.push(
      `Il propose ${count} variantes pour couvrir les usages courants.`,
    );
  } else {
    sentences.push(
      'La variante par défaut couvre son usage courant dans l’interface.',
    );
  }
  if (/bouton|button|cta|action/i.test(name))
    sentences.push(
      'Réservez-lui un libellé court qui décrit précisément l’action réalisée.',
    );

  const doItems: string[] = [
    'Choisissez la variante adaptée au contexte et à l’importance de l’action.',
    'Conservez des libellés courts, explicites et cohérents entre les variantes.',
    'Vérifiez le contraste du texte et l’affichage aux largeurs mobile et bureau.',
  ];
  if (properties.length)
    doItems.splice(
      1,
      0,
      `Limitez-vous aux propriétés documentées : ${properties.join(' ; ')}.`,
    );
  if (figmaDescription)
    doItems.push('Respectez l’usage décrit dans la documentation Figma.');
  if (variants.some((variant) => /hover|survol/i.test(JSON.stringify(variant.props))))
    doItems.push(
      'Prévoyez les états de survol et de focus dans les écrans qui l’utilisent.',
    );

  const dontItems: string[] = [
    'N’ajoutez pas de variante hors des propriétés documentées.',
    'N’utilisez pas de couleur, d’espacement ou de rayon codé en dur à la place des tokens.',
    'Ne modifiez pas le code sans mettre à jour la description et les règles d’usage.',
  ];
  if (DESTRUCTIVE.test(name))
    dontItems.unshift(
      'N’utilisez pas cet élément pour une action non destructive ou réversible.',
    );
  if (properties.length)
    dontItems.push(
      `Ne mélangez pas les valeurs de propriétés dans une même variante (${properties.join(
        ' ; ',
      )}).`,
    );
  if (/bouton|button|cta|action/i.test(name))
    dontItems.push(
      'N’affichez pas plusieurs actions principales au même niveau dans une même zone.',
    );

  return {
    description: singleLine(sentences.join(' '), 600),
    do: bulletList(doItems, 5),
    dont: bulletList(dontItems, 4),
  };
}

/** Vrai si le champ a été rédigé à la main et doit survivre à un ré-import. */
export function isManualField(
  component: Pick<ComponentDoc, 'manual'>,
  field: 'description' | 'do' | 'dont',
): boolean {
  return component.manual?.includes(field) ?? false;
}
