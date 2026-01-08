---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
workflowStatus: 'complete'
completedAt: '2026-01-08'
inputDocuments: ['brainstorming-session-2026-01-08.md', 'USE-CASES.md', 'CLAUDE.md']
workflowType: 'prd'
lastStep: 0
documentCounts:
  brief: 0
  research: 0
  brainstorming: 1
  projectDocs: 2
---

# Product Requirements Document - Veritas Q

**Author:** Sauron
**Date:** 2026-01-08

---

## Executive Summary

**Veritas Q** est une plateforme d'authentification média basée sur la cryptographie quantique, conçue pour créer le standard mondial de "Reality Authentication". Le MVP technique est fonctionnel et ce PRD définit la transformation vers un produit commercial ciblant trois verticaux prioritaires.

### Vision

Construire une **Network Society of Trust** — un monde où chaque média numérique peut être vérifié comme authentique, où les données appartiennent à leurs créateurs, et où la sécurité est garantie contre les menaces actuelles ET futures (ordinateurs quantiques).

### Objectif de ce PRD

Transformer le MVP existant en produit B2B commercialisable pour :
1. **Assurance** (priorité 1) — Éliminer la fraude aux photos de sinistres
2. **Média/Journalisme** (priorité 2) — Certifier l'authenticité des reportages
3. **Usage Personnel** (futur) — Personal Vault pour souveraineté des données

### Ce Qui Rend Veritas Q Spécial

**Proposition de valeur unique :**
> "La seule solution qui sécurise aujourd'hui ET demain" — cryptographie post-quantique résistante aux futurs ordinateurs quantiques.

**Différenciateurs clés :**
- **Souveraineté des données** — Vos médias vous appartiennent, pas aux GAFAM
- **Preuve infalsifiable** — Sceau cryptographique impossible à contester
- **Future-proof** — Protection post-quantique (ML-DSA-65, QRNG)

