# Plan d'amélioration veritas-cli

Plan pour porter le CLI au niveau industriel/production.

## Phase 1: Fondations (Priorité Haute) ✅ DONE

### 1.1 Verbosity et Logging structuré

**Fichiers:** `main.rs`, `Cargo.toml`

- [ ] Ajouter `tracing` et `tracing-subscriber` aux dépendances
- [ ] Ajouter flags globaux `-v/--verbose` (répétable) et `-q/--quiet`
- [ ] Configurer `EnvFilter` avec support `RUST_LOG`
- [ ] Remplacer les `println!` par des macros `tracing::{info!, debug!, warn!}`
- [ ] Garder les messages de succès/échec en sortie standard (UX)

```rust
#[derive(Parser)]
struct Cli {
    /// Increase verbosity (-v, -vv, -vvv)
    #[arg(short, long, action = clap::ArgAction::Count, global = true)]
    verbose: u8,

    /// Suppress non-essential output
    #[arg(short, long, global = true)]
    quiet: bool,

    #[command(subcommand)]
    command: Commands,
}
```

### 1.2 ValueEnum pour --format

**Fichier:** `main.rs`

- [ ] Créer enum `OutputFormat` avec `#[derive(ValueEnum)]`
- [ ] Remplacer `format: String` par `format: OutputFormat`

```rust
#[derive(Clone, Copy, ValueEnum, Default)]
enum OutputFormat {
    #[default]
    Cbor,
    Json,
}
```

### 1.3 Support --color

**Fichier:** `main.rs`

- [ ] Ajouter flag global `--color <WHEN>` avec `auto|always|never`
- [ ] Intégrer avec `colored::control::set_override()`

```rust
#[arg(long, global = true, default_value = "auto")]
color: clap::ColorChoice,
```

---

## Phase 2: Robustesse (Priorité Moyenne)

### 2.1 Exit codes structurés

**Fichiers:** `main.rs`, nouveau `src/exit_codes.rs`

- [ ] Créer module `exit_codes` avec constantes sémantiques
- [ ] Mapper les erreurs aux codes appropriés
- [ ] Documenter les codes dans `--help`

```rust
pub mod exit_codes {
    pub const SUCCESS: i32 = 0;
    pub const GENERAL_ERROR: i32 = 1;
    pub const USAGE_ERROR: i32 = 64;      // EX_USAGE
    pub const INPUT_ERROR: i32 = 66;      // EX_NOINPUT
    pub const VERIFICATION_FAILED: i32 = 65; // EX_DATAERR
    pub const NETWORK_ERROR: i32 = 69;    // EX_UNAVAILABLE
}
```

### 2.2 Option --keypair pour seal

**Fichier:** `main.rs`, `commands/seal.rs`

- [ ] Ajouter `--keypair <PATH>` optionnel à la commande seal
- [ ] Charger la keypair depuis fichier si fournie
- [ ] Générer nouvelle keypair si non fournie (comportement actuel)
- [ ] Ajouter `--save-keypair <PATH>` pour sauvegarder la keypair générée

```rust
Seal {
    #[arg(value_name = "FILE")]
    file: PathBuf,

    #[arg(long, value_name = "PATH")]
    keypair: Option<PathBuf>,

    #[arg(long, value_name = "PATH")]
    save_keypair: Option<PathBuf>,
    // ...
}
```

### 2.3 Async sleep dans anchor.rs

**Fichier:** `commands/anchor.rs`

- [ ] Remplacer `std::thread::sleep()` par `tokio::time::sleep()`
- [ ] Rendre `request_airdrop_with_retry` et `wait_for_balance` async

---

## Phase 3: DX et Maintenabilité (Priorité Basse)

### 3.1 Extraction des helpers communs

**Nouveau fichier:** `src/utils.rs`

- [ ] Extraire `build_seal_path()` (utilisé dans seal.rs et verify.rs)
- [ ] Extraire `load_seal()` (parsing CBOR/JSON, utilisé dans verify.rs et anchor.rs)
- [ ] Extraire `format_timestamp()` dans utils

### 3.2 Commande config/init

**Nouveau fichier:** `src/commands/config.rs`

- [ ] Commande `veritas config init` pour créer un profil
- [ ] Générer et stocker keypair dans `~/.config/veritas/`
- [ ] Supporter `VERITAS_KEYPAIR_PATH` env var
- [ ] Commande `veritas config show` pour afficher la config active

### 3.3 Option --dry-run

**Fichiers:** `main.rs`, `commands/seal.rs`, `commands/anchor.rs`

- [ ] Ajouter `--dry-run` / `-n` aux commandes seal et anchor
- [ ] Afficher ce qui serait fait sans exécuter

### 3.4 Amélioration de l'aide

**Fichier:** `main.rs`

- [ ] Ajouter `#[command(after_help = "...")]` avec exemples d'usage
- [ ] Ajouter `#[command(after_long_help = "...")]` avec documentation détaillée

---

## Phase 4: Tests et CI

### 4.1 Tests d'intégration CLI

**Nouveau:** `tests/cli_integration.rs`

- [ ] Utiliser `assert_cmd` pour tester les commandes
- [ ] Tester les exit codes
- [ ] Tester `--help` et `--version`
- [ ] Tester seal/verify roundtrip avec mock

### 4.2 Tests de snapshot pour l'output

- [ ] Utiliser `insta` pour snapshot testing de l'output formaté
- [ ] Couvrir les cas succès/échec/verbose/quiet

---

## Dépendances à ajouter

```toml
# Cargo.toml additions
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Dev dependencies
assert_cmd = "2.0"
predicates = "3.0"
insta = "1.0"
```

---

## Ordre d'implémentation recommandé

1. **Phase 1.2** - ValueEnum (rapide, breaking change mineur)
2. **Phase 1.1** - Verbosity/tracing (fondamental)
3. **Phase 1.3** - --color (rapide)
4. **Phase 2.1** - Exit codes (important pour scripts)
5. **Phase 3.1** - Helpers (refactoring)
6. **Phase 2.3** - Async sleep (fix technique)
7. **Phase 2.2** - Keypair option (feature)
8. **Phase 3.2** - Config command (feature)
9. **Phase 4** - Tests (qualité)
10. **Phase 3.3** - Dry-run (nice-to-have)
11. **Phase 3.4** - Help amélioration (polish)

---

## Critères de succès

- [ ] `veritas --help` affiche aide claire avec exemples
- [ ] `veritas -vvv seal file.jpg` affiche logs détaillés
- [ ] `veritas -q verify file.jpg` n'affiche que succès/échec
- [ ] Exit code 0 pour succès, 65 pour vérification échouée
- [ ] `veritas seal --format invalid` erreur compile-time impossible
- [ ] `veritas --color=never` fonctionne dans CI
- [ ] Tests CLI passent dans CI
