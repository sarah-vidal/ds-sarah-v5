# Figma : connexion réelle en lecture seule

**Phase 3 : IMPLEMENTED en lecture seule.** DS-Studio peut autoriser un compte
Figma via OAuth, lire un fichier explicitement choisi et proposer des changements
de styles, de variables couleur et de composants. **Aucune écriture distante
n’est exposée** : `writeEnabled` reste `false`.

Le serveur MCP Figma et son admission restent hors de ce mécanisme. Ne jamais
usurper un client autorisé, extraire un jeton, réutiliser une session Codex ou
recopier des cookies. La connexion ci-dessous utilise l’OAuth officiel de votre
propre application Figma.

## Prérequis

1. Un compte Figma et un fichier que ce compte peut lire.
2. Une application OAuth Figma créée sur [figma.com/developers/apps](https://www.figma.com/developers/apps).
   Enregistrez exactement l’URL de redirection :
   `http://127.0.0.1:4310/api/figma/oauth/callback`
   (adaptez le port si `PORT` change).
3. Les variables d’environnement définies **dans le terminal**, puis un
   redémarrage du serveur :

   ```sh
   FIGMA_CLIENT_ID=...
   FIGMA_CLIENT_SECRET=...
   npm start
   ```

   `.env` n’est pas chargé automatiquement. La référence est
   [.env.example](../.env.example).

4. Scopes par défaut : `current_user:read,file_content:read`.
   L’API Variables exige un plan **Enterprise** et le scope
   `file_variables:read` :

   ```sh
   FIGMA_SCOPES=current_user:read,file_content:read,file_variables:read
   ```

Sans configuration, l’interface affiche « Figma non configuré » et le mode manuel
reste entièrement disponible.

## Parcours

1. Ouvrez la pastille **Figma** puis **Autoriser avec Figma**.
2. Figma affiche la demande de consentement. Le retour se fait sur
   `/?figma=connecte&reel=1`.
3. Collez le lien du fichier (`https://www.figma.com/design/…`).
4. Choisissez les catégories, vérifiez la liste, puis **Appliquer**.
5. La notification propose **Annuler** pendant huit secondes.

La lecture récupère :

- les styles de couleur, de texte et d’effet réellement utilisés dans le document ;
- les variables couleur si l’API Variables est disponible ;
- les composants et leurs variantes. **Un component set Figma devient un seul
  composant** : chaque variante conserve son nom, ses propriétés
  (`Size=Large`, `State=Hover`) et son aperçu HTML.

Les variables d’espacement et d’arrondi ne sont **pas** converties par REST.
Leur import passe par le JSON du plugin local décrit ci-dessous.

## Composants, variantes et textes générés

- Un **component set** est regroupé en un composant unique avec toutes ses
  variantes ; un composant isolé arrive avec une variante « Par défaut ».
- Chaque variante reçoit un **aperçu HTML/CSS approximatif** généré localement
  depuis l’arbre REST : auto-layout converti en flex, couleurs, typographies,
  espacements, rayons et ombres. Les valeurs identiques à un token local
  utilisent le token (`var(--…, valeur)`).
- Les images, vecteurs et instances non détaillées sont simplifiés et signalés
  par un avertissement visible, jamais par un écran vide.
- Le code généré reste **éditable**. Un code modifié à la main est marqué et
  n’est pas écrasé au ré-import ; une variante disparue de Figma est retirée,
  sauf si son code a été retravaillé localement.
- La description, « À faire » et « À éviter » sont générés localement à
  l’import et à la création, sans appel réseau ni modèle de langage. Les champs
  modifiés à la main sont préservés ; **Régénérer les textes** les remplace
  explicitement.
- Le catalogue permet de **sélectionner plusieurs composants** (case par
  composant ou tout sélectionner) puis de les supprimer après confirmation
  indiquant le nombre exact.
- Un ré-import du même fichier met à jour les composants par leur identité
  Figma, sans créer de doublon. Les anciens imports éclatés par variante sont
  détectés et peuvent être fusionnés sans perdre leur code.

## Limites volontaires

- **Aucune écriture** vers Figma, aucun nouveau token envoyé à distance.
- **Aucune suppression** de token ou de composant local.
- Les composants et variantes nouveaux reçoivent un **aperçu HTML généré** ;
  l’import JSON de variables, qui ne contient pas de géométrie, crée un code
  vide éditable.
- Le code modifié à la main n’est jamais écrasé ; le code généré peut être mis
  à jour par un ré-import explicite.
- Pas de polling automatique : la synchronisation est une action explicite.
- Un style sans valeur lisible sur un nœud est signalé, pas inventé.
- Les noms sont normalisés ; un style `Colors/Primary/500` ne correspond pas
  forcément au token local `color-primary-500`. Vérifiez le diff avant d’appliquer.
- L’API Variables peut répondre `403` selon le plan : les styles et composants
  restent lus et un avertissement l’indique.
- Les limites de débit Figma s’appliquent ; un `429` demande de réessayer plus tard.
- Les fichiers très volumineux sont refusés plutôt que tronqués silencieusement.

## Sécurité

- Les jetons OAuth sont stockés uniquement dans `.ds-studio/figma.json`, ignoré
  par Git, avec écriture atomique et permissions privées.
- Le navigateur ne reçoit que le statut, le nom du compte, le nom du fichier et
  les changements ; jamais un jeton d’accès ou de rafraîchissement.
- L’état OAuth est à usage unique, expire après dix minutes et vérifie PKCE S256.
- Le callback OAuth est la seule route qui accepte une requête cross-site ; le
  contrôle d’hôte `127.0.0.1` reste actif.
- Une déconnexion efface la session privée. Révoquer aussi l’application dans
  Figma si nécessaire.

## Démonstration hors ligne

Les états simulés restent disponibles pour la conception et les tests :

- `/?figma=deconnecte`
- `/?figma=connecte_sans_fichier`
- `/?figma=connecte`
- `/?figma=erreur_autorisation`

Le paramètre `reel=1` désactive la démonstration et interroge le serveur. Il est
ajouté automatiquement au retour OAuth.

## Import JSON de variables et plugin optionnel

**Phase 4 : IMPLEMENTED.** L’import fonctionne sans compte Figma et sans réseau.
Il accepte le JSON du plugin local, l’export natif de DS-Studio (`{tokens:[…]}`)
ou un tableau de variables brut.

1. Ouvrez la pastille **Figma**, puis **Importer un JSON de variables…**.
2. Choisissez un fichier `.json` de 512 Ko maximum.
3. Vérifiez le panneau partagé, puis **Appliquer**. La notification permet
   d’annuler pendant huit secondes.
4. Le bouton **Retirer l’import** enlève uniquement les changements importés,
   sans toucher aux autres changements Figma en attente ni aux données locales.

Le contrat est volontairement étroit :

```json
{
  "format": "ds-studio/variables",
  "version": 1,
  "variables": [
    { "name": "Colors/Primary/500", "type": "color", "value": "#0ea5e9" },
    { "name": "spacing/md", "type": "spacing", "value": "16px" },
    { "name": "radius/lg", "type": "radius", "value": "16px" },
    {
      "name": "Font/Heading",
      "type": "typography",
      "value": "Plus Jakarta Sans 28px 700"
    },
    {
      "name": "Shadow/Card",
      "type": "shadow",
      "value": "0 10px 15px -3px rgba(42,17,64,0.3)"
    }
  ],
  "components": [{ "name": "Badge", "variants": ["Par défaut", "Info"] }]
}
```

Types acceptés : `color`, `spacing`, `typography`, `radius`, `shadow`. Les noms
sont normalisés (`Colors/Primary/500` → `colors-primary-500`). Une valeur
identique est ignorée ; un conflit de type est signalé et n’écrase rien. Les
couleurs sont limitées à `#RGB`/`#RRGGBB` sans transparence. Les valeurs
contenant `;`, des accolades, `url(` ou `javascript:` sont refusées.

Le plugin optionnel se trouve dans [figma-plugin/](../figma-plugin/README.md).
Il lit les variables locales, les styles et les composants du fichier ouvert,
puis affiche le JSON à copier ou télécharger. Il déclare `allowedDomains: none`
et n’écrit jamais dans Figma. Pour l’installer : **Plugins → Development →
Import plugin from manifest…**, puis choisir `figma-plugin/manifest.json`.

### Garanties de l’import

- Aucun envoi de fichier, de variable ou de jeton au serveur ou à Figma.
- Aucune suppression de token ou de composant.
- Un composant importé depuis le JSON arrive avec ses variantes et un **code
  vide** éditable ; les textes de documentation sont générés localement.
- Le code existant d’un composant n’est jamais écrasé.
- Un import peut être fusionné avec des changements REST ; seuls les éléments
  cochés sont appliqués.
- L’annulation restaure aussi l’import lorsque la session n’est plus connectée.
- Limites : 512 Ko, 500 variables, 200 composants.
