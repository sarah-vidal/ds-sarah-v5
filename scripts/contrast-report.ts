import { contrastRatio } from '../app/client/studio/model.js';

type Pair = {
  label: string;
  before: [foreground: string, background: string];
  after: [foreground: string, background: string];
  minimum?: number;
};

/**
 * Phase 1 : le chrome passe du violet/blanc au beige, sans variante sombre.
 * Chaque paire compare l’ancienne palette à la nouvelle. Les seuils suivent
 * WCAG AA : 4.5:1 pour le texte, 3:1 pour les composants et le focus.
 */
const pairs: Pair[] = [
  {
    label: 'Texte principal sur carte',
    before: ['#2A1140', '#FFFFFF'],
    after: ['#2A1140', '#F4ECDC'],
  },
  {
    label: 'Texte secondaire sur carte',
    before: ['#675577', '#FFFFFF'],
    after: ['#5F4C73', '#F4ECDC'],
  },
  {
    label: 'Texte secondaire sur zone douce',
    before: ['#675577', '#F7F0FC'],
    after: ['#5F4C73', '#EBDFC6'],
  },
  {
    label: 'Violet primaire sur carte',
    before: ['#72369D', '#FFFFFF'],
    after: ['#72369D', '#F4ECDC'],
  },
  {
    label: 'Texte blanc sur sidebar violette',
    before: ['#FFFFFF', '#9D4EDD'],
    after: ['#FFFFFF', '#72369D'],
  },
  {
    label: 'Icône de navigation sur sidebar',
    before: ['#FFE7A3', '#9D4EDD'],
    after: ['#FFE7A3', '#72369D'],
    minimum: 3,
  },
  {
    label: 'Texte blanc sur bouton primaire',
    before: ['#FFFFFF', '#72369D'],
    after: ['#FFFFFF', '#72369D'],
  },
  {
    label: 'Texte principal sur carte « À faire »',
    before: ['#2A1140', '#EFE3FA'],
    after: ['#2A1140', '#E4D8F2'],
  },
  {
    label: 'Texte sur carte « À éviter »',
    before: ['#7A4900', '#FFEBC2'],
    after: ['#4A2A00', '#FBD9A0'],
  },
  {
    label: 'Texte sur bouton Copier',
    before: ['#2A1140', '#FFAD03'],
    after: ['#2A1140', '#FFAD03'],
  },
  {
    label: 'Texte du bloc Exporter',
    before: ['#FFFFFF', '#421A5C'],
    after: ['#2A1140', '#F4ECDC'],
  },
  {
    label: 'Texte secondaire du bloc Exporter',
    before: ['#F0E4FA', '#421A5C'],
    after: ['#5F4C73', '#F4ECDC'],
  },
  {
    label: 'Bouton Télécharger (texte et contour)',
    before: ['#FFFFFF', '#421A5C'],
    after: ['#72369D', '#F4ECDC'],
  },
  {
    label: 'Contour de champ sur fond blanc',
    before: ['#8A94A6', '#FFFFFF'],
    after: ['#8A7A58', '#FFFFFF'],
    minimum: 3,
  },
  {
    label: 'Contour de champ sur carte beige',
    before: ['#8A94A6', '#FFFFFF'],
    after: ['#8A7A58', '#F4ECDC'],
    minimum: 3,
  },
  {
    label: 'Texte saisi et texte indicatif sur blanc',
    before: ['#675577', '#FFFFFF'],
    after: ['#5F4C73', '#FFFFFF'],
  },
  {
    label: 'Anneau de focus 2px sur carte',
    before: ['#FFAD03', '#FFFFFF'],
    after: ['#2A1140', '#F4ECDC'],
    minimum: 3,
  },
  {
    label: 'Halo de focus 3px sur sidebar',
    before: ['#FFAD03', '#9D4EDD'],
    after: ['#FFFFFF', '#72369D'],
    minimum: 3,
  },
  {
    label: 'Contour secondaire sur carte',
    before: ['#8A94A6', '#FFFFFF'],
    after: ['#72369D', '#F4ECDC'],
    minimum: 3,
  },
  {
    label: 'Filtre actif (texte blanc sur violet)',
    before: ['#FFFFFF', '#5A287C'],
    after: ['#FFFFFF', '#72369D'],
  },
  {
    label: 'Compteur de filtre inactif',
    before: ['#A092AE', '#F7F0FC'],
    after: ['#5F4C73', '#EBDFC6'],
  },
  {
    label: 'Avatar (texte sur rose)',
    before: ['#2A1140', '#CEA7EE'],
    after: ['#2A1140', '#CEA7EE'],
  },
  {
    label: 'Texte blanc sur bouton danger',
    before: ['#FFFFFF', '#B42318'],
    after: ['#FFFFFF', '#B42318'],
  },
  {
    label: 'Aperçu clair : texte principal sur blanc',
    before: ['#2A1140', '#FFFFFF'],
    after: ['#2A1140', '#FFFFFF'],
  },
  {
    label: 'Aperçu clair : texte secondaire sur blanc',
    before: ['#675577', '#FFFFFF'],
    after: ['#5F4C73', '#FFFFFF'],
  },
  {
    label: 'Aperçu clair : violet primaire sur blanc',
    before: ['#72369D', '#FFFFFF'],
    after: ['#72369D', '#FFFFFF'],
  },
  {
    label: 'Figma : contour de pastille sur carte',
    before: ['#8A7A58', '#F4ECDC'],
    after: ['#8A7A58', '#F4ECDC'],
    minimum: 3,
  },
  {
    label: 'Figma : lettre sur l’icône sombre',
    before: ['#FFFFFF', '#1E1E1E'],
    after: ['#FFFFFF', '#1E1E1E'],
  },
  {
    label: 'Figma : point vert sur carte',
    before: ['#15803D', '#F4ECDC'],
    after: ['#15803D', '#F4ECDC'],
    minimum: 3,
  },
  {
    label: 'Figma : point rouge sur carte',
    before: ['#B91C1C', '#F4ECDC'],
    after: ['#B91C1C', '#F4ECDC'],
    minimum: 3,
  },
  {
    label: 'Figma : point ambre sur carte',
    before: ['#6B3F00', '#F4ECDC'],
    after: ['#6B3F00', '#F4ECDC'],
    minimum: 3,
  },
  {
    label: 'Figma : badge ambre',
    before: ['#2A1140', '#FFAD03'],
    after: ['#2A1140', '#FFAD03'],
  },
  {
    label: 'Figma : titre du menu sur blanc',
    before: ['#2A1140', '#FFFFFF'],
    after: ['#2A1140', '#FFFFFF'],
  },
  {
    label: 'Figma : texte secondaire du menu',
    before: ['#5F4C73', '#FFFFFF'],
    after: ['#5F4C73', '#FFFFFF'],
  },
  {
    label: 'Figma : encart de synchronisation ambre',
    before: ['#6B3F00', '#FBE3B4'],
    after: ['#6B3F00', '#FBE3B4'],
  },
  {
    label: 'Figma : alerte d’autorisation rouge',
    before: ['#7F1D1D', '#FBD5D5'],
    after: ['#7F1D1D', '#FBD5D5'],
  },
  {
    label: 'Figma : encart explicatif sur beige doux',
    before: ['#2A1140', '#EFE8D8'],
    after: ['#2A1140', '#EFE8D8'],
  },
  {
    label: 'Figma : valeurs monospace sur beige doux',
    before: ['#2A1140', '#EBDFC6'],
    after: ['#2A1140', '#EBDFC6'],
  },
  {
    label: 'Notification : texte blanc sur fond violet',
    before: ['#FFFFFF', '#2A1140'],
    after: ['#FFFFFF', '#2A1140'],
  },
  {
    label: 'Notification : action Annuler',
    before: ['#FFCF70', '#2A1140'],
    after: ['#FFCF70', '#2A1140'],
  },
];

const ratio = (pair: [string, string]) => contrastRatio(pair[0], pair[1]);
const state = (value: number, minimum: number) =>
  value >= minimum ? 'PASS' : 'ÉCHEC';

const rows = pairs.map((pair) => {
  const minimum = pair.minimum ?? 4.5;
  return {
    Paire: pair.label,
    Avant: `${ratio(pair.before).toFixed(2)}:1`,
    Après: `${ratio(pair.after).toFixed(2)}:1`,
    Seuil: `${minimum}:1`,
    État: state(ratio(pair.after), minimum),
  };
});

console.table(rows);

const failures = rows.filter((row) => row.État !== 'PASS');
if (failures.length) {
  console.error(
    `\n${failures.length} paire(s) sous le seuil. Ajuster les couleurs.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    '\nToutes les paires de la palette beige atteignent leur seuil WCAG.',
  );
}