**Avantage concurrentiel :**
- Les solutions IA de détection deepfake sont contournables (90%+ d'échec)
- Les solutions blockchain sont complexes et mal comprises
- Aucun concurrent n'offre de protection post-quantique

---

## Project Classification

**Type Technique :** API Backend + Web App (PWA) + SaaS B2B
**Domaine :** InsureTech + MediaTech (authentification média)
**Complexité :** Élevée (cryptographie post-quantique)
**Contexte Projet :** Brownfield — extension du MVP existant

### Stack Technique Existant

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| veritas-core | Rust | Bibliothèque cryptographique (QRNG + ML-DSA-65) |
| veritas-server | Rust/Axum | API REST (Truth API) |
| veritas-cli | Rust | Outil ligne de commande |
| veritas-wasm | WebAssembly | Bindings navigateur |
| www/ | Next.js 16 | PWA Frontend |

### Architecture Cible : VERITAS TRUST TIERS

```
┌─────────────────────────────────────────────────────────────┐
│                    VERITAS TRUST TIERS                       │
├─────────────────────────────────────────────────────────────┤
│  🔒 TIER 1 — Grand Public / Assurance                        │
│  └── Capture IN-APP uniquement = sécurité maximale           │
│                                                              │
│  📰 TIER 2 — Reporters Vérifiés                              │
│  └── Import autorisé avec vérification carte de presse       │
│                                                              │
│  🏢 TIER 3 — Enterprise (Futur)                              │
│  └── Intégration hardware/SDK = scellement à la source       │
└─────────────────────────────────────────────────────────────┘
```

---

## Success Criteria

### User Success

**Client Assurance (sinistré) :**
- Déclaration de sinistre avec photo en < 2 minutes via l'app
- Traitement accéléré du dossier (48h vs 2 semaines standard)
- Confiance dans le processus ("ma preuve est infalsifiable")
- Zéro contestation de la validité des photos soumises

**Reporter Média :**
- Scellement d'une photo terrain en < 30 secondes
- Capacité de prouver l'authenticité en 1 clic face à une accusation de fake
- Intégration fluide dans le workflow existant (pas de friction)
- Sentiment de protection ("mon travail est protégé")

### Business Success

**À 3 mois :**
- 1 pilote assurance actif (région Nantes)
- 1 pilote média actif (région Nantes)
- Démos B2B fonctionnelles et convaincantes
- Premiers feedbacks utilisateurs collectés

**À 12 mois :**
- 2-3 clients payants Assurance (~1 500-2 000€ MRR)
- 3-5 clients payants Média (~300-500€ MRR)
- 2+ témoignages clients publiés
- 1+ article presse tech française
- Validation ANSSI ou équivalent (en cours)

**À 3-5 ans (Vision) :**
- Leader français de l'authentification média post-quantique
- 50+ clients B2B actifs
- Revenus B2C via Personal Vault
- Partenariats constructeurs initiés

### Technical Success

| Métrique | Cible MVP | Cible Growth |
|----------|-----------|--------------|
| Temps de scellement | < 500ms | < 300ms |
| Disponibilité API | 99.5% | 99.9% |
| Sécurité clés | Zéro compromission | Audit externe passé |
| Source QRNG | LfD QRNG ou équivalent | Multi-source avec failover |
| Latence vérification | < 200ms | < 100ms |

### Measurable Outcomes

| KPI | Baseline | Target 12 mois |
|-----|----------|----------------|
| Clients B2B payants | 0 | 5-8 |
| MRR (Monthly Recurring Revenue) | 0€ | 2 000-2 500€ |
| Seals générés/mois | ~100 (tests) | 5 000+ |
| Taux de vérification réussie | N/A | > 99.5% |
| NPS clients pilotes | N/A | > 40 |

---

## Product Scope

### MVP - Minimum Viable Product

**Objectif :** Produit démontrable pour premiers pilotes B2B

**Fonctionnalités requises :**

1. **Tier 1 Complet**
   - Capture photo in-app (PWA)
   - Scellement automatique (QRNG + ML-DSA)
   - Vérification en 1 clic
   - Métadonnées intégrées (date, lieu, hash)

2. **UX Commerciale**
   - Interface moderne et professionnelle
   - Parcours utilisateur fluide
   - Responsive mobile-first

3. **Demo Kit B2B**
   - Scénario Assurance (10 min)
   - Scénario Média (10 min)
   - Documentation commerciale

4. **API Stable**
   - Endpoints /seal et /verify documentés
   - Authentification API keys
   - Rate limiting basique

### Growth Features (Post-MVP)

**Objectif :** Fonctionnalités pour convertir les pilotes en clients payants

1. **Tier 2 - Reporters Vérifiés**
   - Système de vérification carte de presse
   - Import depuis galerie (Tier 2 uniquement)
   - Audit trail complet

2. **Dashboard B2B**
   - Analytics d'utilisation
   - Gestion des utilisateurs
   - Export de rapports

3. **Système de Facturation**
   - Abonnements Stripe
   - Gestion des plans (Assurance, Média)
   - Facturation automatique

4. **SDK Mobile** (optionnel)
   - iOS SDK pour intégration apps assureurs
   - Android SDK

### Vision (Future)

**Objectif :** Devenir le standard français/européen

1. **Tier 3 - Enterprise**
   - Hardware SDK (caméras pro)
   - Intégration native constructeurs
   - Scellement à la source

2. **Personal Vault**
   - Stockage souverain chiffré
   - Options : local, IPFS, cloud EU
   - Héritage numérique

3. **Écosystème**
   - Standard C2PA français
   - Certification ANSSI
   - Partenariats institutionnels (AFP, assureurs nationaux)

---

## User Journeys

### Journey 1 : Lucas Martin — Le Sinistre du Vendredi Soir

**Persona :** Lucas, 34 ans, consultant en informatique, client de Mutuelle Atlantique

Lucas rentre du travail un vendredi soir pluvieux. Sur le périphérique nantais, à 22h30, une voiture lui coupe la route. Freinage d'urgence, mais trop tard — son pare-chocs avant est enfoncé, le phare droit explosé. Le cœur battant, il sort constater les dégâts pendant que l'autre conducteur s'excuse.

Sa femme, au téléphone, lui rappelle : "N'oublie pas de tout photographier pour l'assurance !". Lucas sort son iPhone, mais hésite — il a entendu des histoires de photos contestées, de dossiers qui traînent pendant des mois. Puis il se souvient : sa mutuelle lui a fait installer Veritas Q lors du renouvellement de son contrat.

**Le moment de vérité :**
Il ouvre l'application. Interface simple, un seul bouton "Capturer". Il photographie le pare-chocs, le phare, la plaque de l'autre véhicule, les traces de freinage. Chaque photo est scellée en moins d'une seconde — il voit le petit badge vert "Veritas Seal" apparaître. En 3 minutes, il a 6 photos infalsifiables avec horodatage et géolocalisation certifiés.

**La résolution :**
Lundi matin, Lucas envoie son dossier via l'app de sa mutuelle. Le gestionnaire de sinistres voit immédiatement les badges Veritas — aucune vérification supplémentaire nécessaire, aucune contestation possible. Là où le traitement prenait habituellement 2-3 semaines, Lucas reçoit l'accord de prise en charge en 48 heures. Il raconte à ses collègues : "C'est comme avoir un huissier dans ma poche."

**Requirements révélés :**
- Capture photo rapide (< 2 secondes par photo)
- Badge visuel de scellement
- Métadonnées automatiques (date, heure, GPS)
- Export facile vers apps tierces (assurance)
- Fonctionnement hors-ligne (réseau instable sur périphérique)

---

### Journey 2 : Camille Rousseau — L'Arme de Vérité de la Reporter

**Persona :** Camille, 28 ans, reporter terrain pour Nantes Métropole Info

Samedi après-midi, une manifestation dégénère près de la place du Commerce. Camille est sur place avec son iPhone — elle court entre les groupes, capturant les moments clés. À 16h42, elle photographie un CRS matraquant un manifestant à terre. Image choc.

Elle sait que cette photo va faire le tour des réseaux. Elle sait aussi ce qui s'est passé la dernière fois — une photo similaire avait été qualifiée de "montage" par les autorités, et son média avait dû publier un rectificatif humiliant.

**Le moment de vérité :**
Cette fois, Camille a Veritas Q. La photo est scellée instantanément. Elle voit les métadonnées : 16:42:37, coordonnées GPS exactes, hash cryptographique unique. Elle envoie à sa rédactrice en chef avec un message : "Photo Veritas — incontestable."

À 18h, la photo est publiée sur le site de Nantes Métropole Info avec le badge "Veritas Verified". Les commentaires affluent — certains crient au fake. Sophie Leroux, la rédactrice en chef, publie un second article : "Voici comment vérifier vous-même l'authenticité de cette photo" avec un lien vers le vérificateur Veritas.

**La résolution :**
24 heures plus tard, 50 000 personnes ont vérifié la photo. Quand un porte-parole tente de suggérer un montage, Sophie répond simplement : "Vérifiez vous-même, le lien est public." Fin du débat. Camille est fière — son travail de terrain est protégé, sa crédibilité intacte. Elle tweete : "L'arme de vérité des reporters."

**Requirements révélés :**
- Scellement rapide en situation de terrain
- Badge de vérification visible dans les publications
- Lien de vérification partageable publiquement
- Métadonnées détaillées (timestamp précis, GPS)
- Fonctionnement en mobilité (réseau 4G/5G)

---

### Journey 3 : Marie Dubois — La Vérificatrice Sceptique

**Persona :** Marie, 45 ans, responsable RH, citoyenne ordinaire sur les réseaux sociaux

Marie scrolle sur Twitter un dimanche soir. Une photo choc fait le buzz — un homme politique dans une situation compromettante. Les commentaires sont déchaînés. Marie a appris à se méfier — elle a été trompée par des deepfakes auparavant.

Elle remarque un petit badge qu'elle n'a jamais vu : "Veritas Verified". Curieuse, elle clique sur le lien "Vérifier l'authenticité".

**Le moment de vérité :**
Une page simple s'ouvre. Sans télécharger d'application, sans créer de compte, elle peut vérifier. Elle voit :
- ✅ "Photo originale authentifiée"
- 📅 Date de capture : 15 janvier 2026, 14:23:07
- 📍 Lieu : Paris, 8ème arrondissement
- 🔐 Signature cryptographique valide
- 👤 Scellée par : @JournalisteParis (reporter vérifié)

Marie comprend immédiatement : cette photo a été prise à ce moment, à cet endroit, par ce journaliste. Impossible qu'il s'agisse d'un montage créé après coup.

**La résolution :**
Marie partage la photo avec un commentaire : "J'ai vérifié, c'est authentique via Veritas." Elle explique à ses collègues le lendemain comment fonctionne le système. Elle télécharge l'app pour ses propres photos de famille — "au moins mes photos de vacances seront vraiment les miennes."

**Requirements révélés :**
- Vérification sans compte / sans téléchargement (web-based)
- Interface de résultat claire et compréhensible
- Affichage des métadonnées de manière lisible
- Indication du niveau de confiance (reporter vérifié vs anonyme)
- Lien partageable pour que d'autres puissent vérifier
- Parcours vers l'adoption personnelle (conversion B2C)

---

### Journey Requirements Summary

| Journey | User Type | Key Capabilities |
|---------|-----------|------------------|
| Lucas (Sinistre) | End User B2B | Capture rapide, badge visuel, métadonnées auto, export, offline |
| Camille (Reporter) | End User B2B | Scellement terrain, badge publication, lien public, mobilité |
| Marie (Vérificatrice) | Public | Vérification web sans compte, résultats clairs, partage, conversion B2C |

**Capabilities communes identifiées :**
- Interface simple et rapide
- Scellement < 1 seconde
- Métadonnées automatiques (date, heure, GPS)
- Badge visuel d'authenticité
- Vérification accessible à tous (web-based)
- Liens partageables

---

## Domain-Specific Requirements

### InsureTech + MediaTech + Cryptographie Post-Quantique

Veritas Q opère à l'intersection de trois domaines à haute complexité réglementaire. Cette section définit les exigences de conformité et les contraintes qui façonnent le produit.

### Conformité RGPD & Protection des Données

| Aspect | Exigence |
|--------|----------|
| **Consentement** | Consentement explicite à l'inscription + rappel optionnel métadonnées GPS à chaque capture |
| **Droit à l'oubli** | Suppression des médias du Vault possible. Le hash cryptographique (preuve d'existence) reste immuable |
| **Stockage** | EU-only obligatoire — hébergeur français/EU, certification HDS si données sensibles |
| **Minimisation** | Collecte limitée aux métadonnées nécessaires à l'authentification |
| **Portabilité** | Export des seals et médias dans format standard (C2PA compatible) |

