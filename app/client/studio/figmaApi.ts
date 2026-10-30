import { request } from '../api.js';
import type {
  FigmaChangesResponse,
  FigmaFileResponse,
  FigmaServerStatus,
} from '../../shared/figma.js';
import { componentSummaries, tokenSummaries } from './figmaMock.js';
import type { ComponentDoc, Token } from './model.js';

// Toutes les opérations Figma passent par le serveur local. Le navigateur ne
// manipule que des noms, des valeurs et des métadonnées, jamais un jeton.

export function getFigmaStatus(signal?: AbortSignal) {
  return request<FigmaServerStatus>('figma/status', undefined, signal);
}

export function startFigmaAuthorization() {
  return request<{ url: string }>('figma/oauth/start', {});
}

export function selectFigmaFile(
  link: string,
  tokens: Token[],
  components: ComponentDoc[],
  signal?: AbortSignal,
) {
  return request<FigmaFileResponse>(
    'figma/file',
    {
      link,
      tokens: tokenSummaries(tokens),
      components: componentSummaries(components),
    },
    signal,
  );
}

export function getFigmaChanges(
  tokens: Token[],
  components: ComponentDoc[],
  signal?: AbortSignal,
) {
  return request<FigmaChangesResponse>(
    'figma/changes',
    {
      tokens: tokenSummaries(tokens),
      components: componentSummaries(components),
    },
    signal,
  );
}

export function disconnectFigmaAccount() {
  return request<FigmaServerStatus>('figma/disconnect', {});
}
