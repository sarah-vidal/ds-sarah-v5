import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWrite, readPrivate } from '../../app/server/files.js';
import { StudioError } from '../../app/server/store.js';
import {
  extractFigmaKey,
  type FigmaChange,
  type FigmaChangesResponse,
  type FigmaComponentVariant,
  type FigmaFile,
  type FigmaFileResponse,
  type FigmaServerStatus,
} from '../../app/shared/figma.js';
import {
  indexFigmaNodes,
  renderFigmaNode,
  type FigmaColor,
  type FigmaEffect,
  type FigmaNode,
  type FigmaPaint,
  type FigmaTextStyle,
} from './render.js';

// Connecteur Figma REST en lecture seule. Les jetons restent dans le dossier
// privé du serveur et ne sont jamais renvoyés au navigateur. Aucune écriture
// distante n’est exposée par cette version.

export interface FigmaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scopes: string[];
}

export interface FigmaTokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string | null;
  userName: string | null;
  scope: string;
}

export interface TokenSummary {
  name: string;
  type: 'color' | 'spacing' | 'typography' | 'radius' | 'shadow';
  value: string;
}

export interface ComponentVariantSummary {
  n: string;
  props?: Record<string, string>;
  nodeId?: string;
}

export interface ComponentSummary {
  name: string;
  /** Identité Figma stable, absente pour un composant créé à la main. */
  key?: string;
  setId?: string;
  variants: ComponentVariantSummary[];
}

export const tokenSummarySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(['color', 'spacing', 'typography', 'radius', 'shadow']),
    value: z.string().max(500),
  })
  .strict();
const propsSchema = z
  .record(
    z.string().trim().min(1).max(60),
    z.string().trim().max(120),
  )
  .refine((props) => Object.keys(props).length <= 24, '24 propriétés maximum');