**Implications produit :**
- Toggle GPS optionnel dans l'interface de capture
- Dashboard de gestion des données personnelles
- Politique de rétention claire et paramétrable

### Certification & Qualifications Sécurité

| Phase | Objectif | Actions |
|-------|----------|---------|
| **MVP** | Crédibilité technique | Auto-déclaration conformité + documentation transparente |
| **6-12 mois** | Validation externe | Audit pentest par PASSI + rapport public |
| **12-24 mois** | Certification formelle | Visa de sécurité ANSSI ou Qualification RGS |

**Standards techniques visés :**
- NIST FIPS 204 (ML-DSA-65) — signature post-quantique
- QRNG certifié (LfD Quantique ou équivalent)
- Chiffrement AES-256-GCM pour données au repos

### Recevabilité Juridique & Valeur Probante

| Standard | Statut | Implication |
|----------|--------|-------------|
| **eIDAS niveau avancé** | Cible 12-24 mois | Signature électronique à valeur probante maximale |
| **Horodatage qualifié** | Partenariat TSP requis | Timestamp opposable juridiquement (RFC 3161) |
| **Code Civil Art. 1362** | Applicable immédiatement | Seal = "commencement de preuve par écrit" |

**Positionnement juridique :**
> "Veritas Q produit une preuve numérique dont la falsification est techniquement démontrable comme impossible — renforçant significativement la présomption de véracité."

