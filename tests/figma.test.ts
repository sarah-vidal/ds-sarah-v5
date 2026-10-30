import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FigmaService,
  figmaConfigFromEnv,
  type ComponentSummary,
  type FigmaFileData,
  type TokenSummary,
} from '../connectors/figma/rest.js';

const ENV = {
  FIGMA_CLIENT_ID: 'client-id',
  FIGMA_CLIENT_SECRET: 'client-secret',
};

const TOKENS: TokenSummary[] = [
  { name: 'color-primary-500', type: 'color', value: '#000000' },
  { name: 'font-heading-lg', type: 'typography', value: 'Inter 20px 400' },
  { name: 'shadow-card', type: 'shadow', value: 'none' },
];
const COMPONENTS: ComponentSummary[] = [
  { name: 'Bouton', variants: [{ n: 'Primaire' }] },
];

const FILE_DATA: FigmaFileData = {
  name: 'DS-Sarah — Test',
  lastModified: '2026-10-29T10:00:00Z',
  document: {
    type: 'DOCUMENT',
    children: [
      {
        type: 'FRAME',
        styles: { fill: 'S:color', text: 'S:text' },
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
        children: [
          {
            type: 'TEXT',
            styles: { text: 'S:text' },
            style: {
              fontFamily: 'Inter',
              fontSize: 24,
              fontWeight: 700,
            },
          },
        ],
      },
      {
        type: 'RECTANGLE',
        styles: { effect: 'S:shadow' },
        effects: [
          {
            type: 'DROP_SHADOW',
            visible: true,
            offset: { x: 0, y: 10 },
            radius: 20,
            spread: 0,
            color: { r: 0, g: 0, b: 0, a: 0.2 },
          },
        ],
      },
    ],
  },
  styles: {
    'S:color': { name: 'color-primary-500', style_type: 'FILL' },
    'S:text': { name: 'font-heading-lg', style_type: 'TEXT' },
    'S:shadow': { name: 'shadow-card', style_type: 'EFFECT' },
  },
  components: {
    'C:badge': { name: 'Badge' },
    'C:button': {
      name: 'Bouton/Lien',
      containing_frame: { containingComponentSet: 'CS:button' },
    },
    'C:button-secondary': {
      name: 'Bouton/Secondaire',
      containing_frame: { containingComponentSet: 'CS:button' },
    },
  },
  componentSets: {
    'CS:button': { name: 'Bouton' },
  },
};

const VARIABLES = {
  meta: {
    variables: {
      'V:accent': {
        id: 'V:accent',
        name: 'color-accent-500',
        resolvedType: 'COLOR',
        variableCollectionId: 'VC:base',
        valuesByMode: { 'M:default': { r: 0.1, g: 0.7, b: 0.6, a: 1 } },
      },
    },
    variableCollections: {
      'VC:base': {
        id: 'VC:base',
        name: 'Base',
        defaultModeId: 'M:default',
        modes: [{ modeId: 'M:default', name: 'Default' }],
      },
    },
  },
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetcher, calls };
}

async function withService(
  t: { after: (fn: () => Promise<void>) => void },
  options: {
    handler: (
      url: string,
      init?: RequestInit,
    ) => Response | Promise<Response>;
    seed?: Record<string, unknown>;
  },
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-figma-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  if (options.seed)
    await writeFile(
      path.join(directory, 'figma.json'),
      JSON.stringify(options.seed),
      'utf8',
    );
  const { fetcher, calls } = mockFetch(options.handler);
  const service = new FigmaService(directory, {
    env: ENV,
    fetcher,
    apiBase: 'https://api.test',
    oauthBase: 'https://www.test',
  });
  await service.init();
  return { directory, service, calls };
}

function seedToken(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    token: {
      accessToken: 'access-old',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 60 * 60 * 1000,
      userId: 'u1',
      userName: 'Sarah',
      scope: 'current_user:read,file_content:read',
      ...overrides,
    },
    file: null,
    lastSync: null,
  };
}