export const componentSummarySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    key: z.string().trim().min(1).max(200).optional(),
    setId: z.string().trim().min(1).max(200).optional(),
    variants: z
      .array(
        z
          .object({
            n: z.string().max(120),
            props: propsSchema.optional(),
            nodeId: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export const figmaFileRequestSchema = z
  .object({
    link: z.string().trim().min(1).max(2000),
    tokens: z.array(tokenSummarySchema).max(300),
    components: z.array(componentSummarySchema).max(200),
  })
  .strict();
export const figmaChangesRequestSchema = z
  .object({
    tokens: z.array(tokenSummarySchema).max(300),
    components: z.array(componentSummarySchema).max(200),
  })
  .strict();

const storedSchema = z
  .object({
    version: z.literal(1),
    token: z
      .object({
        accessToken: z.string().min(1).max(8000),
        refreshToken: z.string().min(1).max(8000),
        expiresAt: z.number().int().nonnegative(),
        userId: z.string().max(200).nullable(),
        userName: z.string().max(200).nullable(),
        scope: z.string().max(1000),
      })
      .strict()
      .nullable(),
    file: z
      .object({
        key: z.string().regex(/^[A-Za-z0-9_-]{3,100}$/),
        name: z.string().max(300),
        modified: z.string().max(200),
      })
      .strict()
      .nullable(),
    lastSync: z.number().int().nonnegative().nullable(),
  })
  .strict();

interface PendingAuthorization {
  verifier: string;
  redirectUri: string;
  createdAt: number;
}

interface FigmaVariable {
  id: string;
  name: string;
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
  valuesByMode: Record<string, unknown>;
  variableCollectionId: string;
}

interface FigmaCollection {
  id: string;
  name: string;
  defaultModeId?: string;
  modes?: { modeId: string; name: string }[];
}

interface FigmaComponentMeta {
  name?: string;
  description?: string;
  containing_frame?: { containingComponentSet?: string };
}

interface FigmaStyleMeta {
  name?: string;
  style_type?: string;
  description?: string;
}

export interface FigmaFileData {
  name?: string;
  lastModified?: string;
  document?: FigmaNode;
  components?: Record<string, FigmaComponentMeta>;
  componentSets?: Record<string, FigmaComponentMeta>;
  styles?: Record<string, FigmaStyleMeta>;
}

interface ScannedStyle {
  kind: 'color' | 'typography' | 'shadow';
  value: string;
}

const MAX_API_BYTES = 25_000_000;
const MAX_CHANGES = 400;
const STATE_TTL = 10 * 60 * 1000;

export function figmaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): {
  config: FigmaConfig | null;
  warning: string | null;
} {
  const clientId = env.FIGMA_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.FIGMA_CLIENT_SECRET?.trim() ?? '';
  if (!clientId && !clientSecret) return { config: null, warning: null };
  if (!clientId || !clientSecret)
    return {
      config: null,
      warning:
        'Configuration Figma incomplète : FIGMA_CLIENT_ID et FIGMA_CLIENT_SECRET sont requis ensemble.',
    };
  if (clientId.length > 500 || clientSecret.length > 500)
    return {
      config: null,
      warning: 'Configuration Figma refusée : identifiants trop longs.',
    };
  if (/[\u0000-\u001f]/.test(clientId + clientSecret))
    return {
      config: null,
      warning: 'Configuration Figma refusée : caractères de contrôle.',
    };

  const scopesRaw =
    env.FIGMA_SCOPES?.trim() || 'current_user:read,file_content:read';
  const scopes = scopesRaw.split(/[,\s]+/).filter(Boolean);
  if (
    !scopes.length ||
    scopes.some((scope) => !/^[a-z_]+:[a-z_]+$/.test(scope))
  )
    return { config: null, warning: 'FIGMA_SCOPES est invalide.' };

  const redirectRaw = env.FIGMA_REDIRECT_URI?.trim();
  let redirectUri: string | undefined;
  if (redirectRaw) {
    try {
      const parsed = new URL(redirectRaw);
      if (
        !/^https?:$/.test(parsed.protocol) ||
        parsed.pathname !== '/api/figma/oauth/callback'
      )
        throw new Error('path');
      redirectUri = parsed.toString();
    } catch {
      return {
        config: null,
        warning:
          'FIGMA_REDIRECT_URI doit être une URL http(s) vers /api/figma/oauth/callback.',
      };
    }
  }

  return {
    config: { clientId, clientSecret, redirectUri, scopes },
    warning: null,
  };
}

export class FigmaService {
  readonly statePath: string;
  private tokens: FigmaTokenRecord | null = null;
  private file: FigmaFile | null = null;
  private lastSync: number | null = null;
  private authError: string | null = null;
  private storageError: string | null = null;
  private lastWarnings: string[] = [];
  private pending = new Map<string, PendingAuthorization>();
  private refreshPromise: Promise<string> | null = null;
  private readonly config: FigmaConfig | null;
  private readonly configWarning: string | null;
  private readonly fetcher: typeof fetch;
  private readonly apiBase: string;
  private readonly oauthBase: string;

  constructor(
    private readonly directory: string,
    options: {
      env?: NodeJS.ProcessEnv;
      fetcher?: typeof fetch;
      apiBase?: string;
      oauthBase?: string;
    } = {},
  ) {
    const { config, warning } = figmaConfigFromEnv(options.env ?? process.env);
    this.config = config;
    this.configWarning = warning;
    this.fetcher = options.fetcher ?? fetch;
    this.apiBase = (options.apiBase ?? 'https://api.figma.com').replace(/\/$/, '');
    this.oauthBase = (options.oauthBase ?? 'https://www.figma.com').replace(
      /\/$/,
      '',
    );
    this.statePath = path.join(directory, 'figma.json');
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const raw = await readPrivate(this.statePath, 1_000_000);
      const stored = storedSchema.parse(JSON.parse(raw));
      this.tokens = stored.token;
      this.file = stored.file;
      this.lastSync = stored.lastSync;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Le fichier privé est conservé intact. Une reconnexion archivera la
        // version illisible avant de la remplacer.
        this.storageError =
          'Le fichier privé Figma est illisible. Original préservé ; reconnectez Figma pour le renouveler.';
      }
    }
  }

  async status(): Promise<FigmaServerStatus> {
    const warnings = this.statusWarnings();
    if (!this.config)
      return {
        configured: false,
        status: 'deconnecte',
        user: null,
        file: null,
        lastSync: this.lastSync,
        warnings,
        writeEnabled: false,
      };

    if (this.authError)
      return {
        configured: true,
        status: 'erreur_autorisation',
        user: this.tokens?.userName ?? null,
        file: this.file,
        lastSync: this.lastSync,
        warnings: [...warnings, this.authError],
        writeEnabled: false,
      };

    if (!this.tokens)
      return {
        configured: true,
        status: 'deconnecte',
        user: null,
        file: null,
        lastSync: this.lastSync,
        warnings,
        writeEnabled: false,
      };

    try {
      await this.ensureAccessToken();
    } catch (error) {
      return {
        configured: true,
        status: 'erreur_autorisation',
        user: this.tokens.userName,
        file: this.file,
        lastSync: this.lastSync,
        warnings: [
          ...warnings,
          (error as Error).message ||
            'Autorisation Figma expirée. Reconnectez-vous.',
        ],
        writeEnabled: false,
      };
    }

    return {
      configured: true,
      status: this.file ? 'connecte' : 'connecte_sans_fichier',
      user: this.tokens.userName,
      file: this.file,
      lastSync: this.lastSync,
      warnings,
      writeEnabled: false,
    };
  }

  startAuthorization(origin: string) {
    if (!this.config)
      throw new StudioError(
        this.configWarning ??
          'Figma n’est pas configuré sur ce serveur. Ajoutez FIGMA_CLIENT_ID et FIGMA_CLIENT_SECRET, puis redémarrez.',
        503,
      );
    this.cleanupPending();
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const redirectUri =
      this.config.redirectUri ?? `${origin}/api/figma/oauth/callback`;
    this.pending.set(state, { verifier, redirectUri, createdAt: Date.now() });
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url');
    const url = new URL('/oauth', this.oauthBase);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', this.config.scopes.join(','));
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.toString() };
  }

  async completeAuthorization(params: URLSearchParams) {
    if (!this.config)
      throw new StudioError('Figma n’est pas configuré sur ce serveur.', 503);
    const state = params.get('state') ?? '';
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || Date.now() - pending.createdAt > STATE_TTL)
      throw new StudioError(
        'État OAuth invalide ou expiré. Recommencez la connexion.',
        400,
      );
    if (params.get('error'))
      throw new StudioError('Autorisation Figma refusée ou annulée.', 400);
    const code = params.get('code');
    if (!code || code.length > 4000)
      throw new StudioError('Code d’autorisation Figma manquant.', 400);

    const body = new URLSearchParams({
      redirect_uri: pending.redirectUri,
      code,
      grant_type: 'authorization_code',
      code_verifier: pending.verifier,
    });
    const response = await this.fetcher(`${this.apiBase}/v1/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new StudioError(
        'Figma a refusé l’échange du code d’autorisation. Recommencez la connexion.',
        401,
      );
    const data = (await response.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
      scope?: unknown;
      user_id_string?: unknown;
    };
    this.tokens = parseTokenResponse(data, this.config.scopes.join(','));
    const user = await this.readUser(
      this.tokens.accessToken,
      this.tokens.userId,
    );
    this.tokens.userId = user.id;
    this.tokens.userName = user.name;
    this.file = null;
    this.lastSync = null;
    this.authError = null;
    this.lastWarnings = [];
    await this.save();
    return { user: this.tokens.userName };
  }

  async selectFile(
    link: string,
    tokens: TokenSummary[],
    components: ComponentSummary[],
  ): Promise<FigmaFileResponse> {
    const key = extractFigmaKey(link);
    if (!key)
      throw new StudioError(
        'Ce lien ne pointe pas vers un fichier Figma. Copiez-le depuis Partager.',
        400,
      );
    const data = (await this.apiJson(
      `/v1/files/${encodeURIComponent(key)}`,
    )) as FigmaFileData;
    const file = fileFromData(data, key);
    this.file = file;
    this.lastSync = Date.now();
    const result = await this.computeChanges(key, data, tokens, components);
    this.lastWarnings = result.warnings;
    await this.save();
    return {
      status: this.snapshotStatus(),
      file,
      changes: result.changes,
      warnings: result.warnings,
      lastSync: this.lastSync,
    };
  }

  async changes(
    tokens: TokenSummary[],
    components: ComponentSummary[],
  ): Promise<FigmaChangesResponse> {
    if (!this.file)
      throw new StudioError('Aucun fichier Figma sélectionné.', 409);
    const key = this.file.key;
    const data = (await this.apiJson(
      `/v1/files/${encodeURIComponent(key)}`,
    )) as FigmaFileData;
    this.file = fileFromData(data, key);
    this.lastSync = Date.now();
    const result = await this.computeChanges(key, data, tokens, components);
    this.lastWarnings = result.warnings;
    await this.save();
    return {
      file: this.file,
      changes: result.changes,
      warnings: result.warnings,
      lastSync: this.lastSync,
    };
  }

  async disconnect() {
    this.tokens = null;
    this.file = null;
    this.lastSync = null;
    this.authError = null;
    this.storageError = null;
    this.lastWarnings = [];
    this.refreshPromise = null;
    await this.save();
    return this.snapshotStatus();
  }

  private snapshotStatus(): FigmaServerStatus {
    const warnings = this.statusWarnings();
    if (!this.config)
      return {
        configured: false,
        status: 'deconnecte',
        user: null,
        file: null,
        lastSync: this.lastSync,
        warnings,
        writeEnabled: false,
      };
    if (this.authError)
      return {
        configured: true,
        status: 'erreur_autorisation',
        user: this.tokens?.userName ?? null,
        file: this.file,
        lastSync: this.lastSync,
        warnings: [...warnings, this.authError],
        writeEnabled: false,
      };
    if (!this.tokens)
      return {
        configured: true,
        status: 'deconnecte',
        user: null,
        file: null,
        lastSync: this.lastSync,
        warnings,
        writeEnabled: false,
      };
    return {
      configured: true,
      status: this.file ? 'connecte' : 'connecte_sans_fichier',
      user: this.tokens.userName,
      file: this.file,
      lastSync: this.lastSync,
      warnings,
      writeEnabled: false,
    };
  }

  private statusWarnings() {
    const warnings: string[] = [];
    if (this.configWarning) warnings.push(this.configWarning);
    if (this.storageError) warnings.push(this.storageError);
    return [...warnings, ...this.lastWarnings];
  }

  private async computeChanges(
    key: string,
    data: FigmaFileData,
    tokens: TokenSummary[],
    components: ComponentSummary[],
  ) {
    const warnings: string[] = [];
    const styleResult = convertStyles(data, tokens);
    warnings.push(...styleResult.warnings);

    let variableChanges: FigmaChange[] = [];
    try {
      const variables = await this.apiJson(
        `/v1/files/${encodeURIComponent(key)}/variables/local`,
      );
      const variableResult = convertVariables(variables, tokens);
      variableChanges = variableResult.changes;
      warnings.push(...variableResult.warnings);
    } catch (error) {
      if (error instanceof StudioError && error.status === 401) throw error;
      warnings.push(
        'Variables Figma indisponibles : l’API Variables exige un plan Enterprise et le scope file_variables:read. Les styles de couleur et les composants restent lus.',
      );
    }

    const componentResult = convertComponents(data, components, tokens);
    warnings.push(...componentResult.warnings);

    const merged = mergeChanges([
      styleResult.changes,
      variableChanges,
      componentResult.changes,
    ]);
    merged.sort(
      (a, b) => Number(Boolean(b.oldValue)) - Number(Boolean(a.oldValue)),
    );
    if (merged.length > MAX_CHANGES)
      warnings.push(
        `Seuls les ${MAX_CHANGES} premiers changements sont affichés. Rapprochez les noms ou importez un périmètre plus petit.`,
      );
    return {
      changes: merged.slice(0, MAX_CHANGES),
      warnings: [...new Set(warnings)].slice(0, 8),
    };
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.tokens)
      throw new StudioError('Figma n’est pas connecté.', 401);
    if (this.tokens.expiresAt - Date.now() > 60_000) {
      this.authError = null;
      return this.tokens.accessToken;
    }
    if (!this.refreshPromise)
      this.refreshPromise = this.refreshToken().finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async refreshToken(): Promise<string> {
    if (!this.tokens)
      throw new StudioError('Figma n’est pas connecté.', 401);
    const response = await this.fetcher(`${this.apiBase}/v1/oauth/refresh`, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: this.tokens.refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      this.authError =
        'Autorisation Figma expirée ou révoquée. Reconnectez-vous.';
      throw new StudioError(this.authError, 401);
    }
    const data = (await response.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
      scope?: unknown;
    };
    const token = parseTokenResponse(data, this.tokens.scope, {
      refreshToken: this.tokens.refreshToken,
      userId: this.tokens.userId,
      userName: this.tokens.userName,
    });
    this.tokens = token;
    this.authError = null;
    await this.save();
    return token.accessToken;
  }

  private async apiJson(route: string): Promise<unknown> {
    const token = await this.ensureAccessToken();
    const response = await this.fetcher(`${this.apiBase}${route}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 401) {
      this.authError =
        'Autorisation Figma expirée ou révoquée. Reconnectez-vous.';
      throw new StudioError(this.authError, 401);
    }
    if (response.status === 403)
      throw new StudioError(
        'Figma a refusé l’accès à ce fichier ou à cette API. Vérifiez vos droits, le plan et les scopes de l’application.',
        403,
      );
    if (response.status === 404)
      throw new StudioError('Fichier Figma introuvable ou non partagé.', 404);
    if (response.status === 429)
      throw new StudioError(
        'Figma limite les requêtes. Réessayez dans quelques instants.',
        429,
      );
    if (!response.ok)
      throw new StudioError(
        `Figma a répondu avec le statut ${response.status}. Réessayez plus tard.`,
        502,
      );
    const raw = await response.text();
    if (raw.length > MAX_API_BYTES)
      throw new StudioError(
        'Réponse Figma trop volumineuse. Sélectionnez un fichier plus petit.',
        413,
      );
    try {
      return JSON.parse(raw);
    } catch {
      throw new StudioError('Réponse Figma illisible.', 502);
    }
  }

  private async readUser(accessToken: string, fallbackId: string | null) {
    try {
      const response = await this.fetcher(`${this.apiBase}/v1/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return { id: fallbackId, name: null };
      const data = (await response.json()) as {
        id?: unknown;
        handle?: unknown;
        email?: unknown;
      };
      return {
        id: typeof data.id === 'string' ? data.id : fallbackId,
        name:
          (typeof data.handle === 'string' && data.handle.trim()) ||
          (typeof data.email === 'string' && data.email.trim()) ||
          null,
      };
    } catch {
      return { id: fallbackId, name: null };
    }
  }

  private basicAuth() {
    return (
      'Basic ' +
      Buffer.from(
        `${this.config?.clientId ?? ''}:${this.config?.clientSecret ?? ''}`,
      ).toString('base64')
    );
  }

  private cleanupPending() {
    const now = Date.now();
    for (const [key, value] of this.pending)
      if (now - value.createdAt > STATE_TTL) this.pending.delete(key);
    while (this.pending.size > 20) {
      const oldest = this.pending.keys().next().value;
      if (oldest) this.pending.delete(oldest);
    }
  }

  private async save() {
    if (this.storageError) {
      try {
        const current = await readPrivate(this.statePath, 1_000_000);
        const archive = path.join(
          this.directory,
          `figma-preserved-${randomBytes(6).toString('hex')}.json`,
        );
        await atomicWrite(archive, current);
        this.storageError = null;
      } catch {
        /* Rien à archiver si le fichier a déjà disparu. */
      }
    }
    const raw =
      JSON.stringify(
        {
          version: 1,
          token: this.tokens,
          file: this.file,
          lastSync: this.lastSync,
        },
        null,
        2,
      ) + '\n';
    await atomicWrite(this.statePath, raw);
  }
}

function parseTokenResponse(
  data: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  },
  fallbackScope: string,
  existing?: Pick<
    FigmaTokenRecord,
    'refreshToken' | 'userId' | 'userName'
  >,
): FigmaTokenRecord {
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token ?? existing?.refreshToken;
  const expiresIn = data.expires_in;
  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    accessToken.length > 8000 ||
    typeof refreshToken !== 'string' ||
    !refreshToken ||
    refreshToken.length > 8000 ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  )
    throw new StudioError(
      'Figma a renvoyé une autorisation incomplète. Recommencez la connexion.',
      502,
    );
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(60, Math.floor(expiresIn)) * 1000,
    userId: existing?.userId ?? null,
    userName: existing?.userName ?? null,
    scope: typeof data.scope === 'string' ? data.scope : fallbackScope,
  };
}

function fileFromData(data: FigmaFileData, key: string): FigmaFile {
  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim().slice(0, 200)
      : 'Fichier Figma';
  return { key, name, modified: formatModified(data.lastModified) };
}

function formatModified(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 80);
  return `modifié le ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString(
    'fr-FR',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColor(value: unknown): value is FigmaColor {
  if (!isRecord(value)) return false;
  return ['r', 'g', 'b'].every(
    (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
  );
}

function isAlias(value: unknown): value is { type: string; id: string } {
  return (
    isRecord(value) &&
    value.type === 'VARIABLE_ALIAS' &&
    typeof value.id === 'string'
  );
}

function colorHex(value: FigmaColor, opacity = 1): string | null {
  const alpha = (value.a ?? 1) * opacity;
  if (!Number.isFinite(alpha) || alpha < 0.999) return null;
  const channel = (component: number) =>
    Math.round(Math.max(0, Math.min(1, component)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(value.r)}${channel(value.g)}${channel(value.b)}`;
}

function rgba(value: FigmaColor): string {
  const channel = (component: number) =>
    Math.round(Math.max(0, Math.min(1, component)) * 255);
  const alpha = Math.max(0, Math.min(1, value.a ?? 1));
  return `rgba(${channel(value.r)},${channel(value.g)},${channel(value.b)},${Number(
    alpha.toFixed(2),
  )})`;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function scanStyles(document: FigmaNode | undefined) {
  const found = new Map<string, ScannedStyle>();
  if (!document) return found;
  const stack: FigmaNode[] = [document];
  let visited = 0;
  while (stack.length && visited < 200_000) {
    const node = stack.pop()!;
    visited += 1;
    const styleIds = node.styles;
    if (styleIds) {
      if (styleIds.fill && !found.has(styleIds.fill)) {
        const paint = node.fills?.find(
          (candidate) =>
            candidate.visible !== false &&
            candidate.type === 'SOLID' &&
            candidate.color,
        );
        if (paint?.color) {
          const value = colorHex(paint.color, paint.opacity ?? 1);
          if (value) found.set(styleIds.fill, { kind: 'color', value });
        }
      }
      if (
        styleIds.text &&
        !found.has(styleIds.text) &&
        node.type === 'TEXT' &&
        node.style
      ) {
        const style = node.style;
        if (style.fontFamily && typeof style.fontSize === 'number') {
          const weight =
            typeof style.fontWeight === 'number' ? style.fontWeight : 400;
          found.set(styleIds.text, {
            kind: 'typography',
            value: `${style.fontFamily} ${style.fontSize}px ${weight}`,
          });
        }
      }
      if (styleIds.effect && !found.has(styleIds.effect)) {
        const effect = node.effects?.find(
          (candidate) =>
            candidate.visible !== false &&
            (candidate.type === 'DROP_SHADOW' ||
              candidate.type === 'INNER_SHADOW') &&
            candidate.color,
        );
        if (effect?.color && effect.offset) {
          const parts = [
            effect.type === 'INNER_SHADOW' ? 'inset' : '',
            `${Number((effect.offset.x ?? 0).toFixed(2))}px`,
            `${Number((effect.offset.y ?? 0).toFixed(2))}px`,
            `${Number((effect.radius ?? 0).toFixed(2))}px`,
            `${Number((effect.spread ?? 0).toFixed(2))}px`,
            rgba(effect.color),
          ].filter(Boolean);
          found.set(styleIds.effect, {
            kind: 'shadow',
            value: parts.join(' '),
          });
        }
      }
    }
    if (node.children)
      for (let index = node.children.length - 1; index >= 0; index -= 1)
        stack.push(node.children[index]);
  }
  return found;
}

export function convertStyles(
  data: FigmaFileData,
  tokens: TokenSummary[],
): { changes: FigmaChange[]; warnings: string[] } {
  const scanned = scanStyles(data.document);
  const byName = new Map(
    tokens.map((token) => [normalizeName(token.name), token]),
  );
  const changes: FigmaChange[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let withoutValue = 0;
  for (const [styleId, meta] of Object.entries(data.styles ?? {})) {
    const name = normalizeName(meta.name ?? '');
    if (!name) continue;
    const found = scanned.get(styleId);
    if (!found) {
      withoutValue += 1;
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    const existing = byName.get(name);
    if (existing && existing.type !== found.kind) {
      warnings.push(
        `Style ${meta.name ?? name} ignoré : le token local ${existing.name} n’a pas le même type.`,
      );
      continue;
    }
    if (existing && existing.value === found.value) continue;
    changes.push({
      id: `style:${styleId}`,
      category: found.kind,
      name,
      ...(existing ? { oldValue: existing.value } : {}),
      newValue: found.value,
    });
  }
  if (withoutValue)
    warnings.push(
      `${withoutValue} style(s) sans valeur lisible : ils ne sont pas utilisés sur un nœud du document.`,
    );
  return { changes, warnings };
}

export function convertVariables(
  payload: unknown,
  tokens: TokenSummary[],
): { changes: FigmaChange[]; warnings: string[] } {
  if (!isRecord(payload) || !isRecord(payload.meta))
    return { changes: [], warnings: ['Réponse Variables Figma illisible.'] };
  const meta = payload.meta;
  const variablesRaw = meta.variables;
  const collectionsRaw = meta.variableCollections;
  if (!isRecord(variablesRaw) || !isRecord(collectionsRaw))
    return { changes: [], warnings: ['Réponse Variables Figma incomplète.'] };

  const variables = variablesRaw as Record<string, FigmaVariable>;
  const collections = collectionsRaw as Record<string, FigmaCollection>;
  const byName = new Map(
    tokens.map((token) => [normalizeName(token.name), token]),
  );
  const used = new Set<string>();
  const changes: FigmaChange[] = [];
  const warnings: string[] = [];

  for (const variable of Object.values(variables)) {
    if (
      !variable ||
      variable.resolvedType !== 'COLOR' ||
      typeof variable.id !== 'string' ||
      typeof variable.name !== 'string'
    )
      continue;
    const collection = collections[variable.variableCollectionId];
    const modeId =
      collection?.defaultModeId ??
      collection?.modes?.[0]?.modeId ??
      Object.keys(variable.valuesByMode ?? {})[0];
    if (!modeId) continue;
    const resolved = resolveVariable(
      variable.id,
      modeId,
      variables,
      collections,
      new Set(),
    );
    if (!isColor(resolved)) {
      warnings.push(
        `Variable ${variable.name} ignorée : couleur non résolue sans transparence.`,
      );
      continue;
    }
    const value = colorHex(resolved);
    if (!value) {
      warnings.push(
        `Variable ${variable.name} ignorée : la transparence n’est pas représentable en #RRGGBB.`,
      );
      continue;
    }

    let name = normalizeName(variable.name);
    if (!name) continue;
    if (used.has(name)) {
      const collectionName = normalizeName(collection?.name ?? '');
      if (collectionName) name = `${name}-${collectionName}`;
    }
    if (used.has(name)) {
      warnings.push(`Variable ${variable.name} ignorée : nom local en doublon.`);
      continue;
    }
    used.add(name);

    const existing = byName.get(name);
    if (existing && existing.type !== 'color') {
      warnings.push(
        `Variable ${variable.name} ignorée : le token local ${existing.name} n’est pas une couleur.`,
      );
      continue;
    }
    if (existing && existing.value === value) continue;
    changes.push({
      id: `variable:${variable.id}`,
      category: 'color',
      name,
      ...(existing ? { oldValue: existing.value } : {}),
      newValue: value,
    });
  }
  return { changes, warnings };
}

function resolveVariable(
  id: string,
  modeId: string,
  variables: Record<string, FigmaVariable>,
  collections: Record<string, FigmaCollection>,
  seen: Set<string>,
): unknown {
  if (seen.has(id)) return null;
  seen.add(id);
  const variable = variables[id];
  if (!variable) return null;
  const values = variable.valuesByMode ?? {};
  const ownMode = Object.prototype.hasOwnProperty.call(values, modeId)
    ? modeId
    : (collections[variable.variableCollectionId]?.defaultModeId ??
      Object.keys(values)[0]);
  if (!ownMode) return null;
  const value = values[ownMode];
  if (isAlias(value))
    return resolveVariable(value.id, ownMode, variables, collections, seen);
  return value;
}

interface FigmaCandidate {
  key: string;
  setId?: string;
  nodeId: string;
  name: string;
  description?: string;
  variants: FigmaComponentVariant[];
  warnings: string[];
}

const MAX_VARIANTS = 200;

function cleanComponentName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Retire le préfixe du component set d’un nom de variante Figma. */
function variantLabel(rawName: string, setName: string): string {
  const raw = rawName.replace(/\s+/g, ' ').trim();
  const set = setName.replace(/\s+/g, ' ').trim();
  if (!set) return raw;
  if (raw.toLowerCase().startsWith(`${set.toLowerCase()}/`))
    return raw.slice(set.length + 1).trim();
  const parts = raw.split('/').map((part) => part.trim()).filter(Boolean);
  const lastSet = set.split('/').pop()?.toLowerCase();
  if (parts.length > 1 && parts[0].toLowerCase() === lastSet) parts.shift();
  return parts.join(' / ').trim() || raw;
}

const MAX_PROP_VALUES = 24;

/** Lit `Size=Large, State=Hover`, comme le fait le client. */
function parseVariantPropsServer(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const part of name.split(',')) {
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

/**
 * Regroupe les variantes par component set Figma. Un component set donne un
 * seul changement de composant, avec toutes ses variantes et leur aperçu HTML.
 * Un composant isolé reste un composant à variante unique.
 */
export function convertComponents(
  data: FigmaFileData,
  _components: ComponentSummary[],
  tokens: TokenSummary[] = [],
): { changes: FigmaChange[]; warnings: string[] } {
  const warnings: string[] = [];
  const nodeById = indexFigmaNodes(data.document);
  const setMetas = data.componentSets ?? {};
  const componentMetas = data.components ?? {};
  const candidates = new Map<string, FigmaCandidate>();

  const createCandidate = (
    key: string,
    nodeId: string,
    name: string,
    description: string | undefined,
    setId?: string,
  ): FigmaCandidate => {
    const candidate: FigmaCandidate = {
      key,
      nodeId,
      name: cleanComponentName(name) || 'Composant Figma',
      ...(setId ? { setId } : {}),
      ...(description?.trim() ? { description: description.trim() } : {}),
      variants: [],
      warnings: [],
    };
    candidates.set(key, candidate);
    return candidate;
  };

  for (const [componentId, meta] of Object.entries(componentMetas)) {
    const rawName = meta.name?.replace(/\s+/g, ' ').trim();
    if (!rawName) continue;
    const setId = meta.containing_frame?.containingComponentSet;
    let candidate: FigmaCandidate | undefined;
    let label = rawName;

    if (setId && setMetas[setId]) {
      const setName = setMetas[setId].name?.trim() || 'Composant Figma';
      candidate =
        candidates.get(`set:${setId}`) ??
        createCandidate(
          `set:${setId}`,
          setId,
          setName,
          setMetas[setId].description,
          setId,
        );
      label = variantLabel(rawName, candidate.name);
    } else {
      candidate = createCandidate(
        `component:${componentId}`,
        componentId,
        rawName,
        meta.description,
      );
      // Un composant isolé est un composant simple : une seule variante par
      // défaut, même si son nom contient une barre oblique.
      label = 'Par défaut';
    }

    if (candidate.variants.length >= MAX_VARIANTS) {
      candidate.warnings.push(
        `Seules les ${MAX_VARIANTS} premières variantes sont importées.`,
      );
      continue;
    }

    const name = label.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Par défaut';
    const props = parseVariantPropsServer(name);
    const rendered = renderFigmaNode(nodeById.get(componentId), tokens);
    candidate.variants.push({
      nodeId: componentId,
      name,
      props,
      code: rendered.code,
      ...(rendered.warnings.length
        ? { warnings: rendered.warnings.slice(0, 4) }
        : {}),
    });
    for (const warning of rendered.warnings)
      if (!candidate.warnings.includes(warning))
        candidate.warnings.push(warning);
    if (!rendered.code)
      warnings.push(
        `Variante ${candidate.name} · ${name} : aucun code récupérable, la variante reste éditable.`,
      );
  }

  // Un component set sans composant enfant garde une variante par défaut.
  for (const [setId, meta] of Object.entries(setMetas)) {
    if (candidates.has(`set:${setId}`)) continue;
    const candidate = createCandidate(
      `set:${setId}`,
      setId,
      meta.name?.trim() || 'Composant Figma',
      meta.description,
      setId,
    );
    const rendered = renderFigmaNode(nodeById.get(setId), tokens);
    candidate.variants.push({
      nodeId: setId,
      name: 'Par défaut',
      props: {},
      code: rendered.code,
      ...(rendered.warnings.length
        ? { warnings: rendered.warnings.slice(0, 4) }
        : {}),
    });
    candidate.warnings.push(...rendered.warnings);
  }

  const changes: FigmaChange[] = [];
  for (const candidate of candidates.values()) {
    if (!candidate.variants.length) continue;
    changes.push({
      id: `component:${candidate.key}`,
      category: 'component',
      name: candidate.name,
      component: {
        key: candidate.key,
        ...(candidate.setId ? { setId: candidate.setId } : {}),
        nodeId: candidate.nodeId,
        ...(candidate.description
          ? { description: candidate.description.slice(0, 2000) }
          : {}),
        variants: candidate.variants,
        ...(candidate.warnings.length
          ? { warnings: [...new Set(candidate.warnings)].slice(0, 6) }
          : {}),
      },
    });
  }

  if (changes.length > 1)
    warnings.push(
      `${changes.length} composants Figma regroupés par component set.`,
    );
  return { changes, warnings: [...new Set(warnings)].slice(0, 8) };
}

function mergeChanges(groups: FigmaChange[][]): FigmaChange[] {
  const merged = new Map<string, FigmaChange>();
  for (const group of groups)
    for (const change of group)
      merged.set(
        `${change.category}:${change.name.toLowerCase()}:${change.variant ?? ''}`,
        change,
      );
  return [...merged.values()];
}

// Exporté pour les tests de conversion sans réseau.
export { scanStyles as scanFigmaStyles };