**Limitations explicites :**
- Veritas Q n'est pas un huissier de justice
- Le seal certifie l'authenticité de capture, pas l'interprétation du contenu
- Un expert humain reste nécessaire pour l'analyse du sinistre/contenu

### Positionnement Anti-Fraude (Assurance)

| Aspect | Position |
|--------|----------|
| **Nature juridique** | Obligation de moyens (outil de prévention) |
| **Responsabilité** | L'assureur reste décisionnaire — Veritas Q fournit un outil |
| **Périmètre** | Certification authenticité capture uniquement |
| **Disclaimer** | "Photo capturée via app à ce moment/lieu. Interprétation reste humaine." |

**Valeur mesurable :**
- Réduction du risque de fraude photo (photos antidatées, retouchées, réutilisées)
- Accélération du traitement (confiance accrue = moins de vérifications manuelles)
- Trace d'audit complète en cas de litige

### Exigences Spécifiques Média/Journalisme

| Aspect | Exigence |
|--------|----------|
| **Protection des sources** | Métadonnées auteur optionnelles / pseudonymisables |
| **Standard C2PA** | Compatibilité manifest JUMBF pour interopérabilité Adobe/Microsoft |
| **Liberté de la presse** | Aucune censure ou modération du contenu scellé |
| **Vérification publique** | Accessible sans compte pour tout citoyen |

### Expertise Requise pour Implémentation

