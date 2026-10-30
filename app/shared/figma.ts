// Types partagés entre le serveur Figma et le client. Aucun secret, aucun token
// d’accès ne traverse cette frontière : le serveur ne renvoie que des métadonnées.

export type FigmaStatus =
  'deconnecte' | 'connecte_sans_fichier' | 'connecte' | 'erreur_autorisation';

export type FigmaCategory =
  'color' | 'spacing' | 'typography' | 'radius' | 'shadow' | 'component';

export interface FigmaSelection {
  color: boolean;
  spacing: boolean;
  typography: boolean;
  radius: boolean;
  shadow: boolean;
  component: boolean;
}

/**
 * Une variante d’un composant Figma. Le code est un aperçu HTML approximatif
 * généré localement ; il ne repart jamais vers Figma.
 */
export interface FigmaComponentVariant {
  /** Identifiant du nœud Figma, stable au ré-import. */
  nodeId: string;
  /** Nom affiché, par exemple `Size=Large, State=Hover`. */
  name: string;
  props: Record<string, string>;
  code: string;
  warnings?: string[];
}

/**
 * Un component set Figma (ou un composant isolé) devient **un seul** composant
 * dans l’application, avec toutes ses variantes. La clé permet le ré-import
 * sans doublon.
 */
export interface FigmaComponentPayload {
  /** Identité stable : `set:<id>` pour un component set, sinon `component:<id>`. */
  key: string;
  setId?: string;
  nodeId: string;
  description?: string;
  variants: FigmaComponentVariant[];
  /** Avertissements communs à tout le composant. */
  warnings?: string[];
}

export interface FigmaChange {
  id: string;
  category: FigmaCategory;
  name: string;
  variant?: string;
  oldValue?: string;
  newValue?: string;
  /** Présent uniquement pour `category === 'component'`. */
  component?: FigmaComponentPayload;
}

export interface FigmaFile {
  key: string;
  name: string;
  modified: string;
}

export interface FigmaServerStatus {
  configured: boolean;
  status: FigmaStatus;
  user: string | null;
  file: FigmaFile | null;
  lastSync: number | null;
  warnings: string[];
  writeEnabled: false;
}

export interface FigmaChangesResponse {
  file: FigmaFile;
  changes: FigmaChange[];
  warnings: string[];
  lastSync: number;
}

export interface FigmaFileResponse extends FigmaChangesResponse {
  status: FigmaServerStatus;
}

/**
 * Les états de démonstration restent accessibles par `?figma=…`. Le retour
 * d’OAuth utilise `?figma=connecte&reel=1`, qui ne doit jamais activer la démo.
 */
export function isFigmaDemo(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('figma') && params.get('reel') !== '1';
}

/** Extrait la clé d’un lien figma.com/design/<clé>/… ou /file/<clé>/… */
export function extractFigmaKey(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!/^(?:www\.)?figma\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [kind, key] = parts;
  if (kind !== 'design' && kind !== 'file') return null;
  return /^[A-Za-z0-9_-]{3,100}$/.test(key) ? key : null;
}