test('configuration Figma : paires incomplètes et scopes par défaut', () => {
  assert.deepEqual(figmaConfigFromEnv({}), {
    config: null,
    warning: null,
  });
  const partial = figmaConfigFromEnv({ FIGMA_CLIENT_ID: 'id' });
  assert.equal(partial.config, null);
  assert.match(partial.warning ?? '', /FIGMA_CLIENT_ID/);

  const defaults = figmaConfigFromEnv(ENV);
  assert.ok(defaults.config);
  assert.deepEqual(defaults.config?.scopes, [
    'current_user:read',
    'file_content:read',
  ]);
  assert.equal(defaults.config?.redirectUri, undefined);

  const variables = figmaConfigFromEnv({
    ...ENV,
    FIGMA_SCOPES: 'file_content:read,file_variables:read',
  });
  assert.deepEqual(variables.config?.scopes, [
    'file_content:read',
    'file_variables:read',
  ]);

  const badRedirect = figmaConfigFromEnv({
    ...ENV,
    FIGMA_REDIRECT_URI: 'https://example.com/callback',
  });
  assert.equal(badRedirect.config, null);
  assert.match(badRedirect.warning ?? '', /FIGMA_REDIRECT_URI/);
});

test('OAuth : état, PKCE S256, échange du code et profil, sans fuite de jeton', async (t) => {
  let verifier = '';
  const { service, calls } = await withService(t, {
    handler(url, init) {
      if (url === 'https://api.test/v1/oauth/token') {
        const body = new URLSearchParams(String(init?.body));
        verifier = body.get('code_verifier') ?? '';
        assert.equal(body.get('grant_type'), 'authorization_code');
        assert.equal(body.get('code'), 'code-1');
        assert.equal(
          body.get('redirect_uri'),
          'http://127.0.0.1:4310/api/figma/oauth/callback',
        );
        return jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
          scope: 'current_user:read,file_content:read',
          user_id_string: 'u1',
        });
      }
      if (url === 'https://api.test/v1/me')
        return jsonResponse({ id: 'u1', handle: 'sarah' });
      throw new Error(`Route inattendue : ${url}`);
    },
  });

  const authorization = service.startAuthorization('http://127.0.0.1:4310');
  const url = new URL(authorization.url);
  assert.equal(url.origin, 'https://www.test');
  assert.equal(url.pathname, '/oauth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'http://127.0.0.1:4310/api/figma/oauth/callback',
  );
  assert.equal(
    url.searchParams.get('scope'),
    'current_user:read,file_content:read',
  );
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');
  const challenge = url.searchParams.get('code_challenge');
  assert.ok(state);
  assert.ok(challenge);

  const result = await service.completeAuthorization(
    new URLSearchParams({ code: 'code-1', state }),
  );
  assert.equal(result.user, 'sarah');
  assert.equal(
    createHash('sha256').update(verifier).digest('base64url'),
    challenge,
  );

  const tokenCall = calls.find((call) => call.url.endsWith('/oauth/token'));
  assert.ok(tokenCall);
  assert.equal(
    new Headers(tokenCall.init?.headers).get('authorization'),
    'Basic ' + Buffer.from('client-id:client-secret').toString('base64'),
  );

  const status = await service.status();
  assert.equal(status.configured, true);
  assert.equal(status.status, 'connecte_sans_fichier');
  assert.equal(status.user, 'sarah');
  assert.equal(status.writeEnabled, false);
  assert.ok(!JSON.stringify(status).includes('access-1'));
  assert.ok(!JSON.stringify(status).includes('refresh-1'));

  await assert.rejects(
    service.completeAuthorization(
      new URLSearchParams({ code: 'code-1', state: state! }),
    ),
    /État OAuth invalide/,
  );
});