| Domaine | Compétence Nécessaire |
|---------|----------------------|
| Cryptographie post-quantique | ML-DSA, QRNG, key management |
| Conformité RGPD | DPO ou conseil juridique spécialisé |
| Certification ANSSI | Consultant PASSI pour audit |
| eIDAS/TSP | Partenariat prestataire qualifié |
| Assurance/InsureTech | Connaissance régulation ACPR |

---

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Cryptographie Post-Quantique Appliquée**
Veritas Q est la première plateforme d'authentification média à implémenter ML-DSA-65 (FIPS 204) en production. Cette innovation anticipe la menace "harvest now, decrypt later" où des acteurs malveillants stockent des données chiffrées aujourd'hui pour les déchiffrer avec des ordinateurs quantiques demain.

**2. QRNG comme Source d'Entropie**
L'utilisation de générateurs quantiques de nombres aléatoires (LfD QRNG) plutôt que des PRNG classiques élimine la prévisibilité théorique de l'entropie — chaque seal contient de la "vraie" randomité quantique.

**3. Architecture TRUST TIERS**
Segmentation innovante de la confiance :
- Tier 1 : Capture in-app = confiance maximale (anti-fake)
- Tier 2 : Import vérifié = confiance conditionnelle (reporters)
- Tier 3 : Hardware = confiance native (futur)

**4. Paradigme "Reality Authentication"**
Passage de la détection (IA anti-deepfake = réactive, contournable) à la certification (scellement à la source = proactif, infalsifiable).

### Market Context & Competitive Landscape

| Approche Concurrente | Limitation | Avantage Veritas Q |
|---------------------|------------|-------------------|
| Détection IA deepfake | 90%+ contournable, course aux armements | Prévention à la source |
| Blockchain seule | Complexe, mal comprise, pas mobile-friendly | UX simple, PWA native |
| Métadonnées EXIF | Facilement modifiables | Hash cryptographique immuable |
| Watermarking | Détectable, supprimable | Signature invisible dans seal |

### Validation Approach

| Innovation | Méthode de Validation |
|------------|----------------------|
| Post-quantum security | Audit cryptographique externe + conformité NIST |
| QRNG quality | Certification source LfD + tests statistiques |
| Trust Tiers | Pilotes B2B (assurance/média) + feedback terrain |
| UX adoption | Métriques temps de scellement + taux d'abandon |

### Risk Mitigation

| Risque Innovation | Mitigation |
|-------------------|------------|
| QRNG indisponible | Fallback sur entropie hardware attestée |
| ML-DSA vulnérabilité découverte | Architecture modulaire, algo swappable |
| Adoption trop lente | Freemium + intégration partenaires (effet réseau) |
| Réglementation adverse | Conformité proactive ANSSI/eIDAS |

---

## SaaS B2B Specific Requirements

### Project-Type Overview

Veritas Q est une plateforme SaaS B2B hybride combinant :
- **API Backend** (Truth API) — pour intégrations techniques
- **Web App PWA** — pour utilisateurs finaux (capture/vérification)
- **Dashboard B2B** — pour administrateurs clients

### Multi-Tenancy Architecture

| Aspect | Décision |
|--------|----------|
| **Modèle** | Logical isolation (shared DB, tenant_id) |
| **Grands comptes** | Option instance dédiée sur demande |
| **Data isolation** | Row-level security, encryption par tenant |
| **Évolutivité** | Horizontal scaling par service |

### RBAC Matrix (Rôles par Organisation)

| Rôle | Capture | Verify | Analytics | Manage Users | Billing |
|------|---------|--------|-----------|--------------|---------|
| **Owner** | ✅ | ✅ | ✅ Full | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ Full | ✅ | ❌ |
| **User** | ✅ | ✅ | ✅ Own | ❌ | ❌ |
| **Viewer** | ❌ | ✅ | ❌ | ❌ | ❌ |

### Subscription Tiers

| Tier | Prix | Seals/mois | Users | Analytics | Support | SLA |
|------|------|------------|-------|-----------|---------|-----|
| **Free** | 0€ | 5 | 1 | ❌ | Community | Best effort |
| **Média** | 99€ | Illimité | 10 | Basique | Email 48h | 99.5% |
| **Assurance** | 500€ | Illimité | 50 | Complet | Dédié 24h | 99.9% |
| **Enterprise** | Sur devis | Illimité | Illimité | Custom | Premium | 99.95% |

