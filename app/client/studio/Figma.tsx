import type { CSSProperties, FormEvent, RefObject } from 'react';
import {
  relativeTime,
  type FigmaCategory,
  type FigmaChange,
  type FigmaFile,
  type FigmaSelection,
  type FigmaStatus,
} from './figmaMock.js';

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export function FigmaGlyph({ size = 24 }: { size?: number }) {
  return (
    <span
      className="figma-icon"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden="true"
    >
      F
    </span>
  );
}

interface FigmaMenuProps {
  status: FigmaStatus;
  configured: boolean;
  busy: boolean;
  warnings: string[];
  step: 'connect' | 'content';
  user: string | null;
  file: FigmaFile | null;
  selection: FigmaSelection;
  counts: Record<FigmaCategory, number>;
  changeCount: number;
  lastSync: number | null;
  link: string;
  linkError: string;
  importNote: string | null;
  importError: string | null;
  importWarnings: string[];
  importPending: number;
  importBusy: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  onLinkChange: (value: string) => void;
  onContinue: (event: FormEvent<HTMLFormElement>) => void;
  onToggleCategory: (category: FigmaCategory) => void;
  onFinish: () => void;
  onAuthorize: () => void;
  onOpenPanel: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onOtherAccount: () => void;
  onImport: () => void;
  onRemoveImport: () => void;
}

const CATEGORY_ROWS: Array<[FigmaCategory, string]> = [
  ['color', 'Styles de couleur'],
  ['spacing', 'Variables d’espacement'],
  ['typography', 'Styles de texte'],
  ['radius', 'Variables d’arrondi'],
  ['shadow', 'Effets (ombres)'],
  ['component', 'Composants'],
];

const ALWAYS_VISIBLE = new Set<FigmaCategory>([
  'color',
  'typography',
  'shadow',
  'component',
]);

function CheckboxRow({
  category,
  label,
  count,
  checked,
  onToggle,
}: {
  category: FigmaCategory;
  label: string;
  count: number;
  checked: boolean;
  onToggle: (category: FigmaCategory) => void;
}) {
  return (
    <label className="fm-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(category)}
      />
      <span>{label}</span>
      <span className="fm-count">· {count}</span>
    </label>
  );
}

