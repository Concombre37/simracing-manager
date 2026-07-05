# Prompt v0 — Refonte complète SimRacing Manager

Tu es un développeur frontend senior. Refais l’interface complète d’une application React/Tailwind existante. Ne change pas les endpoints API ni la logique métier. Concentre-toi sur le design UI/UX.

---

## 1. Contexte

SimRacing Manager est un dashboard technique pour gérer un centre de simulation racing. Des postes Windows (POD) exécutent Assetto Corsa. Depuis le web, un opérateur admin/technicien peut :

- Voir l’état des POD (online/offline/en jeu)
- Créer des serveurs dédiés Assetto Corsa
- Envoyer des joueurs sur ces serveurs
- Suivre les sessions en cours et la telemetry live
- Gérer les médias de l’écran d’attente

---

## 2. Stack technique (à conserver)

- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3.4 (thème dark déjà configuré)
- React Router DOM v6
- TanStack Query v5
- Axios via `src/services/api.ts`
- Socket.IO client via `src/hooks/useSocket.ts`
- Lucide React pour les icônes
- JWT dans `localStorage.accessToken`

Tu peux utiliser des composants UI existants dans `src/components/ui/` comme base, mais tu es libre de les moderniser.

---

## 3. Design visuel attendu

Style **sim racing / cockpit / premium dark**. Pas d’admin template générique.

Inspirations : dashboards de jeux de course, HUD de cockpit, néons, glassmorphism, grille technique, typographie monospace pour les données chiffrées.

Palette suggérée (à affiner) :

- Fond principal : `#0a0a0f` / `#0f1117`
- Surfaces : `#15171e` / `#1a1d26` avec bordures subtiles `#2a2e3a`
- Accent principal : cyan électrique `#00d4ff`
- Accent secondaire : orange `#ff6b00`
- Succès : `#22c55e`
- Danger : `#ef4444`
- Texte : blanc `#ffffff`, gris `#94a3b8`, gris foncé `#64748b`

Effets : cards avec légère élévation, glow sur les éléments actifs, jauges circulaires pour la telemetry, transitions fluides.

---

## 4. Routes et pages à refaire

Routes existantes à moderniser :

- `/` — Dashboard
- `/stations` — Contrôle des POD
- `/dedicated-servers` — Liste des serveurs dédiés
- `/en-cours` — Sessions actives + telemetry live
- `/leaderboard` — Classements (placeholder, peut rester simple)
- `/settings` — Paramètres réseau
- `/users` — Gestion utilisateurs (admin only)
- `/content-previews` — Preview voitures/circuits (admin only)
- `/blanking-media` — Médias écran d’attente (admin only)
- `/login` — Connexion

Nouvelle route à créer :

- `/dedicated-servers/create` — Wizard de création de serveur en 3 étapes

---

## 5. Données reçues et affichées

### Station (POD)

```ts
interface Station {
  id: string;
  stationId: string; // ex: "desktop-gl3t50t"
  name: string; // ex: "POD 1"
  status: 'offline' | 'online' | 'in_game' | 'updating';
  version: string | null; // ex: "2.2.28"
  localIp: string | null;
  macAddress: string | null;
  lastSeenAt: string | null; // ISO date
  config: Record<string, unknown> | null;
  content: {
    cars: Car[];
    tracks: Track[];
  } | null;
}
```

**Ce qu’on affiche pour chaque POD :**

- Nom + identifiant technique
- Statut coloré (offline = rouge, online = vert, in_game = cyan/orange animé, updating = jaune)
- IP locale, MAC, version agent
- Dernier vu (heure)
- Boutons d’action : Lancer, Stop, MAJ agent, Sync contenu, Wake, Shutdown, Regenerate API key
- Détail expandable : contenu scanné (voitures/circuits), médias blanking

### DedicatedServer

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

**Ce qu’on affiche pour chaque serveur :**

- Nom + statut (stopped/starting/running/error)
- Station hôte
- Circuit + layout
- Nombre de voitures sélectionnées, max clients
- Ports UDP/TCP/HTTP
- Boutons : Démarrer, Arrêter, Envoyer les PODs, Modifier, Supprimer

### Car / Track

```ts
interface Car {
  acId: string; // ex: "alfa_romeo_giulietta_qv"
  name: string;
  brand?: string;
  category?: string;
  preview?: string; // data URL base64 ou URL
}

interface Track {
  acId: string; // ex: "imola"
  name: string;
  layouts: string[];
  preview?: string;
}
```

### Session active

```ts
interface ActiveSession {
  id: string;
  stationId: string;
  clientName?: string; // ex: "rtyj"
  difficulty?: 'EASY' | 'PRO' | 'CUSTOM';
  carAcId?: string; // ex: "alfa_romeo_giulietta_qv"
  track?: string; // ex: "imola"
  trackLayout?: string | null;
  durationMinutes?: number;
  startedAt: string;
  station: {
    id: string;
    name: string;
    status: string;
  };
}
```