### Integration Capabilities

| Intégration | Priorité | Description |
|-------------|----------|-------------|
| **REST API** | MVP | Endpoints /seal, /verify, /batch |
| **Webhooks** | Growth | Events: seal.created, seal.verified, seal.failed |
| **SSO (OIDC/SAML)** | Enterprise | Single Sign-On pour grands comptes |
| **SDK Mobile** | Growth | iOS/Android pour intégration apps partenaires |
| **C2PA Export** | MVP | Format standard pour interopérabilité |
| **Bulk Operations** | Growth | Import/export CSV, batch processing |

### API Specifications

| Endpoint | Méthode | Description | Rate Limit |
|----------|---------|-------------|------------|
| `/seal` | POST | Créer un seal (multipart) | 100/min |
| `/verify` | POST | Vérifier un seal | 500/min |
| `/batch/seal` | POST | Sceller plusieurs fichiers | 20/min |
| `/seals` | GET | Lister seals (paginé) | 60/min |
| `/analytics` | GET | Métriques d'usage | 10/min |
| `/webhooks` | POST/GET | Gérer webhooks | 30/min |

### Implementation Considerations

**Phase MVP :**
- API REST stable avec auth API keys
- Dashboard B2B minimal (analytics basiques)
- Stripe pour billing

**Phase Growth :**
- Webhooks pour intégrations événementielles
- SDK mobile iOS/Android
- SSO pour enterprise

**Phase Scale :**
- Instance dédiée option
- API GraphQL (optionnel)
- Marketplace intégrations

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approche MVP :** Revenue MVP — Valider la willingness-to-pay B2B
**Équipe MVP :** 1-2 développeurs full-stack + fondateur

### MVP Feature Set (Phase 1) — "Pilot Ready"

**Objectif :** Produit démontrable pour premiers pilotes B2B Nantes

**User Journeys Supportés :**
- ✅ Lucas (Sinistre) — Parcours complet Tier 1
- ⚠️ Camille (Reporter) — Parcours partiel (capture in-app uniquement)
- ✅ Marie (Vérificatrice) — Parcours complet

**Must-Have MVP :**

| Feature | Justification |
|---------|---------------|
| Capture photo in-app (PWA) | Core value — preuve à la source |
| Scellement QRNG + ML-DSA | Différenciateur technique |
| Vérification 1-clic | UX essentielle |
| Badge visuel Veritas Seal | Confiance utilisateur |
| Métadonnées auto (date, GPS) | Valeur probante |
| API /seal et /verify | Intégration B2B |
| Landing page commerciale | Acquisition pilotes |
| Demo Kit (scénarios 10min) | Vente B2B |

**Explicitly Out of MVP :**

| Feature | Raison | Phase |
|---------|--------|-------|
| Import galerie (Tier 2) | Risque sécurité, complexité | Growth |
| Vérification reporters | Processus manuel OK pour pilotes | Growth |
| Dashboard analytics | Excel/manual reporting suffisant | Growth |
| Billing Stripe | Facturation manuelle OK au début | Growth |
| SDK Mobile natif | PWA suffisante pour MVP | Growth |
| SSO Enterprise | Pas de grands comptes au début | Scale |
| Personal Vault | B2C = post-financement B2B | Vision |

### Post-MVP Features

**Phase 2 — Growth (6-12 mois)**

| Feature | Priorité | Déclencheur |
|---------|----------|-------------|
| Tier 2 (import reporters) | Haute | 1er client média payant |
| Dashboard B2B | Haute | 3+ clients actifs |
| Billing Stripe | Haute | Fin des pilotes gratuits |
| Webhooks | Moyenne | Demande client spécifique |
| Bulk operations | Moyenne | Volume > 1000 seals/mois |

**Phase 3 — Scale (12-24 mois)**

| Feature | Priorité | Déclencheur |
|---------|----------|-------------|
| SDK Mobile iOS/Android | Haute | Demande assureur national |
| SSO OIDC/SAML | Moyenne | Client enterprise |
| API GraphQL | Basse | Demande développeurs |
| Multi-région EU | Moyenne | Expansion géographique |

**Phase 4 — Vision (24+ mois)**

| Feature | Déclencheur |
|---------|-------------|
| Personal Vault (B2C) | MRR B2B > 10k€ |
| Hardware SDK (Tier 3) | Partenariat constructeur |
| Certification ANSSI | Demande institutionnel |

### Risk Mitigation Strategy

