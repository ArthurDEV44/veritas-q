# Plan d'Intégration Complète du Sceau Veritas dans les Images

> **Version**: 1.6
> **Date**: 2026-01-07
> **Statut**: Phase 5 COMPLÈTE - Vérification & Polish

---

## Récapitulatif des Phases Terminées

### Phase 1: Fondations C2PA

**Module C2PA** (`veritas-core/src/c2pa/`):
- `manifest.rs` - `VeritasManifestBuilder` pour construire les manifests C2PA
- `assertion.rs` - `QuantumSealAssertion` pour les assertions Veritas personnalisées
- `signer.rs` - `VeritasSigner` pour la signature ECDSA P-256 (ES256)
- `error.rs` - Types d'erreurs C2PA

**Endpoints API** (`veritas-server/src/handlers/c2pa.rs`):
- `POST /c2pa/embed` - Intègre un manifest C2PA dans une image
- `POST /c2pa/verify` - Vérifie le manifest C2PA d'une image

**Certificats**: `keys/c2pa-test.key`, `keys/c2pa-test.crt`, `scripts/generate-test-cert.sh`

---

### Phase 2: Soft Binding (Hash Perceptuel)

**Module Watermark** (`veritas-core/src/watermark/`):
- `perceptual.rs` - `PerceptualHasher` avec algorithmes pHash, dHash, aHash, Blockhash
- Distance de Hamming pour comparaison de similarité (seuil recommandé: ≤10)

**Robustesse testée** (`veritas-core/tests/watermark_robustness.rs`):
- Compression JPEG (50-90%) - Distance 0
- Redimensionnement (50-150%) - Distance 0
- Rognage (10-25%) - Distance 0
- Rotation (90°, 180°) - Distance 20-40 (non invariant)

**API**: `POST /seal` retourne `perceptual_hash` (hex) pour les images

---

### Phase 3: Manifest Repository

**Module Manifest Store** (`veritas-server/src/manifest_store/`):
- `postgres.rs` - `PostgresManifestStore` avec connexion/migration via sqlx
- `store()`, `get_by_seal_id()`, `get_by_image_hash()`, `find_similar()`

**Migration**: `migrations/20260107100000_create_manifests_table.sql`

**Endpoints**:
- `POST /resolve` - Résolution par perceptual hash ou image_data
- `POST /seal` - Stockage automatique du manifest après création

**Tests**: 154 tests passent (CI locale)

---

### Phase 4: Intégration Frontend

**Backend** (`veritas-server/src/handlers/seal.rs`):
- `SealResponse` étendu avec `sealed_image` (base64) et `manifest_size`
- Paramètre `embed_c2pa` (défaut: true) pour activer/désactiver l'embedding
- Embedding automatique via `VeritasManifestBuilder::embed_in_stream()`
- Fallback silencieux si certificats non configurés

**Frontend** (`www/components/CameraCapture.tsx`):
- Interface `SealResponse` mise à jour avec `sealed_image`, `manifest_size`, `perceptual_hash`
- Fonction `downloadImage` utilise `sealed_image` quand disponible
- Indicateur UI "Manifest C2PA intégré" avec taille en Ko
- Bouton téléchargement affiche "(avec C2PA)" si manifest présent

**Tests**: Backend 48 tests OK, Frontend build OK

---

## Prochaines Étapes Immédiates

1. Configurer `C2PA_SIGNING_KEY` et `C2PA_SIGNING_CERT` sur Render
2. Configurer `DATABASE_URL` sur Render pour activer le manifest store
3. Tester le flux complet capture → seal → download → c2patool verify
4. Commencer Phase 5: Améliorer le composant Verifier

---

## Phase 5: Vérification & Polish (COMPLÈTE)

### Livrables

**Composant Verifier amélioré** (`www/components/Verifier.tsx`):
- Support de 3 chemins de vérification : classique, C2PA, soft binding
- Détection automatique du type de vérification selon les fichiers déposés
- Interface en français avec messages d'état détaillés
- Bouton adaptatif : "Vérifier le sceau" vs "Rechercher l'authenticité"

**Composant VerificationResult** (`www/components/VerificationResult.tsx`):
- Affichage détaillé des résultats C2PA (source QRNG, horodatage, signature, ancrage blockchain)
- Affichage des résultats soft binding avec niveau de confiance et distance Hamming
- Barre de confiance visuelle pour les correspondances perceptuelles
- Avertissements pour images modifiées (compression/redimensionnement)

**Fonctions API utilitaires** (`www/lib/verification.ts`):
- `verifyClassic()` - Vérification avec fichier .veritas
- `verifyC2pa()` - Extraction et vérification de manifest C2PA
- `resolveByImage()` - Résolution soft binding par hash perceptuel
- `verifyUnified()` - Fonction unifiée avec fallback automatique
- Utilitaires de formatage (timestamp, hash, source QRNG, niveau de confiance)

**Tests de performance k6** (`scripts/load-test/k6-verify.js`):
- Scénario de charge mixte (60% verify, 30% c2pa, 10% resolve)
- Montée en charge progressive : 10 → 50 → 100 utilisateurs
- Seuils de performance : /verify p95 < 200ms, /c2pa/verify p95 < 300ms, /resolve p95 < 100ms
- Métriques personnalisées par endpoint

**Documentation utilisateur** (`docs/guide-utilisateur.md`):
- Guide complet en français
- Explication des 3 méthodes de vérification
- Interprétation des résultats (distance Hamming, niveaux de confiance)
- FAQ détaillée

### Badge visuel (OPTIONNEL - Non implémenté)

Le badge visuel (watermark visible sur images vérifiées) a été reporté car jugé non prioritaire.

---

## Checklist de Lancement

### Pré-Production

- [x] Tests unitaires passent (>90% couverture)
- [x] Tests d'intégration passent
- [ ] Tests E2E sur iOS Safari passent
- [ ] Validation c2patool réussie
- [ ] Audit de sécurité des clés
- [ ] Performance <500ms pour embed
- [ ] Documentation API complète

### Production

- [ ] Certificat de signature configuré
- [ ] Manifest repository initialisé
- [ ] Monitoring des erreurs C2PA
- [ ] Alerting sur échecs de signature
- [ ] Backup des clés
- [ ] Plan de rotation des clés

### Post-Production

- [ ] Soumission au programme C2PA
- [ ] Tests d'interopérabilité Adobe/Microsoft
- [ ] Documentation utilisateur
- [ ] Support technique formé

---

## Références

| Document | URL |
|----------|-----|
| C2PA Technical Specification 2.2 | [spec.c2pa.org](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html) |
| c2pa-rs SDK | [GitHub](https://github.com/contentauth/c2pa-rs) |
| FIPS 204 (ML-DSA) | [NIST](https://csrc.nist.gov/pubs/fips/204/final) |
| image_hasher | [crates.io](https://crates.io/crates/image_hasher) |
