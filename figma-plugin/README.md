# Plugin Figma optionnel — export des variables

Ce dossier contient un plugin local **optionnel**. Il lit les variables et styles
du fichier Figma ouvert, affiche un JSON et permet de le copier ou de le
télécharger. Il ne contacte aucun serveur, ne lit aucun jeton et n’écrit rien dans
Figma.

## Installation locale

1. Dans Figma, ouvrez **Plugins → Development → Import plugin from manifest…**.
2. Choisissez `figma-plugin/manifest.json`.
3. Lancez **DS-Studio — Export variables** dans le fichier à exporter.
4. Cliquez sur **Copier le JSON** ou **Télécharger**.
5. Dans DS-Studio, ouvrez la pastille **Figma**, puis
   **Importer un JSON de variables…** et choisissez le fichier.

Le plugin n’est pas nécessaire pour utiliser DS-Studio : la connexion OAuth en
lecture seule et le mode manuel restent disponibles.

## Contenu exporté

- variables couleur, espacement et arrondi ;
- styles de couleur, de texte et d’effet locaux ;
- composants et jeux de variantes.

Les variables transparentes, les alias non résolvables et les types non pris en
charge sont signalés et ignorés. Le JSON produit respecte ce contrat :

```json
{
  "format": "ds-studio/variables",
  "version": 1,
  "file": { "name": "DS-Sarah — Produit" },
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

Un fichier d’exemple est fourni : [exemple-variables.json](exemple-variables.json).

## Limites

- Le plugin est un outil de développement : il n’est pas publié dans le
  Community et n’a pas d’identifiant de publication.
- Les noms sont normalisés à l’import (`Colors/Primary/500` devient
  `colors-primary-500`).
- Une valeur identique à un token local est ignorée.
- Un conflit de type est signalé et n’écrase jamais le token existant.
- Un composant ou une variante nouveau arrive avec un **code vide** ; le code
  existant n’est jamais remplacé.
- La taille du fichier est limitée à 512 Ko et 500 variables.