**Risques Techniques :**

| Risque | Impact | Mitigation |
|--------|--------|------------|
| QRNG indisponible | Bloquant | Fallback ANU QRNG + mock dev |
| Performance ML-DSA | UX dégradée | Benchmark < 500ms validé |
| PWA limitations caméra | Feature incomplète | Test devices cibles tôt |

**Risques Marché :**

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Adoption lente assureurs | Pas de revenus | Pilote gratuit 6 mois |
| Concurrence C2PA | Différenciation perdue | Positionnement post-quantique |
| Régulation adverse | Pivot requis | Conformité proactive ANSSI |

**Risques Ressources :**

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Solo founder burnout | Arrêt projet | Scope lean, automatisation |
| Budget limité | Features coupées | Priorisation stricte MVP |
| Expertise crypto manquante | Bugs sécurité | Audit externe pré-launch |

---

## Functional Requirements

### Media Capture & Sealing

- FR1: L'utilisateur peut capturer une photo via la caméra de l'appareil dans l'application
- FR2: L'utilisateur peut capturer une vidéo via la caméra de l'appareil dans l'application
- FR3: Le système peut sceller automatiquement un média capturé avec entropie QRNG
- FR4: Le système peut générer une signature post-quantique ML-DSA-65 pour chaque seal
- FR5: Le système peut extraire et inclure les métadonnées de capture (timestamp, GPS si autorisé)
- FR6: L'utilisateur peut activer/désactiver l'inclusion des coordonnées GPS dans le seal
- FR7: Le système peut afficher un badge visuel "Veritas Seal" sur les médias scellés
- FR8: L'utilisateur peut sceller un média même sans connexion réseau (mode offline avec sync ultérieure)
- FR9: L'utilisateur Tier 2 (reporter vérifié) peut importer un média depuis sa galerie pour le sceller

### Verification

- FR10: Tout utilisateur peut vérifier l'authenticité d'un seal en téléchargeant le fichier
- FR11: Le système peut afficher le résultat de vérification (authentique/invalide/altéré)
- FR12: Le système peut afficher les métadonnées du seal vérifié (date, lieu, auteur)
- FR13: L'utilisateur peut vérifier un seal sans créer de compte
- FR14: L'utilisateur peut partager un lien de vérification publique
- FR15: Le système peut indiquer le niveau de confiance du seal (Tier 1/2/3)
- FR16: Le système peut détecter si un média a été altéré depuis le scellement

### User Management

- FR17: L'utilisateur peut créer un compte avec email/mot de passe
- FR18: L'utilisateur peut se connecter à son compte
- FR19: L'utilisateur peut réinitialiser son mot de passe
- FR20: L'utilisateur peut consulter et modifier son profil
- FR21: L'utilisateur peut supprimer son compte et ses données
- FR22: L'utilisateur peut consulter l'historique de ses seals créés
- FR23: L'utilisateur peut exporter ses seals dans un format standard (C2PA)

### Organization Management (B2B)

- FR24: L'admin peut créer une organisation
- FR25: L'admin peut inviter des utilisateurs à rejoindre l'organisation
- FR26: L'admin peut attribuer des rôles (Admin, User, Viewer) aux membres
- FR27: L'admin peut retirer des membres de l'organisation
- FR28: L'owner peut transférer la propriété de l'organisation
- FR29: L'admin peut consulter la liste des seals créés par l'organisation
- FR30: Le système peut isoler les données entre organisations (multi-tenancy)

### API & Integration

- FR31: Un développeur peut créer une clé API pour son organisation
- FR32: Un développeur peut appeler l'endpoint /seal pour sceller un fichier via API
- FR33: Un développeur peut appeler l'endpoint /verify pour vérifier un seal via API
- FR34: Un développeur peut appeler l'endpoint /seals pour lister les seals de son organisation
- FR35: Le système peut limiter le nombre de requêtes API selon le plan d'abonnement
- FR36: Le système peut retourner des erreurs API standardisées et documentées

### Subscription & Billing

- FR37: L'organisation peut consulter son plan d'abonnement actuel
- FR38: L'organisation peut voir son usage (nombre de seals créés)
- FR39: L'organisation peut upgrader son plan d'abonnement
- FR40: Le système peut appliquer les limites selon le plan (seals/mois, users)

### Compliance & Privacy

