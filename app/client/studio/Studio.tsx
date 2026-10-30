import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  TYPES,
  applyVars,
  font,
  ink,
  loadComponents,
  loadTokens,
  mergeImportedComponents,
  mergeableImportGroups,
  newId,
  propsLabel,
  saveComponents,
  saveTokens,
  type ComponentDoc,
  type ManualCopyField,
  type Token,
  type TokenType,
  type Variant,
} from './model.js';
import { generateComponentCopy } from './copy.js';
import { FigmaGlyph, FigmaMenu, FigmaPanel, FigmaToast } from './Figma.js';
import {
  ALL_CATEGORIES,
  FIGMA_MOCK,
  UNDO_STORAGE_KEY,
  applyFigmaChanges,
  countFigmaChanges,
  extractFigmaKey,
  initialFigmaSession,
  isFigmaDemo,
  parseUndoSnapshot,
  selectedFigmaChanges,
  serverFigmaSession,
  type FigmaCategory,
  type FigmaChange,
  type FigmaImportMeta,
  type FigmaSession,
  type FigmaUndoSnapshot,
} from './figmaMock.js';
import {
  disconnectFigmaAccount,
  getFigmaChanges,
  getFigmaStatus,
  selectFigmaFile,
  startFigmaAuthorization,
} from './figmaApi.js';
import {
  IMPORT_FILE_KEY,
  MAX_IMPORT_BYTES,
  importVariablesToChanges,
  isImportedChange,
  parseVariablesImport,
} from '../../shared/variables.js';

type View = 'tokens' | 'comp' | 'prev';
type Filter = 'all' | TokenType;

const TYPE_KEYS = Object.keys(TYPES) as TokenType[];
const VIEWPORTS = [
  { width: '375px', label: 'Mobile' },
  { width: '768px', label: 'Tablette' },
  { width: '100%', label: 'Bureau' },
] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const FACE = {
  ok: '<svg viewBox="0 0 84 72" aria-hidden="true"><path d="M12 40C10 22 26 12 42 14c17 2 26 12 24 28-2 14-14 18-28 18S14 54 12 40z" fill="#FFD966"/><circle cx="24" cy="43" r="4.5" fill="#FFA39B"/><circle cx="54" cy="43" r="4.5" fill="#FFA39B"/><path d="M24 34q4.5 4.5 9 0M45 34q4.5 4.5 9 0M34 45q5 5 10 0" fill="none" stroke="#2b2433" stroke-width="2.6" stroke-linecap="round"/><path fill="#FF7C93" transform="translate(62 2)" d="M6 11C1 7-1 3 2 1.5S6 3 6 5c0-2 1.5-4.5 4-3.5S11 7 6 11z"/><path fill="#FF7C93" transform="translate(72 16) scale(.8)" d="M6 11C1 7-1 3 2 1.5S6 3 6 5c0-2 1.5-4.5 4-3.5S11 7 6 11z"/></svg>',
  no: '<svg viewBox="0 0 84 72" aria-hidden="true"><path d="M12 54C8 40 12 30 20 28c-2-9 6-14 11-8 2-7 12-8 15-1 6-3 13 2 10 9 8 2 12 12 10 22-2 12-12 16-27 16S15 66 12 54z" fill="#F66F85"/><path d="M24 42l11 5M58 42L47 47M36 60q5-4 10 0" fill="none" stroke="#3a1a28" stroke-width="3" stroke-linecap="round"/><circle cx="30" cy="51" r="2.4" fill="#3a1a28"/><circle cx="52" cy="51" r="2.4" fill="#3a1a28"/><path d="M64 12c-3 0-4-4-1-5 0-3 5-4 6-1 3-1 6 2 4 4 3 1 2 5-1 5z" fill="none" stroke="#F7A7B3" stroke-width="2"/></svg>',
};

const LOGO =
  '<svg viewBox="0 0 64 56" aria-hidden="true"><path d="M14 18c3-9 16-10 20-3 5-7 17-3 18 6 7 2 10 10 5 16 3 8-4 15-12 13-4 7-14 7-18 0-8 4-18-2-14-10-6-5-4-15 1-22z" fill="#BFA8E6"/><path d="M21 28q3.5 3.5 7 0M36 28q3.5 3.5 7 0M28 37q4 4 8 0" fill="none" stroke="#2b2433" stroke-width="2.2" stroke-linecap="round"/></svg>';

const EXPORT_FACE =
  '<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M16 66C8 40 22 12 60 12s52 28 44 54c-3 10-12 14-44 14S19 76 16 66z" fill="#FDE67A"/><path d="M40 38l12 6-12 6M80 38L68 44l12 6M54 58h12" fill="none" stroke="#1d1a14" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function blankComponent(): ComponentDoc {
  return {
    id: '',
    name: '',
    status: 'Stable',
    description: '',
    do: '',
    dont: '',
    variants: [{ id: newId('v'), n: 'Par défaut', props: {}, code: '' }],
    origin: 'manual',
  };
}

function newVariant(): Variant {
  return { id: newId('v'), n: '', props: {}, code: '' };
}

function copyKeyFor(componentId: string, variantId: string): string {
  return `code-${componentId}-${variantId}`;
}

function cloneComponent(component: ComponentDoc): ComponentDoc {
  return JSON.parse(JSON.stringify(component)) as ComponentDoc;
}

function changeKey(change: FigmaChange): string {
  return `${change.category}:${change.name.toLowerCase()}:${change.variant?.toLowerCase() ?? ''}`;
}

function localImportFile(name: string) {
  return {
    key: IMPORT_FILE_KEY,
    name: name || 'variables.json',
    modified: 'fichier local importé',
  };
}

function TokenSample({ token }: { token: Token }) {
  if (token.type === 'spacing')
    return <i className="sp" style={{ width: token.value }} />;
  if (token.type === 'radius')
    return <i className="rd" style={{ borderRadius: token.value }} />;
  if (token.type === 'shadow')
    return (
      <span className="sw-wrap">
        <i className="sw" style={{ boxShadow: token.value }} />
      </span>
    );
  return <span style={{ font: font(token.value) }}>Aa Interface</span>;
}

