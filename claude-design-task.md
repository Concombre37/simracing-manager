# Tâche Claude Code — Refonte UI complète SimRacing Manager

## Objectif

Refaire entièrement le design frontend de SimRacing Manager avec un style **sim racing / cockpit / premium dark**. La feature prioritaire est de transformer la création de serveur dédié (actuellement une modal) en une **vraie page wizard en 3 étapes/slides** sur `/dedicated-servers/create`.

---

## Localisation du projet

```
/root/sim-center-manager
```

Le frontend est dans :

```
/root/sim-center-manager/apps/frontend
```

---

## Stack technique (ne pas changer)

- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3.4
- React Router DOM v6
- TanStack Query v5
- Axios (configuré dans `src/services/api.ts`)
- Socket.IO client (`src/hooks/useSocket.ts`)
- Lucide React (icônes)
- JWT auth via `src/contexts/AuthContext.tsx`

---

## Fichiers à lire avant de commencer

Lis ces fichiers pour comprendre la structure actuelle :

1. `/root/sim-center-manager/apps/frontend/src/App.tsx` — routes
2. `/root/sim-center-manager/apps/frontend/src/components/Layout.tsx` — layout global
3. `/root/sim-center-manager/apps/frontend/src/pages/Dashboard.tsx`
4. `/root/sim-center-manager/apps/frontend/src/pages/Stations.tsx`
5. `/root/sim-center-manager/apps/frontend/src/pages/DedicatedServers.tsx`
6. `/root/sim-center-manager/apps/frontend/src/pages/Sessions.tsx`
7. `/root/sim-center-manager/apps/frontend/src/pages/Login.tsx`
8. `/root/sim-center-manager/apps/frontend/src/components/CreateServerModal.tsx` — logique de création actuelle
9. `/root/sim-center-manager/apps/frontend/src/services/dedicatedServers.ts`
10. `/root/sim-center-manager/apps/frontend/src/services/stations.ts`
11. `/root/sim-center-manager/apps/frontend/src/services/sessions.ts`
12. `/root/sim-center-manager/apps/frontend/src/hooks/useSocket.ts`

---

## Données et types (ce que l’app reçoit et affiche)

### Station (POD)

Fichier : `apps/frontend/src/services/stations.ts`

```ts
interface Station {
  id: string;
  stationId: string; // ex: "desktop-gl3t50t"
  name: string; // ex: "POD 1"
  status: 'offline' | 'online' | 'in_game' | 'updating';
  version: string | null; // ex: "2.2.28"
  localIp: string | null;
  macAddress: string | null;
  lastSeenAt: string | null;
  config: Record<string, unknown> | null;
  content: Record<string, unknown> | null; // contient { cars: Car[], tracks: Track[] }
}
```

### DedicatedServer

Fichier : `apps/frontend/src/services/dedicatedServers.ts`

```ts
interface DedicatedServer {
  id: string;
  name: string;
  stationId: string;
  station: Station;
  track: string;
  trackLayout: string | null;
  cars: string[];
  maxClients: number;
  password: string | null;
  rconPassword: string | null;
  status: 'stopped' | 'starting' | 'running' | 'error';
  udpPort: number | null;
  tcpPort: number | null;
  httpPort: number | null;
  startedAt: string | null;
  endedAt: string | null;
}
```

### Car / Track

```ts
interface Car {
  acId: string;
  name: string;
  brand?: string;
  category?: string;
  preview?: string; // data URL base64 ou URL
}

interface Track {
  acId: string;
  name: string;
  layouts: string[];
  preview?: string;
}
```

### Session active

Fichier : `apps/frontend/src/services/sessions.ts`

```ts
interface ActiveSession {
  id: string;
  stationId: string;
  clientName?: string;
  difficulty?: 'EASY' | 'PRO' | 'CUSTOM';
  carAcId?: string;
  track?: string;
  trackLayout?: string | null;
  durationMinutes?: number;
  startedAt: string;
  station: { id: string; stationId: string; name: string; status: string };
}
```

### Telemetry live (Socket.IO)

```ts
interface TelemetrySnapshot {
  stationId: string;
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number; // 0-1
  brake: number; // 0-1
  steering: number;
  lapTimeMs?: number;
  bestLapMs?: number;
  lastLapMs?: number;
  lapCount?: number;
  position?: number;
  trackPosition?: number; // 0-1
  isInMainMenu?: boolean;
  isSessionStarted?: boolean;
}
```

Événements Socket.IO (namespace `/`) :

- `station:updated` → `{ stationId, status }`
- `station:telemetry` → `TelemetrySnapshot`
- `session:updated` → `{ sessionId, stationId, status, durationMinutes? }`

---

## Routes à implémenter

Routes existantes à refaire :

- `/` — Dashboard
- `/stations` — Contrôle des POD
- `/dedicated-servers` — Liste serveurs
- `/en-cours` — Sessions actives + telemetry
- `/leaderboard` — Placeholder classements
- `/settings` — Paramètres réseau
- `/users` — Admin
- `/content-previews` — Admin
- `/blanking-media` — Admin
- `/login` — Connexion

