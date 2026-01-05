# Veritas Q - Web Client

Frontend Next.js pour la plateforme Veritas Q. Application PWA permettant de sceller et vérifier des médias via l'API Rust.

## Lancement

```bash
# 1. Lancer le serveur API Rust (depuis la racine du projet)
cargo run -p veritas-server --release

# 2. Lancer le frontend (dans un autre terminal)
cd www
bun install
bun dev
```

Ouvrir [http://localhost:3001](http://localhost:3001) dans le navigateur.

## Scripts

```bash
bun dev          # Serveur de développement
bun run build    # Build production
bun start        # Serveur production
bun lint         # Vérification ESLint
```

## Structure

```
www/
├── app/
│   ├── layout.tsx      # Layout avec header/footer responsive
│   ├── page.tsx        # Page principale avec onglets Scan/Check
│   └── globals.css     # Thème Veritas (Midnight Black + Quantum Green)
├── components/
│   ├── CameraCapture.tsx   # Capture caméra + scellement quantique
│   └── Verifier.tsx        # Drag & drop + vérification de sceau
└── public/
    └── manifest.json       # Configuration PWA
```

## Configuration

| Variable | Description | Défaut |
|----------|-------------|--------|
| `NEXT_PUBLIC_API_URL` | URL du serveur Rust | `http://localhost:3000` |