export function FigmaMenu({
  status,
  configured,
  busy,
  warnings,
  step,
  user,
  file,
  selection,
  counts,
  changeCount,
  lastSync,
  link,
  linkError,
  importNote,
  importError,
  importWarnings,
  importPending,
  importBusy,
  menuRef,
  style,
  onLinkChange,
  onContinue,
  onToggleCategory,
  onFinish,
  onAuthorize,
  onOpenPanel,
  onDisconnect,
  onReconnect,
  onOtherAccount,
  onImport,
  onRemoveImport,
}: FigmaMenuProps) {
  const totalChecked = (
    ['color', 'spacing', 'typography', 'radius', 'shadow', 'component'] as const
  ).reduce(
    (total, category) => total + (selection[category] ? counts[category] : 0),
    0,
  );
  const remotePending = Math.max(0, changeCount - importPending);
  const rows = CATEGORY_ROWS.filter(
    ([category]) => ALWAYS_VISIBLE.has(category) || counts[category] > 0,
  );

  return (
    <div
      id="figma-menu"
      ref={menuRef}
      className="figma-menu"
      style={style}
      role="dialog"
      aria-label="Figma"
      aria-busy={busy}
      tabIndex={-1}
    >
      {warnings.length > 0 && (
        <div className="fm-warnings" role="status">
          {warnings.slice(0, 4).map((warning) => (
            <p className="fm-warning" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      )}
      {status === 'deconnecte' && !configured && (
        <>
          <h2>Figma non configuré</h2>
          <p className="fm-text">
            Ce serveur local n’a pas d’application OAuth Figma. Ajoutez
            <code> FIGMA_CLIENT_ID</code> et <code>FIGMA_CLIENT_SECRET</code>,
            puis redémarrez DS-Studio.
          </p>
          <p className="fm-note">
            Le mode manuel reste disponible : aucun compte Figma n’est requis.
          </p>
        </>
      )}
      {status === 'deconnecte' && configured && (
        <>
          <h2>Connecter Figma</h2>
          <p className="fm-text">
            Synchronisez vos tokens et vos composants depuis votre fichier
            Figma. Accès en lecture seule.
          </p>
          <button
            className="pri fm-wide"
            type="button"
            onClick={onAuthorize}
            disabled={busy}
          >
            <FigmaGlyph size={18} />
            {busy ? 'Ouverture de Figma…' : 'Autoriser avec Figma'}
          </button>
          <p className="fm-note">
            Vous serez redirigé vers figma.com, puis ramené ici.
          </p>
        </>
      )}

      {status === 'connecte_sans_fichier' && step === 'connect' && (
        <>
          <h2>Connecté à Figma</h2>
          <p className="fm-user">
            <span className="figma-dot ok" aria-hidden="true" />
            {user ?? 'Compte Figma'}
          </p>
          <form className="fm-form" onSubmit={onContinue}>
            <label className="lb fm-field">
              Lien du fichier Figma
              <input
                value={link}
                onChange={(event) => onLinkChange(event.target.value)}
                placeholder="https://www.figma.com/design/…"
                disabled={busy}
                aria-invalid={linkError ? true : undefined}
                aria-describedby={
                  linkError
                    ? 'figma-link-error figma-link-help'
                    : 'figma-link-help'
                }
              />
            </label>
            {linkError && (
              <p className="fm-error" id="figma-link-error" role="alert">
                {linkError}
              </p>
            )}
            <p className="fm-help" id="figma-link-help">
              Dans Figma, ouvrez le fichier puis copiez son lien depuis
              Partager.
            </p>
            <button className="pri fm-wide" type="submit" disabled={busy}>
              {busy ? 'Lecture du fichier…' : 'Continuer'}
            </button>
          </form>
        </>
      )}

      {step === 'content' && file && (
        <>
          <h2>Choisir le contenu</h2>
          <p className="fm-file-name">{file?.name ?? 'Fichier Figma'}</p>
          <p className="fm-meta">{file?.modified ?? 'modifié récemment'}</p>
          <div
            className="fm-checks"
            role="group"
            aria-label="Contenu à importer"
          >
            {rows.map(([category, label]) => (
              <CheckboxRow
                key={category}
                category={category}
                label={label}
                count={counts[category]}
                checked={selection[category]}
                onToggle={onToggleCategory}
              />
            ))}
          </div>
          <div className="fm-notebox">
            <p>
              Les styles REST ne couvrent pas les variables d’espacement et
              d’arrondi. Importez le JSON du plugin pour les ajouter.
            </p>
          </div>
          <button
            className="pri fm-wide"
            type="button"
            onClick={onFinish}
            disabled={busy || totalChecked === 0}
          >
            {busy ? 'Synchronisation…' : 'Terminer'}
          </button>
        </>
      )}

      {status === 'connecte' && step === 'connect' && (
        <>
          <div className="fm-connected">
            <span className="figma-dot ok" aria-hidden="true" />
            <div>
              <p className="fm-file-name">{file?.name ?? 'Fichier Figma'}</p>
              <p className="fm-meta">
                Dernière synchro : {relativeTime(lastSync)}
              </p>
            </div>
          </div>
          {remotePending > 0 ? (
            <p className="fm-alert amber">
              {remotePending} changement{plural(remotePending, '', 's')} détecté
              {plural(remotePending, '', 's')} dans Figma
            </p>
          ) : (
            importPending > 0 && (
              <p className="fm-alert amber">
                {importPending} changement{plural(importPending, '', 's')}{' '}
                importé{plural(importPending, '', 's')} en attente
              </p>
            )
          )}
          <button
            className="pri fm-wide"
            type="button"
            onClick={onOpenPanel}
            disabled={busy || changeCount === 0}
          >
            {remotePending > 0 ? 'Mettre à jour' : 'Vérifier l’import'}
          </button>
          <div className="fm-links">
            <button className="link" type="button" onClick={onDisconnect}>
              Déconnecter
            </button>
          </div>
        </>
      )}

      {status === 'erreur_autorisation' && (
        <>
          <h2>Autorisation Figma</h2>
          <p className="fm-alert danger" role="alert">
            Votre autorisation Figma a expiré ou a été révoquée.
            Reconnectez-vous pour continuer.
          </p>
          <button
            className="pri fm-wide"
            type="button"
            onClick={onReconnect}
            disabled={busy}
          >
            {busy ? 'Ouverture de Figma…' : 'Reconnecter avec Figma'}
          </button>
          <div className="fm-links">
            <button className="link" type="button" onClick={onOtherAccount}>
              Utiliser un autre compte
            </button>
          </div>
        </>
      )}

      {importPending > 0 && status !== 'connecte' && step !== 'content' && (
        <div className="fm-notebox fm-pending">
          <p>
            {importPending} changement{plural(importPending, '', 's')} importé
            {plural(importPending, '', 's')}{' '}
            {plural(importPending, 'est', 'sont')} prêt
            {plural(importPending, '', 's')} à être appliqué
            {plural(importPending, '', 's')}.
          </p>
          <button className="pri fm-wide" type="button" onClick={onOpenPanel}>
            Vérifier l’import
          </button>
        </div>
      )}

      <div className="fm-import-zone">
        <p className="fm-note">
          Plugin Figma optionnel : exportez les variables locales en JSON, puis
          importez-les ici. Aucun accès réseau n’est nécessaire.
        </p>
        <button
          className="link"
          type="button"
          onClick={onImport}
          disabled={busy || importBusy}
        >
          {importBusy
            ? 'Lecture du fichier…'
            : 'Importer un JSON de variables…'}
        </button>
        {importNote && (
          <p className="fm-import" role="status">
            {importNote}
          </p>
        )}
        {importError && (
          <p className="fm-error" role="alert">
            {importError}
          </p>
        )}
        {importWarnings.slice(0, 2).map((warning) => (
          <p className="fm-warning" key={warning}>
            {warning}
          </p>
        ))}
        {importPending > 0 && (
          <button className="link" type="button" onClick={onRemoveImport}>
            Retirer l’import ({importPending})
          </button>
        )}
      </div>
    </div>
  );
}

interface FigmaPanelProps {
  file: FigmaFile;
  changes: FigmaChange[];
  checked: Set<string>;
  title?: string;
  panelRef: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  onToggle: (id: string) => void;
  onClose: () => void;
  onApply: () => void;
}

function ChangeRow({
  change,
  checked,
  onToggle,
}: {
  change: FigmaChange;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <label className="fp-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(change.id)}
      />
      <span className="fp-main">
        <span className="fp-name">{change.name}</span>
        {change.category === 'component' ? (
          <span className="fp-variant">
            {change.component?.variants.length
              ? `${change.component.variants.length} variante${
                  change.component.variants.length > 1 ? 's' : ''
                }`
              : change.variant ?? 'Par défaut'}
          </span>
        ) : (
          <span className="fp-values">
            <code>{change.oldValue ?? '—'}</code>
            <span aria-hidden="true">→</span>
            <code>{change.newValue ?? '—'}</code>
          </span>
        )}
      </span>
    </label>
  );
}

export function FigmaPanel({
  file,
  changes,
  checked,
  title = 'Mise à jour depuis Figma',
  panelRef,
  closeRef,
  onToggle,
  onClose,
  onApply,
}: FigmaPanelProps) {
  const styles = changes.filter((change) => change.category !== 'component');
  const components = changes.filter(
    (change) => change.category === 'component',
  );
  const checkedCount = changes.filter((change) =>
    checked.has(change.id),
  ).length;

  const styleCount = styles.length;
  const componentCount = components.length;

  return (
    <aside
      ref={panelRef}
      className="panel figma-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="figma-panel-title"
    >
      <div className="ph">
        <div>
          <h2 id="figma-panel-title">{title}</h2>
          <p className="fp-sub">
            {file.name} · {changes.length} changement
            {plural(changes.length, '', 's')}
          </p>
        </div>
        <button
          ref={closeRef}
          className="x"
          type="button"
          onClick={onClose}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      <div className="fp-groups">
        <section aria-labelledby="figma-styles-title">
          <h3 className="fp-caps" id="figma-styles-title">
            Styles et variables · {styleCount}
          </h3>
          {styles.length ? (
            styles.map((change) => (
              <ChangeRow
                key={change.id}
                change={change}
                checked={checked.has(change.id)}
                onToggle={onToggle}
              />
            ))
          ) : (
            <p className="fp-empty">Aucun style sélectionné.</p>
          )}
        </section>

        <section aria-labelledby="figma-components-title">
          <h3 className="fp-caps" id="figma-components-title">
            Composants · {componentCount}
          </h3>
          {components.length ? (
            components.map((change) => (
              <ChangeRow
                key={change.id}
                change={change}
                checked={checked.has(change.id)}
                onToggle={onToggle}
              />
            ))
          ) : (
            <p className="fp-empty">Aucun composant sélectionné.</p>
          )}
        </section>
      </div>

      <div className="fp-foot">
        <p>
          {checkedCount} élément
          {plural(checkedCount, '', 's')}{' '}
          {plural(checkedCount, 'sera', 'seront')} appliqué
          {plural(checkedCount, '', 's')}. Le code modifié à la main et les
          textes rédigés sont conservés.
        </p>
        <div className="fp-actions">
          <button className="sec" type="button" onClick={onClose}>
            Annuler
          </button>
          <button
            className="pri"
            type="button"
            onClick={onApply}
            disabled={checkedCount === 0}
          >
            Appliquer {checkedCount} changement
            {plural(checkedCount, '', 's')}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function FigmaToast({
  count,
  verb = 'synchronisé',
  onUndo,
}: {
  count: number;
  verb?: 'synchronisé' | 'importé' | 'appliqué';
  onUndo: () => void;
}) {
  return (
    <div className="figma-toast" role="status">
      <span>
        {count} élément{plural(count, '', 's')} {verb}
        {plural(count, '', 's')}
      </span>
      <button className="figma-undo" type="button" onClick={onUndo}>
        Annuler
      </button>
    </div>
  );
}
