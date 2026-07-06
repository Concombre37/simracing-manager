# Changelog

## v2.2.41 — Blanking basé sur la présence du processus AC (comme RS Launcher)

### Modifié

- **Changement de stratégie pour le retrait du blanking** : après plusieurs corrections infructueuses de l'approche basée sur la télémétrie (mémoire partagée, `isSessionStarted`/`isInMainMenu`, confirmation à 5s), le blanking se base désormais uniquement sur la présence du processus `acs.exe` (déjà détectée de manière fiable par `processMonitor.ts`, sondée toutes les 2s), exactement comme le faisait RS Launcher en production. Toute la logique de confirmation par télémétrie (minuteur de 5s, double source de télémétrie en course) est retirée — elle ne s'est jamais montrée fiable et complexifiait le diagnostic sans bénéfice constaté.
- Nettoyage en conséquence : suppression de `onTelemetry()`/`isReady()`/`updateReadyState()`/`clearReady()` dans `blankingManager.ts`, et de la logique de priorité entre sources de télémétrie ajoutée en v2.2.40 (devenue inutile).

## v2.2.40 — Correction de la vraie cause du blanking qui ne se retire jamais + nettoyage

### Corrigé

- **Cause probable de "le blanking ne se retire jamais"** : deux sources de télémétrie indépendantes (le lecteur de mémoire partagée natif `acSharedMemoryReader.ts`, et le fallback UDP/fichier alimenté par l'app Lua CSP) alimentaient toutes les deux `blankingManager.onTelemetry()`. Si l'une des deux rapportait "pas prêt" pendant qu'une autre rapportait "prêt", le minuteur de confirmation de 5s (`updateReadyState`) était réinitialisé à chaque désaccord — empêchant la confirmation de jamais aboutir, même si la voiture était réellement en piste. Une seule source fait désormais autorité à la fois : la mémoire partagée quand elle est active, le fallback uniquement quand elle ne l'est pas.

### Nettoyé

- Suite à un audit complet du code de l'agent (comparaison avec l'ancien agent "RS Launcher") : suppression de champs et méthodes mortes jamais utilisées (`driving`/`isDriving()`/`lastTelemetryAt` dans `blankingManager.ts`, `cmRunning`/`vrConnected` dans le heartbeat — jamais renseignés ni consommés côté backend/frontend, retirés du contrat partagé `HeartbeatPayload`).

## v2.2.39 — Correction du flicker à l'écran de résultats

### Corrigé

- **Flicker entre l'affichage immédiat et l'affichage final des résultats** : `showResults()` redémarrait entièrement le processus PowerShell/WPF à chaque appel (une fois pour l'affichage immédiat avec spinner, une fois pour le classement final ~3s après), ce qui fermait puis rouvrait visiblement la fenêtre. Le fichier HTML des résultats est maintenant mis à jour sur place : `blanking.ps1` surveille sa propre date de modification et recharge le contenu affiché sans jamais fermer la fenêtre. Un redémarrage du processus ne se produit plus que pour _entrer_ dans l'écran de résultats depuis un autre affichage, pas entre les deux affichages des résultats eux-mêmes.

## v2.2.38 — Correction : fenêtres de blanking/résultats dupliquées

### Corrigé

- **Cause** : les fenêtres de blanking/résultats sont des processus PowerShell/WPF enfants de l'agent. Sur Windows, un processus enfant ne meurt pas automatiquement avec son parent. Or la mise à jour automatique (`system:update`, bouton "MAJ agent") appelait `process.exit(0)` directement sans jamais arrêter cette fenêtre — l'ancienne restait affichée, orpheline, pendant que la nouvelle version de l'agent en spawnait une autre par-dessus. Chaque mise à jour ajoutait donc une fenêtre supplémentaire empilée (exactement ce qui s'est produit avec les nombreuses mises à jour de cette session de correctifs).
- L'agent nettoie désormais systématiquement sa fenêtre de blanking avant de se fermer (mise à jour, arrêt propre) et, en filet de sécurité, tue au démarrage toute fenêtre orpheline laissée par une précédente instance qui aurait crashé sans pouvoir se nettoyer (suivi via un fichier PID).
- **Important** : ce correctif empêche les futures duplications mais ne peut pas nettoyer rétroactivement les fenêtres déjà orphelines actuellement ouvertes sur le POD — il faudra les fermer manuellement (ou redémarrer la machine) une dernière fois après cette mise à jour.