test('lecture d’un fichier : styles, variables et composants, sans suppression', async (t) => {
  const { service, directory, calls } = await withService(t, {
    seed: seedToken(),
    handler(url, init) {
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        'Bearer access-old',
      );
      if (url === 'https://api.test/v1/files/ABC123/variables/local')
        return jsonResponse(VARIABLES);
      if (url === 'https://api.test/v1/files/ABC123')
        return jsonResponse(FILE_DATA);
      throw new Error(`Route inattendue : ${url}`);
    },
  });

  const result = await service.selectFile(
    'https://www.figma.com/design/ABC123/DS-Sarah',
    TOKENS,
    COMPONENTS,
  );

  assert.equal(result.file.name, 'DS-Sarah — Test');
  assert.equal(result.file.key, 'ABC123');
  assert.equal(result.status.status, 'connecte');
  assert.equal(result.status.writeEnabled, false);

  const byName = new Map(result.changes.map((change) => [change.id, change]));
  assert.equal(byName.get('style:S:color')?.oldValue, '#000000');
  assert.equal(byName.get('style:S:color')?.newValue, '#ff0000');
  assert.equal(byName.get('style:S:text')?.newValue, 'Inter 24px 700');
  assert.equal(
    byName.get('style:S:shadow')?.newValue,
    '0px 10px 20px 0px rgba(0,0,0,0.2)',
  );
  assert.equal(byName.get('variable:V:accent')?.newValue, '#1ab399');

  // Un composant isolé devient un seul composant à variante par défaut.
  const badge = byName.get('component:component:C:badge');
  assert.equal(badge?.name, 'Badge');
  assert.equal(badge?.component?.variants.length, 1);
  assert.equal(badge?.component?.variants[0]?.name, 'Par défaut');
  assert.deepEqual(badge?.component?.variants[0]?.props, {});

  // Un component set donne un seul changement avec toutes ses variantes.
  const button = byName.get('component:set:CS:button');
  assert.equal(button?.name, 'Bouton');
  assert.equal(button?.component?.setId, 'CS:button');
  assert.deepEqual(
    button?.component?.variants.map((variant) => variant.name),
    ['Lien', 'Secondaire'],
  );
  assert.deepEqual(
    button?.component?.variants.map((variant) => variant.nodeId),
    ['C:button', 'C:button-secondary'],
  );
  assert.equal(
    result.changes.filter((change) => change.category === 'component').length,
    2,
  );

  // Aucun token local n’est modifié ou supprimé par la lecture.
  assert.deepEqual(TOKENS, [
    { name: 'color-primary-500', type: 'color', value: '#000000' },
    { name: 'font-heading-lg', type: 'typography', value: 'Inter 20px 400' },
    { name: 'shadow-card', type: 'shadow', value: 'none' },
  ]);

  const privateFile = await readFile(path.join(directory, 'figma.json'), 'utf8');
  assert.match(privateFile, /"accessToken": "access-old"/);
  assert.ok(!JSON.stringify(result).includes('access-old'));
  assert.ok(!JSON.stringify(result).includes('refresh-old'));
  assert.ok(calls.some((call) => call.url.endsWith('/variables/local')));
});

test('variables refusées : la lecture des styles et composants continue', async (t) => {
  const { service } = await withService(t, {
    seed: seedToken(),
    handler(url) {
      if (url.endsWith('/variables/local'))
        return jsonResponse({ error: 'forbidden' }, 403);
      if (url === 'https://api.test/v1/files/ABC123')
        return jsonResponse(FILE_DATA);
      throw new Error(`Route inattendue : ${url}`);
    },
  });

  const result = await service.selectFile(
    'https://www.figma.com/design/ABC123/DS-Sarah',
    TOKENS,
    COMPONENTS,
  );
  assert.ok(result.changes.some((change) => change.category === 'color'));
  assert.ok(
    result.changes.some((change) => change.category === 'component'),
  );
  assert.ok(
    result.warnings.some((warning) => /Variables Figma indisponibles/.test(warning)),
  );
  assert.equal(result.status.writeEnabled, false);
});

test('jeton expiré : rafraîchissement sur api.figma.com puis nouvel accès', async (t) => {
  const { service, calls, directory } = await withService(t, {
    seed: seedToken({ expiresAt: 1 }),
    handler(url, init) {
      if (url === 'https://api.test/v1/oauth/refresh') {
        assert.equal(
          new Headers(init?.headers).get('authorization'),
          'Basic ' + Buffer.from('client-id:client-secret').toString('base64'),
        );
        assert.equal(
          new URLSearchParams(String(init?.body)).get('refresh_token'),
          'refresh-old',
        );
        return jsonResponse({
          access_token: 'access-new',
          expires_in: 3600,
        });
      }
      throw new Error(`Route inattendue : ${url}`);
    },
  });

  const status = await service.status();
  assert.equal(status.status, 'connecte_sans_fichier');
  assert.equal(status.user, 'Sarah');
  assert.ok(calls.some((call) => call.url.endsWith('/v1/oauth/refresh')));

  const privateFile = await readFile(path.join(directory, 'figma.json'), 'utf8');
  assert.match(privateFile, /"accessToken": "access-new"/);
  assert.match(privateFile, /"refreshToken": "refresh-old"/);
});

test('déconnexion : état privé nettoyé et statut vérifiable', async (t) => {
  const { service } = await withService(t, {
    seed: seedToken(),
    handler(url) {
      throw new Error(`Aucune requête attendue : ${url}`);
    },
  });

  const status = await service.disconnect();
  assert.equal(status.status, 'deconnecte');
  assert.equal(status.user, null);
  assert.equal(status.file, null);
  assert.equal(status.writeEnabled, false);
});
