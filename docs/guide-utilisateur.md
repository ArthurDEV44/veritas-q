# Guide Utilisateur Veritas Q

> Authentification quantique des médias numériques

---

## Table des matières

1. [Introduction](#introduction)
2. [Créer un sceau](#créer-un-sceau)
3. [Vérifier un média](#vérifier-un-média)
4. [Comprendre les résultats](#comprendre-les-résultats)
5. [FAQ](#faq)

---

## Introduction

Veritas Q utilise la cryptographie quantique pour créer des preuves d'authenticité infalsifiables pour vos photos et vidéos. Chaque "Sceau Veritas" contient :

- **Entropie quantique** : 256 bits générés par un générateur quantique de nombres aléatoires (QRNG)
- **Signature post-quantique** : ML-DSA-65 (FIPS 204), résistante aux ordinateurs quantiques
- **Hash de contenu** : SHA3-256 pour l'intégrité cryptographique
- **Hash perceptuel** : Pour retrouver le sceau même après compression/redimensionnement
- **Horodatage** : Moment précis de la capture
- **Ancrage blockchain** (optionnel) : Preuve immuable sur Solana

---

## Créer un sceau

### Via l'application web

1. **Ouvrir l'application** sur votre navigateur
2. **Autoriser l'accès à la caméra** quand demandé
3. **Prendre une photo** ou **enregistrer une vidéo**
4. **Attendre la génération du sceau** (< 500ms)
5. **Télécharger** :
   - L'image scellée (avec manifest C2PA intégré)
   - Le fichier `.veritas` (sceau séparé, optionnel)

### Indicateurs à l'écran

| Indicateur | Signification |
|------------|---------------|
| Source QRNG | Origine de l'entropie quantique (ANU, ID Quantique, etc.) |
| Manifest C2PA | Taille du manifest intégré dans l'image |
| Hash perceptuel | Identifiant pour la résolution soft binding |

### Bonnes pratiques

- **Capturez directement** : Le sceau est plus fiable quand l'image est capturée directement dans l'app
- **Conservez le fichier .veritas** : Même si le manifest C2PA est intégré, le fichier séparé sert de backup
- **Vérifiez après téléchargement** : Testez que votre image téléchargée passe la vérification

---

## Vérifier un média

L'application offre trois méthodes de vérification automatiques.

### Méthode 1 : Vérification classique

**Quand l'utiliser** : Vous avez l'image originale ET son fichier `.veritas`

1. **Déposez les deux fichiers** dans la zone de dépôt
2. Cliquez sur **"Vérifier le sceau"**
3. Le système compare le hash cryptographique exact

**Résultat** : AUTHENTIQUE ou INVALIDE

### Méthode 2 : Vérification C2PA

**Quand l'utiliser** : Vous avez une image avec un manifest C2PA intégré

1. **Déposez uniquement l'image** dans la zone de dépôt
2. Cliquez sur **"Rechercher l'authenticité"**
3. Le système extrait et vérifie le manifest C2PA

**Résultat** : Affiche les détails du sceau quantique (source QRNG, horodatage, ancrage blockchain, etc.)

### Méthode 3 : Résolution soft binding

**Quand l'utiliser** : L'image a été compressée, redimensionnée ou recadrée (métadonnées perdues)

1. **Déposez l'image modifiée** dans la zone de dépôt
2. Cliquez sur **"Rechercher l'authenticité"**
3. Le système calcule le hash perceptuel et recherche des correspondances

**Résultat** : SCEAU RETROUVÉ avec niveau de confiance

---

## Comprendre les résultats

### Résultat : AUTHENTIQUE

L'image est **identique** à celle qui a été scellée. Aucune modification n'a été détectée.

- La signature quantique est valide
- Le hash cryptographique correspond exactement
- L'entropie QRNG a été vérifiée

### Résultat : SCEAU RETROUVÉ

L'image a été **modifiée** (compression, redimensionnement) mais le sceau original a été retrouvé.

| Distance Hamming | Niveau de confiance |
|------------------|---------------------|
| 0 bits | Correspondance exacte |
| 1-5 bits | Haute confiance |
| 6-10 bits | Confiance moyenne |
| > 10 bits | Faible confiance |

**Note** : Une distance > 0 indique des modifications mais n'invalide pas l'authenticité originale.

### Résultat : INVALIDE

La signature ne correspond pas au contenu. Causes possibles :

- L'image a été altérée de manière significative
- Le fichier .veritas ne correspond pas à cette image
- Le sceau a été corrompu ou falsifié

### Résultat : AUCUN SCEAU TROUVÉ

L'image n'a pas de manifest C2PA et aucun sceau correspondant n'a été trouvé dans la base de données.

---

## Détails du sceau quantique

Quand une vérification C2PA réussit, les informations suivantes sont affichées :

### Source QRNG

| Source | Description |
|--------|-------------|
| ANU | Australian National University - API publique |
| ID Quantique | Générateur commercial de haute qualité |
| Mock | Test uniquement - non quantique |

### Signature ML-DSA

- **Algorithme** : ML-DSA-65 (FIPS 204)
- **Taille** : ~3300 octets
- **Sécurité** : Résistante aux ordinateurs quantiques

### Ancrage blockchain

Si présent, prouve que le sceau existait à un moment précis :

- **Réseau** : Solana Devnet (développement) ou Mainnet (production)
- **Transaction** : ID de la transaction d'ancrage
- **Vérification** : Consultable sur un explorateur Solana

---

## FAQ

### Pourquoi utiliser l'entropie quantique ?

L'entropie quantique est **véritablement aléatoire** au niveau physique. Contrairement aux générateurs pseudo-aléatoires, elle ne peut pas être prédite ou reproduite. Cela rend chaque sceau unique et infalsifiable.

### Puis-je recadrer une image scellée ?

Oui, mais :
- Le manifest C2PA sera perdu
- La vérification classique échouera
- La résolution soft binding fonctionnera si le recadrage est < 25%

### Que faire si je perds le fichier .veritas ?

Si votre image contient un manifest C2PA intégré, vous n'avez pas besoin du fichier .veritas. Sinon, utilisez la résolution soft binding pour retrouver le sceau dans notre base de données.

### Le sceau protège-t-il contre les deepfakes ?

Le sceau **prouve l'authenticité** d'une capture originale. Il ne peut pas :
- Détecter si une image est un deepfake
- Prouver que le contenu représente la réalité
- Empêcher la copie du contenu

### Combien de temps les sceaux sont-ils conservés ?

Les sceaux sont conservés indéfiniment dans notre base de données. Les ancrages blockchain sont permanents et immuables.

### L'application fonctionne-t-elle hors ligne ?

La **vérification C2PA** fonctionne hors ligne car le manifest est intégré dans l'image. La création de sceaux et la résolution soft binding nécessitent une connexion internet.

### Comment vérifier avec c2patool ?

Vous pouvez vérifier les images scellées avec l'outil officiel C2PA :

```bash
# Installation
cargo install c2patool

# Vérification
c2patool verify image-scellee.jpg

# Afficher les détails
c2patool manifest image-scellee.jpg
```

### Quels formats sont supportés ?

| Format | Capture | Vérification | C2PA |
|--------|---------|--------------|------|
| JPEG | Oui | Oui | Oui |
| PNG | Oui | Oui | Oui |
| WebP | Oui | Oui | Partiel |
| GIF | Non | Oui | Non |
| MP4 | Oui | Oui | Bientôt |

---

## Support

Pour toute question ou problème :

- **GitHub Issues** : [github.com/veritas-q/issues](https://github.com/veritas-q/issues)
- **Documentation technique** : Voir `CLAUDE.md` dans le repository

---

*Veritas Q - La vérité, quantiquement certifiée*