## v2.2.37 — Correction : le blanking ne se retirait jamais pour une jointure sans durée

### Corrigé

- **Cause racine du blanking qui ne se retire jamais** : le lecteur de mémoire partagée AC (seule source fiable pour détecter que la voiture est réellement en piste) n'était démarré, lors d'une jointure de serveur dédié, que si une durée avait été explicitement choisie (`durationMinutes > 0`). Or la modale de jointour a "Illimité" comme option par défaut — donc pour la quasi-totalité des lancements sans durée choisie, le lecteur ne démarrait jamais : le blanking ne pouvait jamais détecter que la voiture était prête et restait affiché indéfiniment, alors même que la télémétrie de base (vitesse/RPM, via le fallback) continuait de s'afficher normalement dans "En cours".
- Le suivi de session (`currentSession`) est désormais toujours activé à la jointure, avec ou sans durée : une session "Illimitée" affiche donc aussi l'écran de résultats à l'arrêt, et peut recevoir une durée après coup via "+15/+30/..." comme une session normale. Seule la programmation de la fin automatique reste conditionnée à l'existence d'une durée.

## v2.2.36 — Correction du flicker au lancement + écran de résultats instantané et animé

### Corrigé

- **Flicker du blanking ~2s après le lancement** : au lancement d'une session, l'agent appelait `setAuto()` (réinitialisation de l'override) puis `setPodInGame(true)` séparément. Entre les deux, `evaluate()` pouvait s'exécuter avec `podInGame` encore à `false` et se baser sur un état `acLoaded`/`acRunning` obsolète (d'une session précédente), retirant le blanking un instant avant qu'il ne soit remis. La réinitialisation de l'override est désormais faite de façon atomique à l'intérieur de `setPodInGame(true)`, supprimant la fenêtre d'incohérence.

### Modifié

- **Écran de résultats instantané** : au lieu d'attendre ~3 secondes (le temps que Assetto Corsa écrive `race_out.json`) avant d'afficher quoi que ce soit, l'écran de résultats apparaît désormais immédiatement avec les informations déjà connues (pilote, voiture, circuit, meilleur tour) et un indicateur de chargement animé à la place du classement, qui se complète dès que disponible.
- **Animation d'apparition** : le titre, la fiche pilote, les tuiles et le classement apparaissent maintenant avec un effet de révélation progressif (fondu + léger glissement vers le haut, en cascade) plutôt que d'un coup.

## v2.2.35 — Correction : le mode kiosque ne doit jamais toucher à la fenêtre du jeu

### Corrigé

- Le mode kiosque (v2.2.34) minimisait potentiellement la fenêtre du jeu lui-même si elle existait déjà (ex. écran de chargement) au moment où l'agent minimise les fenêtres existantes, avant de la remettre au premier plan un instant après. Ce minimize/restore involontaire pouvait perturber le rendu plein écran du jeu et empêcher la télémétrie de signaler correctement une session démarrée — le blanking ne se retirait alors jamais, même si la session apparaissait normalement dans "En cours". Le script `kiosk.ps1` identifie désormais les fenêtres du jeu par leur processus et ne les minimise jamais.

## v2.2.34 — Mode kiosque pendant une session

### Ajouté

- **Mode kiosque** : au lancement d'une session (démarrage direct ou jointure d'un serveur dédié), l'agent masque la barre des tâches Windows, minimise toute fenêtre déjà ouverte (Explorer, etc.) et met la fenêtre du jeu au premier plan une fois qu'elle apparaît. Tout est restauré (barre des tâches réaffichée) dès que la session se termine, quelle que soit la raison (fin normale, réduction à 0, arrêt manuel).
- Nouveau script `kiosk.ps1` (P/Invoke Win32) et module agent `kioskManager.ts`. Windows uniquement ; no-op sur les autres plateformes.

## v2.2.33 — Mise en page verticale de l'écran de résultats

### Modifié

- Les tuiles Circuit/Voiture/Meilleur tour de l'écran de résultats passent d'une disposition en ligne à une disposition en colonne (label à gauche, valeur à droite sur chaque tuile), pour éviter tout chevauchement de texte avec des noms de circuit/voiture longs.

## v2.2.32 — Correction : l'écran de résultats ne s'affichait jamais

### Corrigé

- L'écran de résultats introduit en v2.2.31 ne s'affichait en réalité jamais : `showResults()` change le contenu (HTML) à afficher mais la fenêtre de blanking, si elle était déjà à l'écran à ce moment (ce qui arrive régulièrement, le POD repassant par l'écran d'attente pendant les ~3s de lecture de `race_out.json`), ne redémarrait pas pour prendre en compte ce nouveau contenu — `startBlanking()` ne fait rien si une fenêtre est déjà active. Même problème au retour à la normale après les 60 secondes d'affichage. Le correctif force désormais un redémarrage de la fenêtre à chaque fois que son contenu doit changer (résultats affichés, puis retour à l'écran d'attente normal), sur le même principe déjà utilisé pour la playlist du blanking.
- 2 tests de non-régression ajoutés couvrant explicitement ce scénario.

## v2.2.31 — Écran de résultats systématique et refonte visuelle F1

### Ajouté

- **Écran de fin de session unifié** : le récapitulatif (pilote, voiture, circuit, meilleur tour, classement) s'affiche désormais dans les trois cas de fin de session — fin naturelle du chrono, réduction du temps à 0 via "-", et arrêt manuel ("Stop"). Auparavant seul le premier cas affichait les résultats ; un Stop manuel coupait la session sans rien montrer.
- **Refonte visuelle façon F1** : nouveau design de l'écran de résultats (bandeau damier, titre avec drapeaux à damier, fiche pilote, tuile "Meilleur tour" en violet façon "fastest lap", classement avec badges podium or/argent/bronze).

### Corrigé

- Ajout du mode de rendu IE11 ("edge") pour le contrôle WebBrowser du blanking, nécessaire pour que le CSS moderne de l'écran de résultats s'affiche correctement (au lieu d'un rendu dégradé en mode IE7 par défaut).

## v2.2.30 — Correction blanking bloqué + stop/extend qui n'atteignaient pas l'agent

### Corrigé

- **Blanking bloqué après une intervention manuelle** : fermer le blanking manuellement (Escape, "Masquer écran") pour de la maintenance figeait l'override sur `hide` de façon permanente — la session suivante n'affichait/ne retirait plus jamais le blanking correctement (seul un redémarrage de l'agent réinitialisait l'état). L'agent remet maintenant l'override à `auto` au lancement de toute nouvelle session (lancement direct ou jointure serveur), garantissant un état propre à chaque session.
- **Extend/Stop de session sans effet sur le POD** : les endpoints `POST /sessions/:id/extend` et `POST /sessions/:id/stop` utilisaient l'UUID interne de la station (clé étrangère Prisma) au lieu de son identifiant métier pour cibler la room WebSocket de l'agent — les commandes n'atteignaient donc jamais l'agent (le POD ne recevait ni la nouvelle durée, ni l'ordre d'arrêt), alors que le frontend se mettait à jour normalement (d'où l'impression que "seule la télémétrie disparaît"). Corrigé pour utiliser l'identifiant métier de la station.

## v2.2.29 — Blanking synchronisé sur l'état en jeu + correction du temps restant

### Corrigé

- **Blanking** : l'écran d'attente reste maintenant affiché pendant toute une session tant que la télémétrie n'a pas confirmé que la voiture est réellement prête (5 s), au lieu de disparaître dès que la mémoire partagée AC est mappée (ce qui arrivait encore pendant l'écran de chargement du jeu). Le statut suivi est celui envoyé au backend via `agent:status` (`in_game`/`online`).
- **Temps restant de session** : la réduction de durée (ex. `-5` sur une session de 15 min) n'était plus correctement appliquée sur le POD. L'agent utilise désormais la durée absolue `newDurationMinutes` envoyée par le backend comme source de vérité pour reprogrammer la fin de session, avec repli sur un calcul relatif si la valeur absolue est invalide, et arrêt immédiat si la nouvelle durée est nulle.

### Technique

- Nouvel état `podInGame` dans `BlankingManager`, activé/désactivé aux points d'émission de `agent:status` (lancement, jointure serveur, arrêt, retour aux stands).
- Validation renforcée (`Number.isFinite`) sur `newDurationMinutes` dans `handleSessionExtend`.
- 5 nouveaux tests unitaires couvrant le gating du blanking pendant une session.

## v2.2.28 — Auto-start silencieux Windows

### Ajouté

- **Lanceur invisible Windows** : `start-agent.vbs` est fourni avec l’agent. Il démarre `sim-center-agent-win.exe` sans afficher de fenêtre console.
- **Auto-start avec vérification** : quand `AUTO_START=1`, l’agent écrit/verrouille une entrée dans `HKCU\Software\Microsoft\CurrentVersion\Run` pointant vers `start-agent.vbs`. À chaque démarrage, il vérifie que l’entrée existe et la recrée si nécessaire.
- Le setup SFX et le zip incluent désormais `start-agent.vbs`.

## v2.2.27 — Portage de fonctionnalités RS Launcher

### Ajouté

- **Agent : résultats avec classement** : à la fin d'une session, l'écran de résultats affiche un leaderboard (position, pilote, voiture, tours, meilleur tour) calculé depuis `race_out.json`.
- **Agent : vérification de joignabilité du backend** : l'agent ping `SERVER_URL` avant d'ouvrir le WebSocket et loggue un avertissement clair si le serveur est injoignable.
- **Agent : instance unique** : un verrou TCP sur le port `33291` empêche de lancer deux agents simultanément sur le même poste.
- **Agent : ciblage de l'écran d'attente** : la variable `BLANKING_MONITOR` choisit l'écran d'affichage du blanking/résultats (`1` = principal, `2` = secondaire, etc.).
- **Agent : démarrage automatique Windows** : `AUTO_START=1` enregistre l'agent dans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- **Agent : icône dans la barre des tâches** : `TRAY_ICON=1` affiche une icône Windows avec menu pour basculer le blanking et quitter proprement.
- **Agent : CSV de télémétrie par tour** : enregistrement d'un fichier `laps.csv` (temps au tour, vitesse/RPM max, throttle/brake moyens, meilleur tour) puis envoi au backend via l'événement `agent:telemetry:csv`.
- **Backend : réception du CSV de télémétrie** : sauvegarde dans `uploads/telemetry/<sessionId>.csv`.

## v2.2.14 — Télémétrie, page "En cours", et lancement POD personnalisé

### Ajouté

- Nouvelle page **En cours** (`/en-cours`) remplaçant la télémétrie :
  - Affiche les PODs actuellement en session avec temps restant, client, voiture, circuit, difficulté.
  - Mini widget télémétrie en temps réel (vitesse, RPM, tours, position, progression).
  - Boutons `+5 min`, `+15 min`, `-5 min` et `Stop` pour gérer la session.
- Lancement personnalisé des PODs depuis **Serveurs dédiés** :
  - Nom du client par POD (affiché en jeu via l’app Lua).
  - Difficulté par POD (`EASY` / `PRO` / `CUSTOM`) → écrit les assists côté agent.
  - Voiture différente par POD.
- Backend :
  - Nouveaux champs sur `Session` : `type`, `serverId`, `clientName`, `difficulty`, `carAcId`, `track`, `trackLayout`, `durationMinutes`.
  - Endpoints `GET /api/sessions/active`, `POST /api/sessions/:id/extend`, `POST /api/sessions/:id/stop`.
  - Écoute `agent:status` pour mettre à jour immédiatement le statut d’un POD.
  - Événements WebSocket `session:updated` et `session:extend`.
- Agent :
  - Émission immédiate de `agent:status` `in_game` au join et `online` au stop / fin de durée.
  - Timer de session extensible via `session:extend`.
  - Écriture du nom client dans `client.txt` pour l’app Lua.
  - Application des assists selon la difficulté reçue.
- App Lua :
  - Affichage du nom du client en overlay en haut à gauche pendant une course en ligne.

### Corrigé

- La télémétrie n’apparaissait pas car le statut `in_game` n’était pas mis à jour immédiatement lors d’un join sur serveur dédié.

## v2.2.13 — Envoi des previews sans compression

### Corrigé

- L’agent ne tente plus de compresser les previews avec Jimp (qui échouait dans l’exécutable `pkg` avec `Invalid host defined options`).
- Les previews sont maintenant envoyées brutes en base64, jusqu’à 2 Mo par image.
- Limite côté backend portée à 1 Go pour accepter les gros payloads `agent:content`.
- Invalidation du cache agent (version 6) pour forcer un nouveau scan avec les previews brutes.
- Log du nombre de `carsWithPreview` / `tracksWithPreview` lors de l’envoi du contenu.
- Suppression des dépendances `@jimp/*` de l’agent.

## v2.2.12 — Durée d’envoi des PODs sur un serveur

### Ajouté

- Dans le modal **Envoyer les POD**, choix d’une durée : 15, 30, 45, 60 minutes ou illimité.
- À l’expiration de la durée, l’agent envoie une commande `quit` à Assetto Corsa puis affiche l’écran d’attente (blanking).
- Le backend transmet `durationMinutes` dans la commande `server:join`.

## v2.2.11 — Logs previews et support DDS

### Corrigé

- Ajout de logs explicites dans l’agent quand les previews de voitures/circuits ne sont pas trouvées ou ne peuvent pas être compressées.
- Tentative de conversion des previews `.dds` via ImageMagick (`magick convert`) pour les setups où Assetto Corsa utilise ce format.
- Le backend accepte `stationId` comme UUID ou comme nom de station (`stationId`) lors de la création d’un serveur dédié.

## v2.2.10 — Robustesse config agent (AC_PATH, CM_PATH, SERVER_URL)

### Corrigé

- L’agent expande maintenant les variables d’environnement Windows (`%USERNAME%`, etc.) dans `AC_PATH`, `CM_PATH` et `DOCUMENTS_PATH`.
- Suppression automatique du slash final dans `SERVER_URL` pour éviter les doubles slashes (`https://simracing.hytlabs.com//api/...`).
- Trim des chemins configurés pour éviter les espaces parasites.

## v2.2.9 — Fix auth content sync et debug AC_PATH

### Corrigé

- L’erreur 401 sur `GET /api/content/catalog` est maintenant résolue définitivement : `JwtAuthGuard` n’est plus appliqué au contrôleur `ContentController` entier, il ne protège plus que `POST /api/content/packages` (admin). Les endpoints agents (`catalog`, `download`) passent correctement par `AdminOrStationAuthGuard` avec une clé API `sk_...`.
- L’agent logue au démarrage le chemin réel du `.env` chargé et la valeur de `AC_PATH`, pour faciliter le diagnostic quand le path Assetto Corsa n’est pas détecté.

## v2.2.8 — Fix content sync 401 et réduction taille previews

### Corrigé

- L’endpoint `GET /api/content/catalog` accepte maintenant la clé API de station (via `AdminOrStationAuthGuard`), corrigeant l’erreur 401 lors du content sync.
- Réduction drastique de la taille des previews envoyées par l’agent : 25 Ko max, 192×192, qualité JPEG 65.
- Invalidation du cache agent (version 5) pour forcer la recompression des previews.
- Log de la taille du payload `agent:content` avant envoi.
- Traitement des previews par batch de 25 côté backend pour éviter la saturation de la DB.

## v2.2.7 — Fix auth post-provision et diagnostic WoL Ethernet

### Corrigé

- Mise à jour immédiate de `config.API_KEY` après l’auto-provisionnement, résolvant les erreurs 401 sur `content sync` et d’autres appels HTTP.
- Diagnostic WoL : recherche élargie des propriétés avancées (`*Wake*Magic*`, `*WOL*`, `*Wake on LAN*`).
- Meilleure détection des cartes Ethernet (Realtek, Intel, Marvell, Broadcom, Killer, etc.).

## v2.2.6 — Diagnostic WoL plus fiable

### Corrigé

- Le diagnostic Wake-on-LAN ne considère plus le WoL comme désactivé si `Get-NetAdapterPowerManagement` ne retourne pas d’état de gestion d’alimentation.
- Détection du type d’interface (Wi-Fi / Ethernet) et avertissement si le POD est en Wi-Fi.
- Vérification supplémentaire via `powercfg /devicequery wake_from_any`.
- Nettoyage des caractères parasites dans le nom et la MAC affichés par PowerShell.

## v2.2.5 — Fix diagnostic WoL et sync blanking media

### Corrigé

- Le diagnostic Wake-on-LAN est maintenant exécuté après l’auto-provisionnement, pas seulement au démarrage avec une clé existante.
- Ajout d’un log explicite au démarrage du diagnostic WoL.
- Correction de la synchronisation des médias d’attente juste après le provisionnement : l’agent utilise la clé API reçue au lieu de `config.API_KEY` encore vide.

## v2.2.4 — Diagnostic et amélioration Wake-on-LAN

### Ajouté

- **Diagnostic WoL au démarrage de l’agent** : vérifie et loggue :
  - état du démarrage rapide Windows (Fast Startup) ;
  - cartes réseau actives et leur support Wake-on-LAN ;
  - activation de _Wake on Magic Packet_ ;
  - autorisation de réveil du PC par la carte réseau.
- Envoi du magic packet sur les ports **9 et 7** pour maximiser la compatibilité.
- Envoi en **unicast** vers l’IP cible quand elle est connue, avec fallback broadcast.
- Augmentation du nombre de magic packets envoyés (5 par port).

### Corrigé

- Le relais WoL utilise maintenant l’adresse IP de la station cible quand elle est disponible.

## v2.2.3 — Wake-on-LAN et arrêt distant des PODs

### Ajouté

- **Page Paramètres** (`/settings`) affichant pour chaque POD :
  - IP locale ;
  - adresse MAC ;
  - statut de connexion ;
  - boutons **Allumer** et **Éteindre**.
- **Wake-on-LAN** via relais POD : un POD déjà allumé sur le même sous-réseau envoie le magic packet vers la MAC cible.
- **Arrêt distant** : commande `system:shutdown` envoyée à l’agent, qui exécute `shutdown /s /t 0` sur Windows.
- Collecte automatique de l’adresse MAC par l’agent et envoi dans chaque heartbeat.
- Endpoints REST protégés : `POST /api/stations/:id/wake` et `POST /api/stations/:id/shutdown`.

### Technique

- Nouveau champ `mac_address` sur le modèle Prisma `Station` + migration.
- Extension des contrats `@simracing/shared` : `HeartbeatPayload.macAddress`, `ServerToAgentEvents` (`system:shutdown`, `wol:send`).
- Nouveau module backend `power-management` (service + controller).
- Nouveau module agent `wol.ts` utilisant `wake_on_lan` pour envoyer les magic packets.
- Dépendance agent ajoutée : `wake_on_lan`.

## v2.2.2 — Fix affichage images/vidéos sur l’écran d’attente

### Corrigé

- La playlist d’images/vidéos est maintenant écrite dans un fichier JSON temporaire et passée au script PowerShell par chemin, évitant les problèmes d’échappement des arguments CLI.
- L’écran d’attente affiche correctement les images/vidéos uploadées depuis le site.

## v2.2.1 — Hotfix backend Docker

### Corrigé

- Import `path` corrigé dans `blanking-media.service.ts` (`import * as path`) pour éviter l’erreur `Cannot read properties of undefined (reading 'join')` au démarrage du conteneur.

## v2.2.0 — Blanking screen personnalisable (images & vidéos)

### Ajouté

- **Playlist image/vidéo** pour l'écran d'attente, configurable par station depuis le site.
- Upload via le bouton **Écran d'attente** sur la page Postes : drag & drop, réorganisation, suppression, preview.
- Formats supportés : PNG, JPG, WEBP, MP4, WEBM (max 100 Mo).
- Lecture des vidéos **sans son**, en boucle, avec cross-fade entre les slides.
- Désactivation du blanking dès qu'Assetto Corsa a fini de charger (détection par mémoire partagée `Local\acpmf_*`).
- Synchronisation automatique POD ↔ serveur via l'événement `blanking:mediaUpdated`.

### Technique

- Nouveau modèle Prisma `BlankingMedia` + migration.
- Nouveau module backend `blanking-media` avec endpoints CRUD et téléchargement public.
- Nouveaux contrats Socket.IO : `blanking:mediaUpdated`.
- Nouveaux modules agent : `AcSharedMemoryChecker`, `BlankingMediaSync`.
- Script PowerShell `blanking.ps1` enrichi pour le diaporama.

## v2.1.0 — Mode kiosque / Blanking screen automatisé

### Ajouté

- **Blanking screen** affiché par défaut au démarrage de l'agent, dans les menus et pendant les chargements.
- Retrait automatique du blanking uniquement quand toutes les conditions sont réunies :
  - `acs.exe` est détecté en cours d'exécution ;
  - une session est active (`isSessionStarted`, pas dans le menu principal) ;
  - la télémétrie indique une conduite réelle (vitesse, RPM, rapport, gaz ou frein).
- Fallback conservateur : en cas de doute, le blanking est affiché.
- Commandes manuelles depuis l'interface web :
  - `Masquer écran` (`blanking:hide`) ;
  - `Afficher écran` (`blanking:show`).
- Télémétrie POD temps réel avec fallback fichier `telemetry.json`.
- Fichiers de diagnostic Lua (`lua_loaded.txt`, `lua_update.txt`, `lua_error.txt`).

### Technique

- Nouveaux contrats Socket.IO : `blanking:hide`, `blanking:show`.
- Nouveau `BlankingManager` côté agent utilisant un script PowerShell/WPF pour afficher la fenêtre noire.
- `TelemetrySnapshot` enrichi de `isInMainMenu`, `isSessionStarted`, `isOnlineRace`.
- Tests unitaires `blankingManager.spec.ts` couvrant les scénarios principaux.

## v2.0.26 — Correction écriture telemetry.json

### Corrigé

- L'écriture atomique du fichier `telemetry.json` pouvait échouer sur Windows ; ajout d'un fallback d'écriture directe.

## v2.0.25 — Diagnostics télémétrie

### Ajouté

- Fichiers de diagnostic Lua pour tracer le chargement de l'app et l'état du stream.

## v2.0.24 — Dashboard POD temps réel

### Ajouté

- Page `/telemetry` affichant vitesse, RPM, meilleur tour, position, progression piste.
- Stream UDP local depuis l'app CSP Lua vers l'agent.
- Fallback HTTP et fichier pour la télémétrie.