### Telemetry live (reçue via Socket.IO)

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
  trackPosition?: number; // 0-1 progression sur le circuit
  isInMainMenu?: boolean;
  isSessionStarted?: boolean;
}
```

**Ce qu’on affiche sur `/en-cours` :**

- Temps restant de la session (calculé depuis `startedAt + durationMinutes`)
- Client, voiture, circuit, difficulté
- Vitesse (km/h)
- RPM
- Rapport engagé
- Position
- Progression piste (%)
- Accélérateur / frein (% barres)
- Meilleur tour / dernier tour
- Jauges circulaires pour RPM et vitesse

### Événements temps réel (Socket.IO namespace `/`)

- `station:updated` → `{ stationId, status }`
- `station:telemetry` → `TelemetrySnapshot`
- `session:updated` → `{ sessionId, stationId, status, durationMinutes? }`

---

## 6. Wizard création serveur — `/dedicated-servers/create`

Transformer le modal `CreateServerModal` existant en une **page wizard en 3 étapes/slides**.

### Étape 1 — Choisir le simulateur hôte

- Liste des stations en ligne (`status === 'online' || 'in_game'`).
- Afficher : nom, stationId, IP, version agent, statut.
- CTA "Synchroniser le contenu" pour recharger cars/tracks.
- Validation : une station doit être sélectionnée.

### Étape 2 — Choisir le circuit

- Grille de cartes Track avec preview.
- Barre de recherche/filtre.
- Sélection d’un layout si `layouts.length > 1`.
- Validation : un circuit doit être sélectionné.

### Étape 3 — Configurer et choisir les voitures

- Champ nom du serveur.
- Slider/stepper nombre de slots (1-40).
- Mot de passe optionnel.
- RCon password optionnel.
- Grille de cartes Car avec preview + sélection multiple.
- Barre de recherche/filtre.
- Récapitulatif visuel final (circuit, nombre de voitures, slots, hôte).
- Validation : nom, voitures sélectionnées, slots > 0.

### Navigation

- Barre de progression en haut avec les 3 étapes.
- Boutons "Précédent", "Suivant", "Créer le serveur".
- Transitions animées entre étapes (slide horizontal).

### Données envoyées à la validation

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

## 7. Pages à moderniser — détails

### `/` Dashboard

- 4 stat cards : postes en ligne, sessions actives, serveurs dédiés, total sessions.
- Liste des POD en ligne avec statut.
- Liste des serveurs running.
- Sessions actives en cours.
- CTA rapide vers `/dedicated-servers/create`.

### `/stations`

- Vue grille de cards POD.
- Chaque card : statut visuel, infos clés, actions rapides.
- Expand pour voir détails/contenu.
- Actions accessibles selon rôle admin/technicien.

### `/dedicated-servers`

- Liste des serveurs sous forme de cards ou tableau premium.
- Badge statut avec indicateur.
- Bouton principal "Nouveau serveur" qui redirige vers `/dedicated-servers/create`.
- Actions : start, stop, join (envoyer les PODs), edit, delete.

### `/en-cours`

- Affichage immersif des sessions actives.
- Pour chaque session : card grande avec telemetry live.
- Jauges circulaires RPM/vitesse.
- Barres throttle/brake.
- Timer temps restant en gros.
- Boutons +1min / +5min / +15min / -1min / Stop.

### `/login`

- Page de connexion dark immersive avec logo/identité sim racing.
- Champs email + mot de passe.

---

## 8. Contraintes techniques

- Ne change pas les endpoints API.
- Ne change pas les types des services.
- Utilise Tailwind CSS uniquement.
- Utilise Lucide React pour les icônes.
- Conserve `useSocket` pour le temps réel.
- Conserve le système de rôles : `isAdmin`, `isTechnician`.
- L’app est utilisée principalement sur desktop/tablette : responsive large obligatoire, mobile nice-to-have.
- Les composants doivent être typés en TypeScript.
- Garder la structure de dossiers existante (`pages/`, `components/`, `services/`).

---

## 9. Livrables attendus

Fournis le code React/TSX/Tailwind complet pour :

1. Nouvelle page `src/pages/CreateDedicatedServer.tsx` (wizard 3 étapes).
2. Modification de `src/App.tsx` pour ajouter la route `/dedicated-servers/create`.
3. Refonte de `src/pages/DedicatedServers.tsx` (pointe vers la nouvelle page).
4. Refonte de `src/pages/Dashboard.tsx`.
5. Refonte de `src/pages/Stations.tsx`.
6. Refonte de `src/pages/Sessions.tsx`.
7. Refonte de `src/pages/Login.tsx`.
8. Refonte de `src/components/Layout.tsx` (sidebar/header).
9. Refonte des composants UI si nécessaire.

Tu peux supprimer `src/components/CreateServerModal.tsx` s’il est remplacé par la page wizard.

---

## 10. Fichiers sources de référence

Pour comprendre la logique actuelle, base-toi sur :

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/components/Layout.tsx`
- `apps/frontend/src/pages/Dashboard.tsx`
- `apps/frontend/src/pages/Stations.tsx`
- `apps/frontend/src/pages/DedicatedServers.tsx`
- `apps/frontend/src/pages/Sessions.tsx`
- `apps/frontend/src/pages/Login.tsx`
- `apps/frontend/src/components/CreateServerModal.tsx`
- `apps/frontend/src/services/dedicatedServers.ts`
- `apps/frontend/src/services/stations.ts`
- `apps/frontend/src/services/sessions.ts`
- `apps/frontend/src/hooks/useSocket.ts`
- `apps/frontend/src/contexts/AuthContext.tsx`

---

Génère maintenant le code complet et moderne. Sois créatif sur le design mais reste fonctionnel et fidèle aux données ci-dessus.