Nouvelle route à créer :

- `/dedicated-servers/create` — Wizard création serveur

---

## Design attendu

Style **sim racing / cockpit / premium dark**.

Palette suggérée :

- Fond : `#0a0a0f`, `#0f1117`
- Surfaces : `#15171e`, `#1a1d26`
- Bordures : `#2a2e3a`
- Accent : `#00d4ff` (cyan)
- Accent secondaire : `#ff6b00` (orange)
- Succès : `#22c55e`
- Danger : `#ef4444`
- Texte : `#ffffff`, `#94a3b8`, `#64748b`

Effets : glassmorphism léger, glow sur éléments actifs, jauges circulaires, transitions fluides, typographie monospace pour les données chiffrées.

---

## Wizard création serveur — `/dedicated-servers/create`

### Étape 1 — Choisir le simulateur

- Liste des stations `online` ou `in_game`.
- Afficher : nom, stationId, IP, version, statut.
- Bouton "Synchroniser le contenu".
- Validation : une station sélectionnée.

### Étape 2 — Choisir le circuit

- Grille de cartes Track avec preview.
- Recherche/filtre.
- Sélection de layout si disponible.
- Validation : un circuit sélectionné.

### Étape 3 — Configuration + voitures

- Nom du serveur.
- Nombre de slots (1-40).
- Mot de passe optionnel.
- RCon password optionnel.
- Grille de cartes Car avec preview, sélection multiple.
- Recherche/filtre.
- Récapitulatif visuel final.
- Validation : nom, voitures sélectionnées, slots > 0.

### Navigation

- Barre de progression (étapes 1 → 2 → 3).
- Boutons Précédent / Suivant / Créer le serveur.
- Transitions slide entre étapes.

Données envoyées à la validation (même payload que l’ancien modal) :

```ts
{
  name: string;
  stationId: string;
  track: string;
  trackLayout?: string;
  cars: string[];
  maxClients: number;
  password?: string;
  rconPassword?: string;
}
```

---

## Pages à moderniser — indications

### `/` Dashboard

- 4 stat cards : postes en ligne, sessions actives, serveurs dédiés, total sessions.
- Liste des POD en ligne.
- Liste des serveurs running.
- Sessions actives.
- CTA rapide vers `/dedicated-servers/create`.

### `/stations`

- Grille de cards POD.
- Statut visuel, infos clés, actions rapides.
- Expand pour détails/contenu.

### `/dedicated-servers`

- Cards ou tableau premium des serveurs.
- Statut avec indicateur.
- Bouton "Nouveau serveur" → `/dedicated-servers/create`.
- Actions start/stop/join/edit/delete.

### `/en-cours`

- Cards sessions immersives.
- Jauges circulaires RPM/vitesse.
- Barres throttle/brake.
- Timer temps restant en gros.
- Boutons +1min / +5min / +15min / -1min / Stop.

### `/login`

- Page connexion dark immersive.
- Email + mot de passe.

---

## Contraintes

- Ne change **aucun endpoint API**.
- Ne change **aucun type** dans `src/services/`.
- Utilise **Tailwind CSS** uniquement.
- Utilise **Lucide React** pour les icônes.
- Conserve `useSocket` pour le temps réel.
- Conserve `AuthContext` pour les rôles.
- TypeScript strict.
- Desktop first, tablette OK, mobile nice-to-have.
- Garde la structure de dossiers existante.

---

## Livrables

Fichiers à créer/modifier :

1. **Créer** `/root/sim-center-manager/apps/frontend/src/pages/CreateDedicatedServer.tsx`
2. **Modifier** `/root/sim-center-manager/apps/frontend/src/App.tsx` — ajouter la route `/dedicated-servers/create`
3. **Modifier** `/root/sim-center-manager/apps/frontend/src/pages/DedicatedServers.tsx` — CTA vers la nouvelle page + refonte liste
4. **Supprimer** ou laisser `/root/sim-center-manager/apps/frontend/src/components/CreateServerModal.tsx` (remplacé par la page)
5. **Modifier** `/root/sim-center-manager/apps/frontend/src/components/Layout.tsx`
6. **Modifier** `/root/sim-center-manager/apps/frontend/src/pages/Dashboard.tsx`
7. **Modifier** `/root/sim-center-manager/apps/frontend/src/pages/Stations.tsx`
8. **Modifier** `/root/sim-center-manager/apps/frontend/src/pages/Sessions.tsx`
9. **Modifier** `/root/sim-center-manager/apps/frontend/src/pages/Login.tsx`
10. **Modifier** au besoin les composants dans `/root/sim-center-manager/apps/frontend/src/components/ui/`

---

## Pour tester

Après modifications :

```bash
cd /root/sim-center-manager
npm run typecheck --workspace=@simracing/frontend
npm run build --workspace=@simracing/frontend
npm run build --workspace=@simracing/backend
docker compose up -d --build backend
```

---

Commence par lire les fichiers sources listés, puis génère le code React/TSX/Tailwind complet.
