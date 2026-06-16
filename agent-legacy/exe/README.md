# Exécutables de l'agent

Ces fichiers sont générés automatiquement avec `pkg`.

## Fichiers

- `sim-center-agent-win.exe` → agent autonome pour Windows (embarque `PressDriveKey.exe` et le driver ViGEmBus)
- `sim-center-agent-linux` → agent pour Linux

## Utilisation

### Windows

1. Copier `sim-center-agent-win.exe` sur le PC de simulation.
2. Créer un fichier `.env` à côté de l'exécutable (voir `.env.example`).
3. Lancer `sim-center-agent-win.exe` **en administrateur la première fois** pour permettre l'installation automatique du driver ViGEmBus.
4. L'agent extrait automatiquement `tools/PressDriveKey.exe` et installe ViGEmBus si nécessaire, puis démarre.

### Linux

1. Copier `sim-center-agent-linux` sur le PC de simulation.
2. Créer un fichier `.env` à côté de l'exécutable.
3. Lancer depuis le terminal.

## Générer à nouveau

Sur une machine Windows avec le SDK .NET 6.0+ :

```bash
cd agent
npm run build:exe
```

Cette commande effectue automatiquement :

1. Compilation de `PressDriveKey.exe` (`npm run build:tools`).
2. Téléchargement du MSI ViGEmBus (`npm run download:vigem-msi`).
3. Embarquement des binaires dans le code source (`npm run embed:assets`).
4. Compilation TypeScript (`npm run build`).
5. Packaging en un seul exe (`pkg`).

> **Note** : `npm run build:exe` ne fonctionne pas sous Linux car la compilation C# nécessite le SDK .NET pour Windows.