export default function Studio() {
  const [tokens, setTokens] = useState<Token[]>(loadTokens);
  const [components, setComponents] = useState<ComponentDoc[]>(loadComponents);
  const [view, setView] = useState<View>('tokens');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [compId, setCompId] = useState<string | undefined>(
    () => loadComponents()[0]?.id,
  );
  const [varIdx, setVarIdx] = useState(0);
  const [delId, setDelId] = useState<string | null>(null);
  const [cedit, setCedit] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComponentDoc | null>(null);
  const [panelDeleteArmed, setPanelDeleteArmed] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [q, setQ] = useState('');
  const [vp, setVp] = useState<(typeof VIEWPORTS)[number]['width']>('100%');
  const [lt, setLt] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const copyTimer = useRef<number | null>(null);

  const [figma, setFigma] = useState<FigmaSession>(() =>
    initialFigmaSession(window.location.search),
  );
  const [figmaOpen, setFigmaOpen] = useState(false);
  const [figmaLink, setFigmaLink] = useState('');
  const [figmaLinkError, setFigmaLinkError] = useState('');
  const [figmaImportMeta, setFigmaImportMeta] =
    useState<FigmaImportMeta | null>(null);
  const [figmaImportNotice, setFigmaImportNotice] = useState<string | null>(
    null,
  );
  const [figmaImportError, setFigmaImportError] = useState<string | null>(null);
  const [figmaImportWarnings, setFigmaImportWarnings] = useState<string[]>([]);
  const [figmaImportBusy, setFigmaImportBusy] = useState(false);
  const [figmaPanel, setFigmaPanel] = useState(false);
  const [figmaChecked, setFigmaChecked] = useState<Set<string>>(
    () => new Set(),
  );
  const [figmaToast, setFigmaToast] = useState<{
    count: number;
    verb: 'synchronisé' | 'importé' | 'appliqué';
  } | null>(null);
  const [figmaMenuStyle, setFigmaMenuStyle] = useState<CSSProperties>({});
  const figmaPillRef = useRef<HTMLButtonElement>(null);
  const figmaMenuRef = useRef<HTMLDivElement>(null);
  const figmaPanelRef = useRef<HTMLElement>(null);
  const figmaCloseRef = useRef<HTMLButtonElement>(null);
  const figmaFileRef = useRef<HTMLInputElement>(null);
  const figmaToastTimer = useRef<number | null>(null);
  const [figmaDemo] = useState(() => isFigmaDemo(window.location.search));
  const [figmaConfigured, setFigmaConfigured] = useState(true);
  const [figmaWarnings, setFigmaWarnings] = useState<string[]>([]);
  const [figmaBusy, setFigmaBusy] = useState(false);

  useLayoutEffect(() => {
    applyVars(tokens);
  }, [tokens]);

  useEffect(() => {
    saveTokens(tokens);
  }, [tokens]);

  useEffect(() => {
    saveComponents(components);
  }, [components]);

  useEffect(() => {
    setSelected((current) => {
      if (!current.size) return current;
      const ids = new Set(components.map((component) => component.id));
      const next = new Set(
        [...current].filter((id) => ids.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [components]);

  useEffect(() => {
    if (figmaDemo) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const status = await getFigmaStatus(controller.signal);
        setFigmaConfigured(status.configured);
        setFigmaWarnings(status.warnings);
        setFigma((current) => serverFigmaSession(status, current));
        if (status.status !== 'connecte' || !status.file) return;
        const result = await getFigmaChanges(
          tokens,
          components,
          controller.signal,
        );
        setFigma((current) => ({
          ...current,
          file: result.file,
          changes: result.changes,
          lastSync: result.lastSync,
        }));
        setFigmaWarnings(result.warnings);
      } catch (error) {
        if (controller.signal.aborted) return;
        setFigmaWarnings([(error as Error).message]);
      }
    })();
    return () => controller.abort();
    // La synchronisation Figma est volontairement faite au montage ; les
    // changements suivants passent par les actions explicites de l’interface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figmaDemo]);

  useEffect(() => {
    document.body.dataset.v = view;
  }, [view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (cedit) closePanel();
      else if (bulkConfirm) setBulkConfirm(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cedit, bulkConfirm]);

  useEffect(() => {
    if (cedit) closeRef.current?.focus();
  }, [cedit]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      if (figmaToastTimer.current !== null)
        window.clearTimeout(figmaToastTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!figmaOpen) return;
    const place = () => {
      const pill = figmaPillRef.current;
      if (!pill) return;
      const rect = pill.getBoundingClientRect();
      const width = figmaMenuRef.current?.offsetWidth || 340;
      setFigmaMenuStyle({
        top: Math.round(rect.bottom + 8),
        right: Math.round(
          Math.max(
            8,
            Math.min(
              window.innerWidth - rect.right,
              window.innerWidth - width - 8,
            ),
          ),
        ),
      });
    };
    place();
    const menu = figmaMenuRef.current;
    const first = menu?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? menu)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setFigmaOpen(false);
      figmaPillRef.current?.focus();
    };
    const onClickOutside = (event: MouseEvent) => {
      const path = event.composedPath();
      if (figmaMenuRef.current && path.includes(figmaMenuRef.current)) return;
      if (figmaPillRef.current && path.includes(figmaPillRef.current)) return;
      setFigmaOpen(false);
      figmaPillRef.current?.focus();
    };

    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClickOutside);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClickOutside);
    };
  }, [figmaOpen]);

  useEffect(() => {
    if (!figmaOpen) return;
    const menu = figmaMenuRef.current;
    if (!menu || menu.contains(document.activeElement)) return;
    const first = menu.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? menu).focus();
  }, [figmaOpen, figma.status, figma.step]);

  useEffect(() => {
    if (!figmaPanel) return;
    figmaCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = figmaPanelRef.current;
      if (!panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setFigmaPanel(false);
        setFigmaChecked(new Set());
        figmaPillRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [figmaPanel]);

  function announceCopy(key: string) {
    setCopied(key);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1400);
  }

  function copy(text: string, key: string) {
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } catch {
        /* Le retour visuel reste honnête : le presse-papiers a refusé. */
      }
      area.remove();
      announceCopy(key);
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => announceCopy(key), fallback);
      } else fallback();
    } catch {
      fallback();
    }
  }

  function downloadTokens() {
    const data = JSON.stringify({ tokens }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'design-tokens.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function go(next: View) {
    setView(next);
    setOpenId(null);
    setAdding(false);
    setCedit(null);
    setDraft(null);
    setDelId(null);
    setPanelDeleteArmed(false);
    setFigmaOpen(false);
    setFigmaPanel(false);
    setFigmaChecked(new Set());
  }

  function closeFigmaMenu() {
    setFigmaOpen(false);
    figmaPillRef.current?.focus();
  }

  function toggleFigmaMenu() {
    if (figmaOpen) {
      closeFigmaMenu();
      return;
    }
    const pill = figmaPillRef.current;
    if (pill) {
      const rect = pill.getBoundingClientRect();
      setFigmaMenuStyle({
        top: Math.round(rect.bottom + 8),
        right: Math.round(
          Math.max(
            8,
            Math.min(window.innerWidth - rect.right, window.innerWidth - 348),
          ),
        ),
      });
    }
    setFigmaOpen(true);
  }

  async function authorizeFigma() {
    if (!figmaDemo) {
      setFigmaBusy(true);
      setFigmaWarnings([]);
      try {
        const { url } = await startFigmaAuthorization();
        window.location.assign(url);
      } catch (error) {
        setFigmaWarnings([(error as Error).message]);
      } finally {
        setFigmaBusy(false);
      }
      return;
    }
    setFigma((current) => {
      const imports = current.changes.filter(isImportedChange);
      return {
        status: 'connecte_sans_fichier',
        user: FIGMA_MOCK.user.name,
        file: imports.length
          ? localImportFile(figmaImportMeta?.name ?? 'variables.json')
          : null,
        changes: imports,
        selection: { ...ALL_CATEGORIES },
        lastSync: null,
        step: 'connect',
      };
    });
    setFigmaLink('');
    setFigmaLinkError('');
  }

  async function continueFigma(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = extractFigmaKey(figmaLink);
    if (!key) {
      setFigmaLinkError(
        'Ce lien ne pointe pas vers un fichier Figma. Copiez-le depuis Partager.',
      );
      return;
    }
    setFigmaLinkError('');
    if (!figmaDemo) {
      setFigmaBusy(true);
      setFigmaWarnings([]);
      try {
        const result = await selectFigmaFile(figmaLink, tokens, components);
        setFigmaConfigured(result.status.configured);
        setFigmaWarnings(result.warnings);
        setFigma((current) => ({
          ...current,
          status: result.status.status,
          user: result.status.user,
          file: result.file,
          changes: result.changes,
          lastSync: result.lastSync,
          step: 'content',
        }));
      } catch (error) {
        setFigmaLinkError((error as Error).message);
      } finally {
        setFigmaBusy(false);
      }
      return;
    }
    setFigma((current) => ({
      ...current,
      file: { ...FIGMA_MOCK.file, key },
      changes: [...FIGMA_MOCK.changes],
      step: 'content',
    }));
  }

  function toggleFigmaCategory(category: FigmaCategory) {
    setFigma((current) => ({
      ...current,
      selection: {
        ...current.selection,
        [category]: !current.selection[category],
      },
    }));
  }

  function finishFigmaContent() {
    setFigma((current) => {
      const imports = current.changes.filter(isImportedChange);
      const remote = selectedFigmaChanges(
        current.changes.filter((change) => !isImportedChange(change)),
        current.selection,
      );
      return {
        ...current,
        status: 'connecte',
        step: 'connect',
        changes: [...imports, ...remote],
        lastSync: Date.now(),
      };
    });
    setFigmaOpen(false);
    figmaPillRef.current?.focus();
  }

  async function disconnectFigma() {
    if (!figmaDemo) {
      setFigmaBusy(true);
      try {
        const status = await disconnectFigmaAccount();
        setFigmaConfigured(status.configured);
        setFigmaWarnings(status.warnings);
        setFigma((current) => {
          const imports = current.changes.filter(isImportedChange);
          return {
            ...serverFigmaSession(status, current),
            file: imports.length
              ? localImportFile(figmaImportMeta?.name ?? 'variables.json')
              : null,
            changes: imports,
            selection: { ...ALL_CATEGORIES },
            step: 'connect',
          };
        });
      } catch (error) {
        setFigmaWarnings([(error as Error).message]);
      } finally {
        setFigmaBusy(false);
      }
      return;
    }
    setFigma((current) => {
      const imports = current.changes.filter(isImportedChange);
      return {
        ...initialFigmaSession(''),
        changes: imports,
        selection: { ...ALL_CATEGORIES },
        file: imports.length
          ? localImportFile(figmaImportMeta?.name ?? 'variables.json')
          : null,
      };
    });
  }

  function reconnectFigma() {
    void authorizeFigma();
  }

  async function useOtherFigmaAccount() {
    if (!figmaDemo) {
      try {
        await disconnectFigmaAccount();
      } catch {
        /* La nouvelle autorisation remplacera de toute façon la session. */
      }
      await authorizeFigma();
      return;
    }
    setFigma((current) => {
      const imports = current.changes.filter(isImportedChange);
      return {
        ...initialFigmaSession(''),
        changes: imports,
        selection: { ...ALL_CATEGORIES },
        file: imports.length
          ? localImportFile(figmaImportMeta?.name ?? 'variables.json')
          : null,
      };
    });
  }

  function openFigmaImport() {
    setFigmaImportError(null);
    setFigmaImportNotice(null);
    figmaFileRef.current?.click();
  }

  async function importFigmaFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setFigmaImportError(null);
    setFigmaImportNotice(null);
    setFigmaImportWarnings([]);
    if (file.size > MAX_IMPORT_BYTES) {
      setFigmaImportError(
        `Le fichier dépasse la limite de ${Math.round(MAX_IMPORT_BYTES / 1024)} Ko.`,
      );
      return;
    }

    setFigmaImportBusy(true);
    try {
      const parsed = parseVariablesImport(await file.text());
      if (!parsed.ok) {
        setFigmaImportError(parsed.error);
        return;
      }
      const converted = importVariablesToChanges(
        parsed.data,
        tokens,
        components,
      );
      if (!converted.changes.length) {
        setFigmaImportNotice(
          `Aucun changement à appliquer : ${converted.unchanged} élément${converted.unchanged > 1 ? 's' : ''} déjà à jour.`,
        );
        setFigmaImportWarnings(converted.warnings);
        return;
      }

      const keys = new Set(converted.changes.map(changeKey));
      const importedIds = new Set(converted.changes.map((change) => change.id));
      setFigma((current) => {
        const changes = [
          ...current.changes.filter((change) => !keys.has(changeKey(change))),
          ...converted.changes,
        ];
        return {
          ...current,
          file:
            current.file && current.file.key !== IMPORT_FILE_KEY
              ? current.file
              : localImportFile(file.name),
          changes,
          selection: { ...ALL_CATEGORIES },
          step: 'connect',
        };
      });
      setFigmaImportMeta({
        name: file.name,
        count: converted.changes.length,
        variables: converted.variables,
        components: converted.components,
        warnings: converted.warnings,
      });
      setFigmaImportWarnings(converted.warnings);
      setFigmaChecked(importedIds);
      setFigmaOpen(false);
      setFigmaPanel(true);
    } catch {
      setFigmaImportError('Le fichier n’a pas pu être lu.');
    } finally {
      setFigmaImportBusy(false);
    }
  }

  function removeFigmaImport() {
    setFigma((current) => {
      const changes = current.changes.filter(
        (change) => !isImportedChange(change),
      );
      return {
        ...current,
        changes,
        file:
          current.file?.key === IMPORT_FILE_KEY && changes.length === 0
            ? null
            : current.file,
      };
    });
    setFigmaImportMeta(null);
    setFigmaImportError(null);
    setFigmaImportNotice(null);
    setFigmaImportWarnings([]);
    setFigmaPanel(false);
    setFigmaChecked(new Set());
  }

  function openFigmaPanel() {
    setFigmaChecked(new Set(figma.changes.map((change) => change.id)));
    setFigmaOpen(false);
    setFigmaPanel(true);
  }

  function closeFigmaPanel() {
    setFigmaPanel(false);
    setFigmaChecked(new Set());
    figmaPillRef.current?.focus();
  }

  function toggleFigmaChange(id: string) {
    setFigmaChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function dismissFigmaToast() {
    setFigmaToast(null);
    if (figmaToastTimer.current !== null) {
      window.clearTimeout(figmaToastTimer.current);
      figmaToastTimer.current = null;
    }
    try {
      localStorage.removeItem(UNDO_STORAGE_KEY);
    } catch {
      /* Stockage indisponible : l’instantané ne peut pas être conservé. */
    }
  }

  function applySelectedFigmaChanges() {
    const changes = selectedFigmaChanges(figma.changes, figma.selection).filter(
      (change) => figmaChecked.has(change.id),
    );
    if (!changes.length) return;

    const snapshot: FigmaUndoSnapshot = {
      tokens,
      components,
      changes: figma.changes,
      selection: figma.selection,
      lastSync: figma.lastSync,
      status: figma.status,
      file: figma.file,
      importMeta: figmaImportMeta,
    };
    try {
      localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* Stockage indisponible : l’application reste possible, l’annulation non. */
    }

    const next = applyFigmaChanges(tokens, components, changes);
    setTokens(next.tokens);
    setComponents(next.components);
    const remaining = figma.changes.filter(
      (change) => !changes.some((applied) => applied.id === change.id),
    );
    const remainingImports = remaining.some(isImportedChange);
    setFigma((current) => ({
      ...current,
      changes: remaining,
      file:
        current.file?.key === IMPORT_FILE_KEY && remaining.length === 0
          ? null
          : current.file,
      lastSync: Date.now(),
    }));
    if (!remainingImports) {
      setFigmaImportMeta(null);
      setFigmaImportNotice(null);
      setFigmaImportWarnings([]);
    } else {
      const remainingImportCount = remaining.filter(isImportedChange).length;
      setFigmaImportMeta((current) =>
        current ? { ...current, count: remainingImportCount } : current,
      );
    }
    const imported = changes.some(isImportedChange);
    const remote = changes.some((change) => !isImportedChange(change));
    setFigmaPanel(false);
    setFigmaChecked(new Set());
    setFigmaToast({
      count: changes.length,
      verb: remote ? (imported ? 'appliqué' : 'synchronisé') : 'importé',
    });
    if (figmaToastTimer.current !== null)
      window.clearTimeout(figmaToastTimer.current);
    figmaToastTimer.current = window.setTimeout(() => {
      setFigmaToast(null);
      figmaToastTimer.current = null;
      try {
        localStorage.removeItem(UNDO_STORAGE_KEY);
      } catch {
        /* Rien à nettoyer si le stockage est indisponible. */
      }
    }, 8000);
    figmaPillRef.current?.focus();
  }

  function undoFigmaApply() {
    let snapshot: FigmaUndoSnapshot | null = null;
    try {
      snapshot = parseUndoSnapshot(localStorage.getItem(UNDO_STORAGE_KEY));
    } catch {
      snapshot = null;
    }
    if (!snapshot) {
      dismissFigmaToast();
      figmaPillRef.current?.focus();
      return;
    }
    setTokens(snapshot.tokens);
    setComponents(snapshot.components);
    setFigma((current) => {
      const connected =
        current.status === 'connecte' ||
        current.status === 'connecte_sans_fichier';
      const changes = connected
        ? snapshot.changes
        : snapshot.changes.filter(isImportedChange);
      return {
        ...current,
        changes,
        selection: snapshot.selection,
        lastSync: snapshot.lastSync,
        file: connected
          ? (snapshot.file ?? current.file)
          : changes.length
            ? localImportFile(
                snapshot.importMeta?.name ??
                  current.file?.name ??
                  'variables.json',
              )
            : null,
      };
    });
    setFigmaImportMeta(snapshot.importMeta ?? null);
    setFigmaImportError(null);
    setFigmaImportNotice(null);
    setFigmaImportWarnings(snapshot.importMeta?.warnings ?? []);
    dismissFigmaToast();
    figmaPillRef.current?.focus();
  }

  function updateToken(id: string, patch: Partial<Token>) {
    setTokens((current) =>
      current.map((token) =>
        token.id === id ? { ...token, ...patch } : token,
      ),
    );
  }

  function toggleToken(id: string) {
    setDelId(null);
    setOpenId((current) => (current === id ? null : id));
  }

  function handleTokenDelete(id: string) {
    if (delId !== id) {
      setDelId(id);
      return;
    }
    setTokens((current) => current.filter((token) => token.id !== id));
    setOpenId(null);
    setDelId(null);
  }

  function addToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('n') ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    const value = String(data.get('v') ?? '').trim();
    const type = String(data.get('t') ?? 'color') as TokenType;
    if (!name || !value || !TYPE_KEYS.includes(type)) return;
    setTokens((current) => [
      ...current,
      {
        id: `t${Date.now()}`,
        name,
        type,
        value,
        description: '',
      },
    ]);
    setAdding(false);
    setFilter('all');
    form.reset();
  }

  function selectComponent(id: string) {
    setCompId(id);
    setVarIdx(0);
    setDelId(null);
  }

  function openNewComponent() {
    openerRef.current = document.activeElement as HTMLElement | null;
    setCedit('new');
    setDraft(blankComponent());
    setPanelDeleteArmed(false);
    setCopyNotice(null);
    setCopyBusy(false);
  }

  function openEditComponent(component: ComponentDoc) {
    openerRef.current = document.activeElement as HTMLElement | null;
    setCedit(component.id);
    setDraft(cloneComponent(component));
    setPanelDeleteArmed(false);
    setCopyNotice(null);
    setCopyBusy(false);
  }

  function closePanel() {
    setCedit(null);
    setDraft(null);
    setPanelDeleteArmed(false);
    setCopyNotice(null);
    setCopyBusy(false);
    openerRef.current?.focus();
    openerRef.current = null;
  }

  function deleteComponent(id: string) {
    const remaining = components.filter((component) => component.id !== id);
    setComponents(remaining);
    if (!remaining.some((component) => component.id === compId))
      setCompId(remaining[0]?.id);
    setDelId(null);
    if (cedit === id) closePanel();
  }

  function handleComponentDelete(id: string) {
    if (delId !== id) {
      setDelId(id);
      return;
    }
    deleteComponent(id);
  }

  function updateDraft(patch: Partial<ComponentDoc>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateVariant(
    index: number,
    patch: Partial<ComponentDoc['variants'][number]>,
  ) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        variants: current.variants.map((variant, i) =>
          i === index ? { ...variant, ...patch } : variant,
        ),
      };
    });
  }

  function markManual(field: ManualCopyField) {
    setDraft((current) =>
      current
        ? {
            ...current,
            manual: [...new Set([...(current.manual ?? []), field])],
          }
        : current,
    );
  }

  function updateDraftCopy(field: ManualCopyField, value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
            manual: [...new Set([...(current.manual ?? []), field])],
          }
        : current,
    );
  }

  function regenerateCopy() {
    if (!draft) return;
    setCopyBusy(true);
    setCopyNotice(null);
    window.setTimeout(() => {
      setDraft((current) => {
        if (!current) return current;
        try {
          const generated = generateComponentCopy(current);
          setCopyNotice('Textes régénérés. Ils restent modifiables.');
          return {
            ...current,
            description: generated.description,
            do: generated.do,
            dont: generated.dont,
            generated,
            manual: [],
          };
        } catch {
          setCopyNotice(
            'La génération a échoué : les champs restent modifiables.',
          );
          return current;
        }
      });
      setCopyBusy(false);
    }, 180);
  }

  function addVariant() {
    setDraft((current) =>
      current
        ? {
            ...current,
            variants: [...current.variants, newVariant()],
          }
        : current,
    );
  }

  function removeVariant(index: number) {
    setDraft((current) => {
      if (!current) return current;
      const variants = current.variants.filter((_, i) => i !== index);
      return {
        ...current,
        variants: variants.length ? variants : [newVariant()],
      };
    });
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.name.trim()) return;
    const cleaned: ComponentDoc = {
      ...draft,
      id: draft.id || newId('c'),
      name: draft.name.trim(),
      description: draft.description.trim(),
      do: draft.do.trim(),
      dont: draft.dont.trim(),
      origin: draft.origin ?? (draft.figma ? 'figma' : 'manual'),
      variants: draft.variants.map((variant) => ({
        id: variant.id || newId('v'),
        n:
          variant.n.trim() ||
          propsLabel(variant.props) ||
          'Variante',
        props: variant.props ?? {},
        code: variant.code.trim(),
        ...(variant.warnings?.length
          ? { warnings: [...variant.warnings] }
          : {}),
        ...(variant.codeEdited ? { codeEdited: true } : {}),
        ...(variant.figmaNodeId
          ? { figmaNodeId: variant.figmaNodeId }
          : {}),
      })),
    };
    if (!cleaned.variants.length) cleaned.variants = [newVariant()];
    if (!cleaned.manual?.length) delete cleaned.manual;

    try {
      const generated = generateComponentCopy(cleaned);
      if (!cleaned.description) cleaned.description = generated.description;
      if (!cleaned.do) cleaned.do = generated.do;
      if (!cleaned.dont) cleaned.dont = generated.dont;
      cleaned.generated = generated;
    } catch {
      // Champs vides éditables : la génération ne bloque jamais l’enregistrement.
    }

    setComponents((current) => {
      const exists = current.some((component) => component.id === cleaned.id);
      return exists
        ? current.map((component) =>
            component.id === cleaned.id ? cleaned : component,
          )
        : [...current, cleaned];
    });
    setCompId(cleaned.id);
    setVarIdx(0);
    closePanel();
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const component of visibleComponents) {
        if (checked) next.add(component.id);
        else next.delete(component.id);
      }
      return next;
    });
  }

  function deleteSelected() {
    const ids = new Set(selected);
    if (!ids.size) return;
    const remaining = components.filter((component) => !ids.has(component.id));
    setComponents(remaining);
    if (!remaining.some((component) => component.id === compId))
      setCompId(remaining[0]?.id);
    if (cedit && ids.has(cedit)) closePanel();
    setSelected(new Set());
    setBulkConfirm(false);
    setDelId(null);
  }

  function mergeImports() {
    setComponents((current) => mergeImportedComponents(current));
    setSelected(new Set());
  }

  function handlePanelDelete() {
    if (!draft) return;
    if (!panelDeleteArmed) {
      setPanelDeleteArmed(true);
      return;
    }
    deleteComponent(draft.id);
    closePanel();
  }

  const search = q.trim().toLowerCase();
  const filteredTokens = tokens.filter(
    (token) =>
      (filter === 'all' || token.type === filter) &&
      `${token.name} ${token.value} ${token.description}`
        .toLowerCase()
        .includes(search),
  );
  const visibleComponents = components.filter((component) => {
    const haystack = [
      component.name,
      component.description,
      component.do,
      component.dont,
      ...component.variants.map(
        (variant) =>
          `${variant.n} ${Object.entries(variant.props)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ')}`,
      ),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });
  const selectedVisible = visibleComponents.filter((component) =>
    selected.has(component.id),
  );
  const allVisibleSelected =
    visibleComponents.length > 0 &&
    selectedVisible.length === visibleComponents.length;
  const mergeGroups = mergeableImportGroups(components);
  const activeComponent =
    components.find((component) => component.id === compId) ?? components[0];
  const activeVariantIndex = activeComponent
    ? Math.max(0, Math.min(varIdx, activeComponent.variants.length - 1))
    : 0;
  const activeVariant = activeComponent?.variants[activeVariantIndex];
  const activeProperties = activeComponent
    ? Object.entries(
        activeComponent.variants.reduce(
          (properties, variant) => {
            for (const [key, value] of Object.entries(variant.props)) {
              const values = properties[key] ?? [];
              if (!values.includes(value)) values.push(value);
              properties[key] = values;
            }
            return properties;
          },
          {} as Record<string, string[]>,
        ),
      )
    : [];
  const json = JSON.stringify({ tokens }, null, 2);
  const figmaCounts = countFigmaChanges(figma.changes);
  const figmaPending = figma.changes.length;
  const figmaImportCount = figma.changes.filter(isImportedChange).length;
  const figmaConnected =
    figma.status === 'connecte' || figma.status === 'connecte_sans_fichier';
  const figmaDot =
    figma.status === 'erreur_autorisation'
      ? 'err'
      : figmaConnected
        ? 'ok'
        : figmaImportCount > 0
          ? 'warn'
          : 'err';
  const figmaLabel =
    figma.status === 'erreur_autorisation'
      ? 'Figma, autorisation expirée'
      : figma.status === 'connecte_sans_fichier'
        ? figmaPending > 0
          ? `Figma, ${figmaPending} changement${figmaPending > 1 ? 's' : ''} importé${figmaPending > 1 ? 's' : ''} en attente`
          : 'Figma, connecté, aucun fichier sélectionné'
        : figma.status === 'connecte'
          ? figmaPending > 0
            ? `Figma, ${figmaPending} changement${figmaPending > 1 ? 's' : ''} en attente`
            : 'Figma, connecté, aucun changement'
          : figmaImportCount > 0
            ? `Figma, ${figmaImportCount} changement${figmaImportCount > 1 ? 's' : ''} importé${figmaImportCount > 1 ? 's' : ''} en attente`
            : 'Figma, non connecté';
  const figmaImportNote = figmaImportMeta
    ? `${figmaImportMeta.count} changement${figmaImportMeta.count > 1 ? 's' : ''} importé${figmaImportMeta.count > 1 ? 's' : ''} depuis ${figmaImportMeta.name}.`
    : figmaImportNotice;
  const figmaPanelHasImport = figma.changes.some(isImportedChange);
  const figmaPanelHasRemote = figma.changes.some(
    (change) => !isImportedChange(change),
  );
  const figmaPanelTitle = figmaPanelHasImport
    ? figmaPanelHasRemote
      ? 'Changements à appliquer'
      : 'Import de variables'
    : undefined;

  function tokenRow(token: Token) {
    const open = openId === token.id;
    const copyKey = `token-${token.id}`;
    const heading =
      token.type === 'color' ? (
        <button
          type="button"
          className="band"
          style={{ background: token.value, color: ink(token.value) }}
          onClick={() => toggleToken(token.id)}
          aria-expanded={open}
        >
          <b>{token.name}</b>
          <span>{token.value}</span>
        </button>
      ) : (
        <button
          type="button"
          className="line"
          onClick={() => toggleToken(token.id)}
          aria-expanded={open}
        >
          <b>{token.name}</b>
          <span className="smp">
            <TokenSample token={token} />
          </span>
          <span className="val">{token.value}</span>
        </button>
      );

    return (
      <Fragment key={token.id}>
        {heading}
        {open && (
          <>
            <form
              className="edit"
              onSubmit={(event) => {
                event.preventDefault();
                setOpenId(null);
                setDelId(null);
              }}
            >
              <input
                name="v"
                value={token.value}
                aria-label={`Valeur de ${token.name}`}
                onChange={(event) =>
                  updateToken(token.id, { value: event.target.value })
                }
              />
              <button className="pri" type="submit">
                Enregistrer
              </button>
              <button
                type="button"
                className="sec"
                onClick={() => copy(`var(--${token.name})`, copyKey)}
              >
                {copied === copyKey ? 'Copié' : `Copier var(--${token.name})`}
              </button>
              <button
                type="button"
                className={`sec${delId === token.id ? ' dng' : ''}`}
                onClick={() => handleTokenDelete(token.id)}
              >
                {delId === token.id ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            </form>
            <p className="desc">{token.description}</p>
          </>
        )}
      </Fragment>
    );
  }

  function renderTokens() {
    const groups = filter === 'all' ? TYPE_KEYS : [filter];
    return (
      <>
        <div className="head">
          <div>
            <h1>Tokens</h1>
            <p className="sub">
              {tokens.length} valeurs partagées entre le design et le code.
            </p>
          </div>
          <button
            className="cta"
            type="button"
            onClick={() => {
              setAdding((current) => !current);
              setOpenId(null);
            }}
          >
            + Nouveau token
          </button>
        </div>
        {adding && (
          <form className="new" onSubmit={addToken}>
            <input
              name="n"
              placeholder="color-accent-400"
              aria-label="Nom du token"
              required
            />
            <select name="t" aria-label="Type">
              {TYPE_KEYS.map((type) => (
                <option value={type} key={type}>
                  {TYPES[type]}
                </option>
              ))}
            </select>
            <input
              name="v"
              placeholder="Valeur, par exemple #14b8a6"
              aria-label="Valeur"
              required
            />
            <button className="pri" type="submit">
              Ajouter le token
            </button>
          </form>
        )}
        <div className="flt" role="group" aria-label="Filtrer par type">
          {(['all', ...TYPE_KEYS] as Filter[]).map((type) => {
            const count =
              type === 'all'
                ? tokens.length
                : tokens.filter((token) => token.type === type).length;
            return (
              <button
                key={type}
                type="button"
                className={filter === type ? 'on' : ''}
                onClick={() => setFilter(type)}
                aria-pressed={filter === type}
              >
                {type === 'all' ? 'Tous' : TYPES[type]}
                <small>{count}</small>
              </button>
            );
          })}
        </div>
        {filteredTokens.length ? (
          groups.map((type) => {
            const group = filteredTokens.filter((token) => token.type === type);
            if (!group.length) return null;
            return (
              <section className="tgroup" key={type}>
                {filter === 'all' && <h3 className="g">{TYPES[type]}</h3>}
                {group.map(tokenRow)}
              </section>
            );
          })
        ) : (
          <p className="sub">Aucun token trouvé.</p>
        )}
      </>
    );
  }

  function renderComponents() {
    return (
      <>
        <div className="head">
          <div>
            <h1>Composants</h1>
            <p className="sub">
              {components.length} composants documentés. Leur rendu suit vos
              tokens.
            </p>
          </div>
          <button className="cta" type="button" onClick={openNewComponent}>
            + Nouveau composant
          </button>
        </div>
        {mergeGroups.length > 0 && (
          <div className="notice import-merge" role="status">
            <span>
              {mergeGroups.length} groupe
              {mergeGroups.length > 1 ? 's' : ''} d’anciens imports semble
              {mergeGroups.length > 1 ? 'nt' : ''} éclaté
              {mergeGroups.length > 1 ? 's' : ''} par variante.
            </span>
            <button className="sec" type="button" onClick={mergeImports}>
              Fusionner les doublons
            </button>
          </div>
        )}
        {selected.size > 0 && (
          <div
            className="bulkbar"
            role="region"
            aria-label="Actions sur la sélection"
          >
            <span>
              {selected.size} composant{selected.size > 1 ? 's' : ''}{' '}
              sélectionné{selected.size > 1 ? 's' : ''}
            </span>
            <div className="acts">
              <button
                className="sec"
                type="button"
                onClick={() => setSelected(new Set())}
              >
                Tout désélectionner
              </button>
              <button
                className="sec dng"
                type="button"
                onClick={() => setBulkConfirm(true)}
              >
                Supprimer
              </button>
            </div>
          </div>
        )}
        <div className="cgrid">
          <div className="clist-wrap">
            <div className="clist-head">
              <label className="sel-all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(element) => {
                    if (element)
                      element.indeterminate =
                        selectedVisible.length > 0 && !allVisibleSelected;
                  }}
                  onChange={(event) =>
                    toggleSelectAllVisible(event.target.checked)
                  }
                  aria-label="Tout sélectionner"
                />
                <span>Tout sélectionner</span>
              </label>
              <small>{visibleComponents.length}</small>
            </div>
            <nav className="clist" aria-label="Composants">
              {visibleComponents.length ? (
                visibleComponents.map((component) => (
                  <div className="crow" key={component.id}>
                    <input
                      type="checkbox"
                      className="ci-check"
                      checked={selected.has(component.id)}
                      onChange={() => toggleSelected(component.id)}
                      aria-label={`Sélectionner ${component.name}`}
                    />
                    <button
                      type="button"
                      className={`ci${
                        component.id === activeComponent?.id ? ' on' : ''
                      }`}
                      onClick={() => selectComponent(component.id)}
                    >
                      <span>{component.name}</span>
                      <small
                        className="ci-count"
                        aria-label={`${component.variants.length} variante${
                          component.variants.length > 1 ? 's' : ''
                        }`}
                      >
                        {component.variants.length}
                      </small>
                    </button>
                  </div>
                ))
              ) : (
                <p className="sub">Aucun résultat.</p>
              )}
            </nav>
          </div>
          <div className="cdoc">
            {activeComponent ? (
              <>
                <div className="head comp-head">
                  <h2>{activeComponent.name}</h2>
                  <div className="acts">
                    <button
                      className="sec"
                      type="button"
                      onClick={() => openEditComponent(activeComponent)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className={`sec${
                        delId === activeComponent.id ? ' dng' : ''
                      }`}
                      onClick={() => handleComponentDelete(activeComponent.id)}
                    >
                      {delId === activeComponent.id
                        ? 'Confirmer la suppression'
                        : 'Supprimer'}
                    </button>
                  </div>
                </div>
                <p className="sub comp-desc">
                  {activeComponent.description ||
                    'Description à compléter : ouvrez Modifier ou utilisez Régénérer.'}
                </p>
                {activeComponent.figma && (
                  <p className="meta">
                    Synchronisé depuis Figma ·{' '}
                    {activeComponent.figma.setId
                      ? 'component set'
                      : 'composant isolé'}
                  </p>
                )}
                <div className="two">
                  <div className="fc">
                    <div
                      className="fc-icon"
                      dangerouslySetInnerHTML={{ __html: FACE.ok }}
                    />
                    <div>
                      <h3>À faire</h3>
                      <p>
                        {activeComponent.do ||
                          'Aucune règle pour l’instant. Ouvrez Modifier pour en ajouter.'}
                      </p>
                    </div>
                  </div>
                  <div className="fc no">
                    <div
                      className="fc-icon"
                      dangerouslySetInnerHTML={{ __html: FACE.no }}
                    />
                    <div>
                      <h3>À éviter</h3>
                      <p>
                        {activeComponent.dont ||
                          'Aucune règle pour l’instant. Ouvrez Modifier pour en ajouter.'}
                      </p>
                    </div>
                  </div>
                </div>
                {activeProperties.length > 0 && (
                  <div
                    className="propsum"
                    aria-label="Propriétés des variantes"
                  >
                    {activeProperties.map(([key, values]) => (
                      <span className="prop" key={key}>
                        <b>{key}</b>
                        <span>{values.join(' · ')}</span>
                      </span>
                    ))}
                  </div>
                )}
                <h3 className="g">
                  {activeComponent.variants.length} variante
                  {activeComponent.variants.length > 1 ? 's' : ''}
                </h3>
                <div className="vgrid">
                  {activeComponent.variants.map((variant, index) => {
                    const properties = Object.entries(variant.props);
                    return (
                      <div
                        className={`vt${
                          index === activeVariantIndex ? ' on' : ''
                        }`}
                        key={variant.id}
                      >
                        {variant.code ? (
                          <div
                            className="vp"
                            inert
                            dangerouslySetInnerHTML={{
                              __html: variant.code,
                            }}
                          />
                        ) : (
                          <div className="vp vp-empty">
                            <span>Aperçu indisponible</span>
                          </div>
                        )}
                        {properties.length > 0 && (
                          <div className="vprops">
                            {properties.map(([key, value]) => (
                              <span key={key}>
                                <b>{key}</b>
                                {value}
                              </span>
                            ))}
                          </div>
                        )}
                        <button
                          className="vl"
                          type="button"
                          aria-pressed={index === activeVariantIndex}
                          onClick={() => setVarIdx(index)}
                        >
                          {variant.n || 'Sans nom'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {activeVariant && (
                  <>
                    {activeVariant.warnings?.length ? (
                      <ul className="vnotes" aria-label="Limites de l’aperçu">
                        {activeVariant.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="code">
                      <button
                        className="cp"
                        type="button"
                        disabled={!activeVariant.code}
                        onClick={() =>
                          copy(
                            activeVariant.code,
                            copyKeyFor(
                              activeComponent.id,
                              activeVariant.id,
                            ),
                          )
                        }
                      >
                        {copied ===
                        copyKeyFor(activeComponent.id, activeVariant.id)
                          ? 'Copié'
                          : 'Copier'}
                      </button>
                      <pre>
                        {activeVariant.code ||
                          'Aucun code disponible pour cette variante. Ouvrez Modifier pour le compléter.'}
                      </pre>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="sub">Aucun composant. Ajoutez-en un.</p>
            )}
          </div>
        </div>
      </>
    );
  }

  function renderPreview() {
    return (
      <>
        <div className="head">
          <div>
            <h1>Aperçu</h1>
            <p className="sub">
              Vos tokens appliqués à une interface réelle, en direct.
            </p>
          </div>
          <button
            className="cta"
            type="button"
            onClick={() => setLt((current) => !current)}
          >
            {lt ? 'Mode sombre' : 'Mode clair'}
          </button>
        </div>
        <div className="flt" role="group" aria-label="Largeur de l’aperçu">
          {VIEWPORTS.map((viewport) => (
            <button
              key={viewport.width}
              type="button"
              className={vp === viewport.width ? 'on' : ''}
              onClick={() => setVp(viewport.width)}
              aria-pressed={vp === viewport.width}
            >
              {viewport.label}
            </button>
          ))}
        </div>
        <div className="frame" style={{ '--w': vp } as CSSProperties}>
          <div className={`stage${lt ? ' lt' : ''}`}>
            <h3>Créneau confirmé</h3>
            <p>Jeudi à 14 h, salle Pasteur. Un rappel part la veille.</p>
            <input placeholder="vous@exemple.fr" aria-label="Adresse e-mail" />
            <div className="btns">
              <button className="b p" type="button">
                Confirmer
              </button>
              <button className="b s" type="button">
                Modifier
              </button>
              <button className="b d" type="button">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="shell">
        <aside className="side">
          <div className="logo">
            <div
              className="logo-mark"
              dangerouslySetInnerHTML={{ __html: LOGO }}
            />
            Studio
          </div>
          <nav className="nav" aria-label="Sections">
            <button
              type="button"
              className={view === 'tokens' ? 'on' : ''}
              data-v="tokens"
              aria-current={view === 'tokens' ? 'page' : undefined}
              onClick={() => go('tokens')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="9" r="5" />
                <circle cx="15" cy="15" r="5" />
              </svg>
              Tokens
            </button>
            <button
              type="button"
              className={view === 'comp' ? 'on' : ''}
              data-v="comp"
              aria-current={view === 'comp' ? 'page' : undefined}
              onClick={() => go('comp')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />
              </svg>
              Composants
            </button>
            <button
              type="button"
              className={view === 'prev' ? 'on' : ''}
              data-v="prev"
              aria-current={view === 'prev' ? 'page' : undefined}
              onClick={() => go('prev')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="7" y="3" width="10" height="18" rx="2" />
                <path d="M11 18h2" />
              </svg>
              Aperçu
            </button>
          </nav>
          <div className="promo">
            <div className="promo-head">
              <div
                className="promo-face"
                dangerouslySetInnerHTML={{ __html: EXPORT_FACE }}
              />
              <b>Exporter les tokens</b>
            </div>
            <p>Au format JSON, pour votre code.</p>
            <div className="exp">
              <button
                className="yel"
                type="button"
                onClick={() => copy(json, 'json')}
              >
                {copied === 'json' ? 'Copié' : 'Copier'}
              </button>
              <button className="sec" type="button" onClick={downloadTokens}>
                Télécharger
              </button>
            </div>
          </div>
        </aside>
        <main className="card">
          <div className="top">
            <label className="srch">
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input
                id="q"
                type="search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Rechercher…"
                aria-label="Rechercher"
              />
            </label>
            <div className="figma-wrap">
              <button
                ref={figmaPillRef}
                className={`figma-pill${figmaOpen ? ' on' : ''}`}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={figmaOpen}
                aria-controls={figmaOpen ? 'figma-menu' : undefined}
                aria-label={figmaLabel}
                onClick={toggleFigmaMenu}
              >
                <FigmaGlyph size={24} />
                <span className="figma-label">Figma</span>
                <span className={`figma-dot ${figmaDot}`} aria-hidden="true" />
                {figmaPending > 0 && (
                  <span className="figma-badge">{figmaPending}</span>
                )}
              </button>
            </div>
            <div className="who">
              <span>Studio v2.4</span>
              <div className="av">DS</div>
            </div>
          </div>
          {view === 'tokens' && renderTokens()}
          {view === 'comp' && renderComponents()}
          {view === 'prev' && renderPreview()}
        </main>
      </div>
      {figmaOpen && (
        <FigmaMenu
          status={figma.status}
          configured={figmaConfigured}
          busy={figmaBusy}
          warnings={figmaWarnings}
          step={figma.step}
          user={figma.user}
          file={figma.file}
          selection={figma.selection}
          counts={figmaCounts}
          changeCount={figmaPending}
          lastSync={figma.lastSync}
          link={figmaLink}
          linkError={figmaLinkError}
          importNote={figmaImportNote}
          importError={figmaImportError}
          importWarnings={figmaImportWarnings}
          importPending={figmaImportCount}
          importBusy={figmaImportBusy}
          menuRef={figmaMenuRef}
          style={figmaMenuStyle}
          onLinkChange={(value) => {
            setFigmaLink(value);
            if (figmaLinkError) setFigmaLinkError('');
          }}
          onContinue={continueFigma}
          onToggleCategory={toggleFigmaCategory}
          onFinish={finishFigmaContent}
          onAuthorize={authorizeFigma}
          onOpenPanel={openFigmaPanel}
          onDisconnect={disconnectFigma}
          onReconnect={reconnectFigma}
          onOtherAccount={useOtherFigmaAccount}
          onImport={openFigmaImport}
          onRemoveImport={removeFigmaImport}
        />
      )}
      {figmaPanel && figma.file && (
        <>
          <div className="scrim" onClick={closeFigmaPanel} />
          <FigmaPanel
            file={figma.file}
            changes={figma.changes}
            checked={figmaChecked}
            title={figmaPanelTitle}
            panelRef={figmaPanelRef}
            closeRef={figmaCloseRef}
            onToggle={toggleFigmaChange}
            onClose={closeFigmaPanel}
            onApply={applySelectedFigmaChanges}
          />
        </>
      )}
      {figmaToast !== null && (
        <FigmaToast
          count={figmaToast.count}
          verb={figmaToast.verb}
          onUndo={undoFigmaApply}
        />
      )}
      <input
        ref={figmaFileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={importFigmaFile}
      />
      {bulkConfirm && selected.size > 0 && (
        <>
          <div className="scrim" onClick={() => setBulkConfirm(false)} />
          <aside
            className="panel confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
          >
            <div className="ph">
              <h2 id="bulk-delete-title">
                Supprimer {selected.size} composant
                {selected.size > 1 ? 's' : ''} ?
              </h2>
              <button
                className="x"
                type="button"
                onClick={() => setBulkConfirm(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="confirm-body">
              <p>
                Cette action retire {selected.size} composant
                {selected.size > 1 ? 's' : ''} de la bibliothèque. Les tokens
                et les autres composants ne sont pas modifiés.
              </p>
              <div className="pf">
                <button
                  className="sec"
                  type="button"
                  onClick={() => setBulkConfirm(false)}
                  autoFocus
                >
                  Annuler
                </button>
                <button
                  className="pri dng"
                  type="button"
                  onClick={deleteSelected}
                >
                  Supprimer {selected.size}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
      {cedit && draft && (
        <>
          <div className="scrim" onClick={closePanel} />
          <aside
            className="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Composant"
          >
            <div className="ph">
              <h2>
                {cedit === 'new'
                  ? 'Nouveau composant'
                  : 'Modifier le composant'}
              </h2>
              <button
                ref={closeRef}
                className="x"
                type="button"
                onClick={closePanel}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <form className="cf" onSubmit={saveDraft}>
              <label className="lb">
                Nom
                <input
                  name="name"
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ name: event.target.value })
                  }
                  required
                />
              </label>
              {(
                [
                  ['description', 'Description'],
                  ['do', 'À faire'],
                  ['dont', 'À éviter'],
                ] as const
              ).map(([key, label]) => (
                <label className="lb" key={key}>
                  <span className="lb-row">
                    {label}
                    {draft.manual?.includes(key) && (
                      <small className="manual-tag">modifié à la main</small>
                    )}
                  </span>
                  <textarea
                    name={key}
                    rows={key === 'description' ? 3 : 3}
                    aria-label={label}
                    value={draft[key]}
                    onChange={(event) =>
                      updateDraftCopy(key, event.target.value)
                    }
                  />
                </label>
              ))}
              <div className="gen-row">
                <button
                  type="button"
                  className="sec"
                  onClick={regenerateCopy}
                  disabled={copyBusy}
                >
                  {copyBusy ? 'Génération…' : 'Régénérer les textes'}
                </button>
                <small>
                  Remplit la description, « À faire » et « À éviter » à partir
                  du nom et des variantes.
                </small>
              </div>
              {copyNotice && (
                <p className="fm-import" role="status">
                  {copyNotice}
                </p>
              )}
              <div className="lb">Variantes</div>
              {draft.variants.map((variant, index) => (
                <div className="vr" key={variant.id || index}>
                  <input
                    name="vn"
                    value={variant.n}
                    placeholder="Nom de la variante"
                    aria-label={`Nom de la variante ${index + 1}`}
                    onChange={(event) =>
                      updateVariant(index, { n: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="sec"
                    onClick={() => removeVariant(index)}
                    aria-label={`Retirer la variante ${index + 1}`}
                  >
                    ×
                  </button>
                  {Object.keys(variant.props).length > 0 && (
                    <div className="vprops edit-props">
                      {Object.entries(variant.props).map(([key, value]) => (
                        <span key={key}>
                          <b>{key}</b>
                          {value}
                        </span>
                      ))}
                    </div>
                  )}
                  {variant.warnings?.length ? (
                    <ul className="vnotes">
                      {variant.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                  <textarea
                    name="vc"
                    rows={4}
                    value={variant.code}
                    aria-label={`Code HTML de la variante ${index + 1}`}
                    onChange={(event) =>
                      updateVariant(index, {
                        code: event.target.value,
                        codeEdited: true,
                      })
                    }
                  />
                  {variant.codeEdited && (
                    <small className="manual-tag">
                      Code modifié : préservé au prochain import.
                    </small>
                  )}
                </div>
              ))}
              <button type="button" className="sec" onClick={addVariant}>
                + Ajouter une variante
              </button>
              <div className="pf">
                <button className="pri" type="submit">
                  Enregistrer
                </button>
                <button type="button" className="sec" onClick={closePanel}>
                  Annuler
                </button>
                {cedit !== 'new' && (
                  <button
                    type="button"
                    className={`sec${panelDeleteArmed ? ' dng' : ''}`}
                    onClick={handlePanelDelete}
                  >
                    {panelDeleteArmed
                      ? 'Confirmer la suppression'
                      : 'Supprimer'}
                  </button>
                )}
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  );
}