- FR41: L'utilisateur peut donner son consentement RGPD à l'inscription
- FR42: L'utilisateur peut exporter toutes ses données personnelles
- FR43: L'utilisateur peut demander la suppression de ses médias
- FR44: Le système peut conserver les hashs cryptographiques même après suppression du média
- FR45: L'admin peut consulter les logs d'audit de son organisation

---

## Non-Functional Requirements

### Performance

| NFR | Cible MVP | Cible Growth | Mesure |
|-----|-----------|--------------|--------|
| **NFR-P1**: Temps de scellement end-to-end | < 500ms | < 300ms | P95 latency |
| **NFR-P2**: Temps de vérification | < 200ms | < 100ms | P95 latency |
| **NFR-P3**: Temps de chargement PWA | < 3s | < 2s | First Contentful Paint |
| **NFR-P4**: Fetch QRNG | < 100ms | < 50ms | P95 latency |
| **NFR-P5**: Signature ML-DSA | < 50ms | < 30ms | P95 latency |

### Security

| NFR | Exigence | Standard/Justification |
|-----|----------|------------------------|
| **NFR-S1**: Algorithme signature | ML-DSA-65 uniquement | NIST FIPS 204 post-quantique |
| **NFR-S2**: Source entropie | QRNG certifié ou hardware attesté | Randomité quantique vraie |
| **NFR-S3**: Chiffrement transit | TLS 1.3 minimum | Standard industrie |
| **NFR-S4**: Chiffrement repos | AES-256-GCM | Standard industrie |
| **NFR-S5**: Stockage clés | HSM ou TEE quand disponible | Protection clés privées |
| **NFR-S6**: Hashing mots de passe | Argon2id | Résistance brute-force |
| **NFR-S7**: Validation timestamp | ± 5 secondes de capture | Intégrité temporelle |
| **NFR-S8**: Certificate pinning | QRNG API calls | Prévention MITM |
| **NFR-S9**: Zéro compromission clés | 0 incident | Métrique absolue |

### Reliability & Availability

| NFR | Cible MVP | Cible Growth | Mesure |
|-----|-----------|--------------|--------|
| **NFR-R1**: Disponibilité API | 99.5% | 99.9% | Uptime mensuel |
| **NFR-R2**: Disponibilité PWA | 99.5% | 99.9% | Uptime mensuel |
| **NFR-R3**: Fallback QRNG | < 5s switchover | < 2s | Temps failover |
| **NFR-R4**: Durabilité seals | 99.999999% | 99.999999% | Aucune perte données |
| **NFR-R5**: RPO (Recovery Point) | < 1 heure | < 15 min | Perte données max |
| **NFR-R6**: RTO (Recovery Time) | < 4 heures | < 1 heure | Temps restauration |

### Scalability

| NFR | Cible MVP | Cible Growth | Mesure |
|-----|-----------|--------------|--------|
| **NFR-SC1**: Seals concurrent | 100/sec | 1000/sec | Throughput |
| **NFR-SC2**: Vérifications concurrent | 500/sec | 5000/sec | Throughput |
| **NFR-SC3**: Tenants simultanés | 50 | 500 | Organisations actives |
| **NFR-SC4**: Stockage seals | 1TB | 100TB | Capacité totale |
| **NFR-SC5**: Dégradation graceful | < 20% latency à 80% charge | < 10% | Performance sous charge |

### Integration & Compatibility

| NFR | Exigence | Justification |
|-----|----------|---------------|
| **NFR-I1**: Format export | C2PA JUMBF compatible | Interopérabilité Adobe/Microsoft |
| **NFR-I2**: Navigateurs PWA | Chrome, Safari, Firefox (2 dernières versions) | Couverture marché |
| **NFR-I3**: Appareils PWA | iOS 15+, Android 10+ | Couverture cible |
| **NFR-I4**: API format | REST JSON, OpenAPI 3.0 spec | Standard industrie |
| **NFR-I5**: Sources QRNG | 2+ sources avec failover | Résilience |

### Compliance & Auditability

| NFR | Exigence | Standard |
|-----|----------|----------|
| **NFR-C1**: Conformité RGPD | Complète | Règlement EU 2016/679 |
| **NFR-C2**: Rétention logs audit | 2 ans minimum | Exigence B2B |
| **NFR-C3**: Traçabilité actions | 100% des opérations loggées | Audit trail |
| **NFR-C4**: Hébergement données | EU uniquement | Souveraineté |
| **NFR-C5**: Export données utilisateur | < 48h sur demande | RGPD Art. 20 |
