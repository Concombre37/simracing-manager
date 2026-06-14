# Exécutables de l'agent

Ces fichiers sont générés automatiquement avec `pkg`.

## Fichiers

- `sim-center-agent-win.exe` → à utiliser sur les PC de simulation Windows
- `sim-center-agent-linux` → à utiliser sur Linux

## Utilisation

1. Copier le fichier correspondant sur le PC de simulation
2. Créer un fichier `.env` à côté de l'exécutable (voir `.env.example`)
3. Double-cliquer sur l'EXE ou lancer depuis le terminal

## Générer à nouveau

```bash
cd agent
npm run build:exe
```
