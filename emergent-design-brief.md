# Brief design — SimRacing Manager

> Fichier prêt à être envoyé à **https://app.emergent.sh/** pour générer un nouveau visuel / redesign du frontend.

---

## 1. Objectif

Moderniser l’interface de **SimRacing Manager** (web app React) tout en conservant sa structure fonctionnelle.  
On cherche un rendu **premium, technique et immersif**, inspiré de l’univers sim-racing / motorsport, mais lisible au quotidien par des techniciens.

---

## 2. Produit & cible

**SimRacing Manager** est une plateforme de gestion technique pour centres de simulation automobile.

- Gestion à distance de postes (POD) Windows équipés d’un agent local.
- Lancement / arrêt d’Assetto Corsa, contrôle de serveurs dédiés.
- Wake-on-LAN, shutdown, upload d’écrans d’attente, synchronisation de contenu (voitures / circuits).
- Télémétrie et classement des sessions.

**Utilisateurs** : administrateurs et techniciens de centre de sim-racing.  
**Langue de l’interface** : français (labels, boutons, titres).

---

## 3. Accès & environnements

- **Site public actuel** : https://simracing.hytlabs.com/
- **Repo GitHub** : https://github.com/Concombre37/simracing-manager
- **Stack frontend** : React 18 + TypeScript + Vite + Tailwind CSS 3.4 + TanStack Query + Axios + Socket.IO-client + Lucide React.
- **Icônes** : [Lucide](https://lucide.dev/) uniquement.
- **Typographie actuelle** : Inter, system-ui, sans-serif.
- **Build** : le backend NestJS sert le dossier `apps/frontend/dist` en production.

> ⚠️ **Ne pas partager les identifiants admin dans ce brief.** Les accès back-office ne sont pas nécessaires à un redesign visuel.

---

## 4. Design system actuel

### Palette

```css
/* Fonds */
--dark-900: #0a0a0f; /* page background */
--dark-800: #12121a; /* cards / panels */
--dark-700: #1a1a25; /* hover surfaces */
--dark-600: #252536; /* borders, separators */

/* Accents */
--accent-orange: #ff6b35; /* CTA, logo "SIM", statut actif */
--accent-blue: #00d4ff; /* info, online, telemetry */
--accent-red: #ff3333; /* danger, offline, arrêt */

/* Feedback */
--green: #22c55e; /* success / online */
--yellow: #eab308; /* warning / updating */
--purple: #a855f7; /* special states */
```

### Typographie

- Police : `Inter`, fallback `system-ui, sans-serif`.
- Titres : `font-bold` voire `font-black tracking-tight`.
- Corps : `text-sm` / `text-base`, gris `gray-400` sur fond sombre.

### Composants existants

| Composant          | Rôle                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| `Card`             | `bg-dark-800 rounded-xl border border-dark-600 shadow-lg p-6`                        |
| `Button`           | primary (orange), secondary (dark-600), danger (red), success (green), ghost         |
| `Input` / `Select` | fond `dark-900`, bordure `dark-600`, focus `accent-blue`                             |
| `Badge`            | pastille colorée avec bordure (`green`, `red`, `yellow`, `blue`, `purple`, `gray`)   |
| `Modal`            | overlay sombre + carte centrée                                                       |
| `Layout`           | navbar sticky `h-16 bg-dark-800 border-b border-dark-600` + main `max-w-7xl mx-auto` |

### Logo actuel (texte)

```
SIMRACING MANAGER
"SIM" en accent-orange (#ff6b35), "RACING" en blanc, "MANAGER" en petit gris.
```

Aucun logo image n’existe aujourd’hui.

---

## 5. Architecture des pages & navigation

Layout commun : navbar sticky en haut, contenu dans `max-w-7xl` centré.

### Navigation principale (tous les utilisateurs authentifiés)

| Route                | Label      | Icône Lucide      | Description                    |
| -------------------- | ---------- | ----------------- | ------------------------------ |
| `/`                  | Dashboard  | `LayoutDashboard` | Vue d’ensemble temps réel      |
| `/stations`          | Postes     | `Monitor`         | Contrôle des POD sim-racing    |
| `/dedicated-servers` | Serveurs   | `Server`          | Gestion des serveurs dédiés AC |
| `/leaderboard`       | Classement | `Trophy`          | Classement des pilotes         |
| `/telemetry`         | Télémétrie | `Activity`        | Données de télémétrie          |

### Navigation admin (segmentée visuellement à droite dans la navbar)

| Route               | Label        | Icône Lucide  | Description                   |
| ------------------- | ------------ | ------------- | ----------------------------- |
| `/users`            | Utilisateurs | `Users`       | Gestion des comptes           |
| `/content-previews` | Images       | `Image`       | Aperçus voitures / circuits   |
| `/blanking-media`   | Écrans       | `MonitorPlay` | Écrans d’attente des stations |
| `/settings`         | Paramètres   | `Settings`    | Infos réseau, WoL, shutdown   |

### Page de login (`/login`)

- Centrée verticalement.
- Logo texte + sous-titre "Manager technique".
- Card avec email, mot de passe, bouton "Connexion" primary full-width.

---

## 6. Pages clés à redesigner

### 6.1 Dashboard (`/`)

Sections :

1. **En-tête** : titre "Dashboard technique" + sous-titre.
2. **Stats cards** (4 cartes en grille) :
   - Postes en ligne
   - Sessions actives
   - Serveurs dédiés
   - Total sessions
3. **Deux colonnes** :
   - Gauche (2/3) : carte "État des postes" avec liste des 4 premières stations et badge de statut.
   - Droite (1/3) : carte "Accès rapide" avec liens vers Stations / Serveurs / Classement / Utilisateurs.

### 6.2 Stations (`/stations`)

- Titre + bouton "Nouveau poste" (admin).
- Liste / grille de cartes par station.
- Chaque station affiche : nom, ID, statut, version, IP/MAC, actions (lancer, arrêter, configurer, régénérer clé API, supprimer).
- Modal "Envoyer les POD" pour rejoindre un serveur dédié avec durée.

### 6.3 Dedicated Servers (`/dedicated-servers`)

- Liste des serveurs Assetto Corsa dédiés.
- Création / édition / suppression.
- Boutons pour rejoindre / arrêter.

### 6.4 Leaderboard (`/leaderboard`)

- Page actuellement très simple / placeholder.
- **Opportunité** : faire un vrai tableau de classement avec filtres, avatar pilote, temps au tour, voiture, circuit.

### 6.5 Telemetry (`/telemetry`)

- Affichage de données techniques (vitesse, freinage, accélération, etc.).
- Potentiel pour des graphiques et des jauges.

### 6.6 Admin — Users, Content Previews, Blanking Media, Settings

- Pages de gestion sous forme de tableaux + modals.
- Garder une cohérence de formulaires et de badges.

---

## 7. Direction créative souhaitée

### Ambiance

- **Dark-first** (obligatoire — utilisée dans un environnement technique / salle de sim-racing souvent sombre).
- **Premium / motorsport** : lignes épurées, angles légèrement agressifs, éventuellement subtle gradient / glassmorphism.
- **Hiérarchie claire** : les statuts et actions doivent être identifiables en un coup d’œil.

### Suggestions d’évolution

- Conserver le **orange #ff6b35** comme couleur principale, mais l’utiliser avec parcimonie (CTA, statuts actifs, highlights).
- Ajouter un **bleu électrique / cyan** secondaire pour la télémétrie et les données temps réel.
- Introduire des **éléments visuels racing** : bandes, drapeaux à damier subtils, jauges type cockpit.
- Améliorer le **Leaderboard** pour qu’il ressemble à un vrai classement e-sport / championnat.
- Donner plus de profondeur aux cartes (ombres, gradients subtils, bordures lumineuses sur hover).
- Proposer un **vrai logo** (pas seulement du texte) — pictogramme évoquant volant / cockpit / circuit.

### Inspiration F1 / motorsport

Le design doit s’inspirer fortement de l’univers **Formule 1** et des livrées de monoplaces / centres de course professionnels.

**Palette et matériaux**

- Fond en **carbone foncé** ou noir mat (`#0a0a0f` / `#0d0d12`) avec une texture de weave carbone très subtile.
- Surfaces secondaires façon **fibre de carbone brossée** ou aluminium anodisé (`#12121a`, `#1a1a25`).
- Accents **orange F1 McLaren / Papaya** (`#ff6b35`) pour les actions principales, les statuts actifs et les highlights.
- Accents **cyan néon** (`#00d4ff`) pour la télémétrie, les données temps réel, les graphes — comme les LED d’un volant F1.
- Rouge vif (`#ff3333`) pour les arrêts d’urgence, les statuts offline, les erreurs — évoquant les **drapeaux rouges** et les zones de freinage.

**Éléments graphiques**

- Lignes de trajectoire de circuit ou portions de **tracé de circuit** utilisées comme séparateurs décoratifs.
- **Damier à damier** (chequered flag) subtil sur les headers, badges de fin de session ou états "terminé".
- **Bandes de livrée** obliques ou latérales sur les cartes et le header, façon ailerons / flancs de monoplace.
- Jauges circulaires / barres de progression façon **dashboard de cockpit** (tours/min, température, ERS, DRS).
- Effets de **glow / halo** autour des éléments actifs ou en hover, comme les LED du volant ou des ailes.
- Ombres portées profondes et reflets subtils pour l’effet **vernis brillant / peinture de carrosserie**.

**Typographie**

- Titres : police **condensée, bold, racing** (style F1, Druk, Titillium Web, Rajdhani, Orbitron) avec un léger effet italique dynamique.
- Données chiffrées / statuts : chiffres tabulaires à espacement fixe (`font-variant-numeric: tabular-nums`) pour l’aspect **chronométrage / tableau de bord**.
- Corps de texte : conserver Inter pour la lisibilité.

**Composants inspirés F1**

- **Bouton primary** : style "launch control" — fond orange, bords nets, icône de drapeau à damier ou de volant.
- **Badges de statut** : pastilles façon LED de voiture de sécurité ou drapeaux (vert = online, jaune = warning, rouge = offline, bleu = in_game).
- **Cartes** : coins légèrement biseautés ou bordures fines façon aileron / splitter.
- **Leaderboard** : tableau façon grille de départ F1 avec positions, temps au tour, écarts (+0.000), voitures et drapeaux de nationalité.
- **Telemetry** : graphes en courbes façon télémétrie F1 (vitesse, freinage, accélération, virages) avec un curseur temporel.
- **Login** : fond sombre avec une ligne de circuit ou un volant stylisé en filigrane.

**Moodboard mentale**

- Pit wall McLaren F1 / Red Bull Racing.
- Dashboard d’une monoplace (volant, écran central).
- Stand de box : moniteurs techniques, lumières LED, carbone, aluminium.
- Livrée 2024 des monoplaces (noir mat + accents orange/rouge/cyan).

### Ce qu’il faut éviter

- Ne pas passer en light mode.
- Ne pas utiliser de bibliothèque d’icônes autre que Lucide (sauf si tu fournis le code compatible).
- Ne pas casser la structure des routes / la logique métier.
- Pas de grandes images lourdes — l’app est servie par le backend et utilisée sur du matériel technique.

---

## 8. Contraintes techniques

- **Framework** : React 18 + TypeScript + Vite.
- **CSS** : Tailwind CSS 3.4.
- **Icons** : `lucide-react`.
- **State / data** : TanStack Query (`useQuery`, `useMutation`).
- **Temps réel** : Socket.IO-client (`useSocket.ts`).
- **Auth** : JWT stocké dans `localStorage.accessToken`.
- **Responsive** : desktop prioritaire, mais mobile acceptable (navbar collapse, grilles 1→2→4 colonnes).
- **Accessibilité** : contrastes suffisants, focus visibles, états de chargement.

---

## 9. Livrables attendus

Pour chaque page / composant redesigné, fournir :

1. **Fichiers React `.tsx`** (fonctionnels, TypeScript).
2. **Classes Tailwind** utilisées, cohérentes avec le design system.
3. **Mise à jour du `tailwind.config.js`** si de nouvelles couleurs / fonts sont ajoutées.
4. **Mise à jour de `index.css`** si de nouveaux composants utilitaires sont nécessaires.
5. **Aperçu visuel** ou description du résultat attendu.

### Priorité

1. Login + Dashboard + Navbar (impact immédiat).
2. Stations + Dedicated Servers (pages métier principales).
3. Leaderboard + Telemetry (expérience pilote / data).
4. Pages admin (Users, Content Previews, Blanking Media, Settings).

---

## 10. Fichiers sources importants

```
sim-center-manager/
├── apps/frontend/src/
│   ├── App.tsx                 # routes
│   ├── index.css               # base Tailwind + utilitaires
│   ├── components/Layout.tsx   # navbar + layout global
│   ├── components/ui/          # Card, Button, Input, Badge, Modal
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Stations.tsx
│   │   ├── DedicatedServers.tsx
│   │   ├── Leaderboard.tsx
│   │   ├── Telemetry.tsx
│   │   ├── Users.tsx
│   │   ├── ContentPreviews.tsx
│   │   ├── BlankingMedia.tsx
│   │   └── Settings.tsx
│   └── services/               # appels API (à conserver)
├── apps/frontend/tailwind.config.js
└── apps/frontend/index.html
```

---

## 11. Notes pour Emergent

- Respecter les **routes existantes** ; ne pas renommer les pages.
- Conserver les **noms de fichiers** et l’**architecture dossiers**.
- Les appels API (`services/*.ts`) et le contexte d’auth (`AuthContext.tsx`) doivent rester inchangés.
- Tu peux réorganiser / enrichir les composants UI dans `components/ui/`.
- Le but est un **redesign visuel + UX**, pas une refonte fonctionnelle.
