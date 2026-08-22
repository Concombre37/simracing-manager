# Changelog

## v2.2.143 — robots.txt valide (28 erreurs signalées par Google Search Console)

### Changé

- **Demandé par l'utilisateur ("Le fichier robots.txt n'est pas valide 28 erreurs détectées")**. Aucun fichier `robots.txt` n'existait dans le projet — `GET /robots.txt` retombait sur le fallback SPA générique (`@nestjs/serve-static`) et renvoyait `index.html`. Cloudflare **injecte automatiquement** un bloc de règles pour les robots IA en tête de toute réponse `/robots.txt` (`# BEGIN/END Cloudflare Managed Content`, hors de notre contrôle) puis **concatène la réponse de l'origine juste après** — le HTML de la SPA se retrouvait donc collé à la suite d'un robots.txt par ailleurs valide, d'où les 28 lignes en erreur côté Search Console (chaque balise HTML lue comme une directive invalide).
- Nouveau `apps/frontend/public/robots.txt` (même convention que `vite.svg`/`logo-elsass-simracing.svg` — copié tel quel dans `dist/` par Vite, servi par le serveur statique générique avant même d'atteindre le fallback SPA) : `User-agent: *` / `Disallow: /`. **Choix assumé** : ce domaine est un outil de gestion interne (dashboard admin + tablette kiosque sur site pour `/tablet-menu`), aucun intérêt à être indexé par un moteur de recherche — confirmé avec l'utilisateur plutôt que supposé.
- Vérifié : `GET /robots.txt` sur l'origine renvoie désormais du texte brut (`Content-Type: text/plain`) au lieu de tomber sur le fallback HTML ; via Cloudflare, le fichier public se termine proprement par nos directives valides après le bloc géré par Cloudflare.

## v2.2.142 — Préchargement du chunk JS de /tablet-menu

### Changé

- **Demandé par l'utilisateur, après un deuxième rapport PageSpeed** ("network-dependency-tree-insight" toujours signalé) : la chaîne HTML → bundle principal → chunk `TabletMenu` (chargé à la demande depuis v2.2.141) → appels API s'exécutait entièrement en série — le chunk de la page n'était découvert par le navigateur qu'une fois le bundle principal téléchargé, parsé **et exécuté** (React monté, route résolue, `import()` dynamique déclenché).
- **`TabletMenuHtmlController`** (nouveau module `tablet-menu-html/`) sert désormais `/tablet-menu` à la place du serveur statique générique (exclu explicitement de `ServeStaticModule` et du préfixe global `/api`, voir `app.module.ts`/`main.ts`) : injecte un `<link rel="modulepreload" href="/assets/TabletMenu-<hash>.js">` dans le `<head>` avant de renvoyer `index.html`. Le nom de fichier hashé (change à chaque build Vite) est résolu par lecture du dossier `assets/` au premier accès, pas en dur. **Scopé à cette seule route** plutôt qu'ajouté à `index.html` globalement — sinon chaque page admin aurait aussi préchargé ~9 Ko de JS qu'elle n'utilise jamais, à l'exact inverse du découpage de bundle fait en v2.2.141.
- **Bug de chemin corrigé en cours de route** : le contrôleur vivant dans son propre sous-dossier de module (un niveau de plus que `app.module.ts`, à la racine de `dist/`), le calcul `join(__dirname, '../../..', ...)` copié tel quel pointait vers `/app/apps/apps/frontend/dist` (inexistant) au lieu de `/app/apps/frontend/dist` — corrigé en `../../../..` (un niveau de remontée supplémentaire).
- **Vérifié au niveau réseau** (Lighthouse mobile réel, champ `networkRequestTime` de chaque requête) : `TabletMenu-*.js` démarre désormais son téléchargement au même instant que le bundle principal (~128ms tous les deux) au lieu d'attendre son exécution complète — un aller-retour réseau supprimé du chemin critique. Le score global (89 en v2.2.141) ne bouge pas de façon significative sur cette seule mesure (bruit de simulation de débit mobile ±4-5 points d'un run à l'autre) ; l'audit "network-dependency-tree-insight" reste signalé (les appels API dépendent toujours de l'exécution du chunk pour se déclencher — inhérent à une SPA sans rendu serveur, pas contournable sans réécrire l'architecture de la page).

## v2.2.141 — Score PageSpeed mobile de /tablet-menu : 55 → 89

### Changé

- **Demandé par l'utilisateur, rapport PageSpeed Insights mobile à l'appui ("j'ai pas encore 100%")**. Trois causes distinctes trouvées et corrigées :
  1. **Images cataloguées jamais redimensionnées** — la conversion WebP de v2.2.140 recompressait le format mais ne touchait pas aux dimensions : des captures voiture jusqu'à **4088×2300px** (9,4 Mpx) étaient servies telles quelles pour un affichage catalogue qui ne dépasse jamais ~1180px CSS (modale détail). `StationsService.upsertPreview()` passe désormais `maxDimension: 2000` à `optimizeToWebp()` (`ArcadeService.setPhoto()` l'avait déjà). **Deuxième migration one-off** (script non commité) : relit les octets **pré-WebP originaux** depuis la sauvegarde `pg_dump` prise avant la migration v2.2.140 (restaurée dans une base scratch le temps du script, supprimée ensuite) plutôt que de repartir du WebP déjà compressé, pour éviter une double perte de qualité. 1733 `ContentPreview` + 59 `ContentLabel.layoutImage` retraités, 0 échec — `content_previews` passe de 65 Mo à 60 Mo en base, mais surtout plus aucune image au-delà de 2000px (contre 66 images voiture qui dépassaient 2000px avant, la pire à 4088×2300 → 2000×1125, 329 Ko → 130 Ko sur le réseau).
  2. **`/tablet-menu` chargeait tout le bundle JS du dashboard admin** — `App.tsx` important chaque page en statique, une tablette cliente publique sans compte téléchargeait/parsait/évaluait le code de Dashboard, Stations, Users, Arcade, etc. en plus du sien (148 Ko de JS jamais utilisé sur cette page, gros contributeur au Total Blocking Time). Toutes les routes passées en `React.lazy()` + `<Suspense>` (`RouteFallback` minimal) — chaque page devient son propre chunk Vite ; `/tablet-menu` ne charge plus que ~9 Ko de code propre à la page (plus le socle React/React Query/Router partagé, incompressible).
  3. **Logo de l'écran de veille (élément LCP) non préchargeable** — `<img>` React, invisible pour le navigateur tant que le bundle JS n'a pas été parsé/exécuté. `<link rel="preload" as="image" fetchpriority="high">` ajouté dans `index.html` + `fetchPriority="high"` sur l'`<img>` lui-même ; les 4 images de grille (photos voitures/circuits, schémas de tracé, photos arcade) passent en `loading="lazy"` (hors écran au premier rendu, contrairement au logo).
- **Résultat mesuré** (Lighthouse mobile réel contre `https://simracing.hytlabs.com/tablet-menu`, script CI absent de ce projet — audité manuellement via le Chromium de Playwright faute de `lighthouse`/`chrome` installés) : score de performance **55 → 89** (LCP 5,0s→3,0s, Total Blocking Time 970ms→190ms, JS transporté 220 Ko→~150 Ko dont plus de la moitié est le socle React partagé). Les 100% ne sont pas atteints — le reliquat (~73 Ko de JS "inutilisé" selon Lighthouse) est le socle React/React Query/Framer Motion lui-même, chaque page n'en exploitant jamais la surface complète ; le retirer demanderait de sortir ces librairies pour cette seule page, jugé hors de proportion avec le gain restant.

## v2.2.140 — Toutes les images de /tablet-menu converties en WebP (-85% réseau)

### Changé

- **Demandé par l'utilisateur ("il faudrait passer tout en webp bien optimiser propre dans la bdd pour du gain réseau")**. Nouvel utilitaire partagé `optimizeToWebp()` (`apps/backend/src/common/image-optimizer.ts`) : convertit n'importe quelle image raster (PNG/JPEG) en WebP — qualité 82 avec perte pour les photos (voitures/circuits/arcade), quasi sans perte pour les schémas de tracé (ligne blanche sur fond transparent, une compression avec perte les aurait floutés). Jamais appliqué aux SVG (aucun actuellement en base, mais `ContentLabel.layoutImage` peut historiquement en contenir — un vectoriel déjà minuscule n'a rien à gagner à être rastérisé).
- **Chemin d'ingestion mis à jour** (pas seulement les données déjà en base) : `StationsService.upsertPreview()` (scan agent → `ContentPreview`, tous types) et `ArcadeService.setPhoto()` (upload admin) convertissent désormais systématiquement en WebP à l'écriture — toute nouvelle voiture/circuit resynchronisé ou photo arcade uploadée arrive déjà optimisée, pas seulement les 1792 images existantes.
- `inferMimeFromBase64()` (déplacé dans `common/`, dédoublonné entre `ContentPreviewsController` et `ContentLabelsController`) détecte maintenant aussi la signature WebP (`UklGR`).
- **Migration one-off des données déjà en base** (script non commité, comme les précédents scripts Prisma ponctuels de ce projet) : les 1733 `ContentPreview` + 59 `ContentLabel.layoutImage` existants reconvertis en place. **449 Mo → 65 Mo en base (-85,6%)** pour les photos, **7,6 Mo → 3,0 Mo (-60,7%)** pour les schémas de tracé (mode quasi sans perte, gain plus modeste mais attendu). 0 échec sur les 1792 images traitées. Sauvegarde complète de la base (`pg_dump`) prise avant toute écriture, vérifiée restaurable.
- **Bug réel découvert en déboguant cette conversion, corrigé au passage** : `import sharp from 'sharp'` compile (sans `esModuleInterop`, absent de `tsconfig.json`) en un appel `sharp_1.default(...)` qui vaut `undefined` à l'exécution — `BlankingMediaService.resizeImageIfNeeded()` avalait ce `TypeError` en silence depuis son introduction (v2.2.95) : **le redimensionnement des images de blanking surdimensionnées ne s'est donc jamais exécuté**, sans aucun symptôme visible (juste jamais optimisé, jamais un blocage). Corrigé via `import sharp = require('sharp')` (syntaxe correcte pour l'export `export =` de ce module) + un retypage local minimal (TS résout par erreur les déclarations ESM du paquet faute de `moduleResolution` moderne dans ce projet — corriger ça globalement dépasse le cadre de cette tâche, voir commentaire dans `image-optimizer.ts`).
- Vérifié en conditions réelles (Playwright sur la vraie prod) : 386 images chargées sur les onglets Voitures/Circuits, toutes servies en `image/webp` (`Content-Type` confirmé), rendu visuel identique à l'œil (photos et tracés comparés côte à côte avant/après).

## v2.2.139 — Logo de l'en-tête agrandi

### Changé

- **Demandé par l'utilisateur ("A PEINE PLUS GRAND LE LOGO pour que la tablette le voie bien")** juste après v2.2.138. Le logo de l'en-tête de `/tablet-menu` (32px portrait / 44px paysage) était trop petit pour bien se voir sur un écran tablette — passé à 42px/58px. Vérifié en conditions réelles (Playwright, portrait et paysage) : reste net, ne perturbe pas le reste de l'en-tête (horloge/statut à droite).

## v2.2.138 — Vrai logo dans l'en-tête + difficulté en badge sur les images du catalogue

### Changé

- **Demandé par l'utilisateur ("Utilise le bon logo pour les catalogue menu")** : l'en-tête persistant de `/tablet-menu` (visible sur les 5 onglets Voitures/Circuits/Cuisine/Bar/Arcade, pas seulement l'écran de veille) affichait encore le wordmark texte/CSS "ELSASS SIMRACING HAGUENAU" — remplacé par le même vrai logo SVG que l'écran de veille (v2.2.137), redimensionné pour tenir dans l'en-tête (32px portrait / 44px paysage, largeur automatique).
- **Demandé par l'utilisateur ("faut juste écrire la difficulté en haut à droite des images")** : `CatalogCard` (voitures et circuits) affiche désormais la difficulté en texte (`DIFFICULTY_LABELS`, ex. "Facile"/"Difficile") en badge haut-droite de l'image, quand elle est renseignée — jamais affiché pour un contenu non tagué. Remplace l'ancien indicateur à points (`DifficultyDots`) qui n'apparaissait qu'en bas des cartes circuit (les cartes voiture n'avaient auparavant aucun indicateur de difficulté sur la tuile, seulement dans la fiche détail). Le badge "N tracés" des circuits multi-layout, qui occupait déjà ce coin, est déplacé en haut-gauche pour ne pas se chevaucher avec la difficulté. La fiche détail (`DetailModal`) garde `DifficultyDots` avec ses points + libellé, inchangée.
- Aucun changement de données. Vérifié en conditions réelles (Playwright) sur l'en-tête et les grilles voitures/circuits avant déploiement.

## v2.2.137 — Vrai logo ES sur l'écran de veille de /tablet-menu

### Changé

- **Demandé par l'utilisateur**, qui a fourni le vrai fichier logo (PDF vectoriel Illustrator "ES.pdf" — le monogramme "ES" + le wordmark "ELSASS SIMRACING HAGUENAU") pour remplacer le wordmark texte codé en dur sur l'écran de veille de `/tablet-menu`.
- Fichier reçu via une URL directe (pas de pièce jointe accessible sur le disque du serveur) après clarification avec l'utilisateur sur la source du fichier — converti en SVG vectoriel (`pdftocairo -svg`, aucune perte, transparence native) plutôt que rasterisé, pour rester net à n'importe quelle taille d'écran tablette. Servi en asset statique (`apps/frontend/public/logo-elsass-simracing.svg`), même convention que `vite.svg` (favicon) déjà présent dans ce dossier.
- `IdleScreen` (écran de veille uniquement, pas l'en-tête permanent des autres onglets — hors scope de la demande) : le bloc "ELSASS/SIMRACING" + ligne "HAGUENAU" (texte + traits CSS) est remplacé par une balise `<img>` pointant vers ce SVG, qui contient déjà le monogramme et les trois mots dans une seule composition — plus fidèle au vrai fichier de marque que la reconstruction texte précédente. Couleurs conservées telles quelles dans le fichier fourni (bleu de marque légèrement plus saturé que `--tm-accent`, non forcé sur les tokens CSS existants — c'est la vraie couleur du logo).
- Vérifié en conditions réelles (Playwright, portrait et paysage) avant déploiement, hash du bundle comparé au build local, asset confirmé servi en production (`https://simracing.hytlabs.com/logo-elsass-simracing.svg`).

## v2.2.136 — Onglet Arcade sur /tablet-menu (commissionné pour de vrai)

### Ajouté

- **Demandé par l'utilisateur ("Tu as oublié arcade")**, après que l'onglet "Arcade" de la maquette v2 (billard, baby-foot, bornes à jetons...) ait été volontairement laissé de côté en v2.2.134 faute de vraie donnée — commissionné cette fois comme une vraie fonctionnalité, pas juste réaffiché avec du contenu inventé.
- **Nouveau modèle `ArcadeAttraction`** (`id, name, players?, kind?, photo? (bytea), photoMimeType?, sortOrder`) — texte libre pour `players`/`kind` (ex: "2 à 4 joueurs", "Borne à jetons"), même principe que `MenuItem.price`. Rien n'est seedé, vide jusqu'à ce que l'admin remplisse la liste.
- **Photo optionnelle uploadée à la main** — contrairement aux voitures/circuits (scannées automatiquement par l'agent), une attraction arcade n'a aucune source de scan : l'admin dépose une photo par attraction, stockée directement en base (`bytea`, jamais sur le filesystem) avec redimensionnement automatique si besoin (`sharp`, max 1600px), même principe que `BlankingMedia` (voir 3.2/gotcha "binaire stocké en base").
- **Nouveau module backend `arcade`** (`GET/POST/PATCH/DELETE /api/arcade`, admin/technicien en lecture, admin en écriture ; `POST/DELETE /api/arcade/:id/photo` pour la photo) — `GET /api/arcade/:id/photo` est **public, sans auth**, comme `ContentPreviewsController#findOne`, pour rester consommable par la page tablette publique.
- **Nouvel endpoint externe `GET /external/v1/arcade`** — consommé par `/tablet-menu`.
- **Nouvelle page admin `/arcade`** (`Arcade.tsx`) — grille de cartes (photo + nom + joueurs/type), bouton d'upload/remplacement/suppression de photo directement sur la carte, modale de formulaire pour nom/joueurs/type. Pas de champ de tri exposé (même convention que `Menu.tsx` — l'ordre de création suffit pour v1).
- **`/tablet-menu`** : 5ᵉ onglet "Arcade" réintégré (icône joystick reprise de la maquette), grille de cartes sans fiche détail au clic (pas de modale, contrairement aux voitures/circuits — simple grille de présentation comme dans la maquette). Photo en couleur (même filtre `--tm-photo` que le reste depuis v2.2.135), état vide honnête tant qu'aucune attraction n'est configurée.
- Vérifié en conditions réelles : création + upload de photo via `/arcade`, apparition immédiate sur `/tablet-menu` (onglet + nav), endpoint externe testé à la clé API, nettoyage complet après test.

## v2.2.135 — Photos en couleur sur /tablet-menu (retrait du duotone bleu)

### Corrigé

- **Demandé par l'utilisateur immédiatement après v2.2.134 ("il faut la couleur sur le image pas noir et blanc sur fond bleu").** Les photos de voitures (tuiles de filtre, cartes catalogue, fiche détail) passaient par un filtre "duotone bleu" (`grayscale + sepia + hue-rotate`) repris de l'option par défaut de la maquette — trop proche du noir & blanc teinté. Filtre remplacé par un simple `contrast/brightness/saturate` qui garde la photo en vraies couleurs (`--tm-photo` remplace `--tm-duotone`).
- Voiles bleus de marque au-dessus des photos (tuiles, cartes, reflet de la fiche détail) nettement réduits en opacité pour laisser les couleurs réelles ressortir — gardés seulement comme légère cohérence de marque, plus comme teinte dominante. Le reflet dynamique de la photo inclinable (`Tilt3DImage`) passe de bleu à un reflet blanc neutre (effet verre), plus fidèle à une vraie photo.
- Aucun changement de données ni de structure — uniquement les filtres CSS. Vérifié en conditions réelles (Playwright) sur la grille voitures et la fiche détail.

## v2.2.134 — Refonte visuelle de /tablet-menu à l'identité du vrai site vitrine

### Changé

- **Demandé par l'utilisateur ("j'aimerais refaire la page du /tablet-menu... j'aimerais avoir le maximum de beauté [du vrai site elsass-simracing.fr]").** Le thème "Nocturne" hérité de la toute première maquette importée (v2.2.117, blurple `#9184d9`, police Inter) est remplacé par l'identité réelle du site vitrine du client : fond anthracite `#0E0E0E`/`#242424`, accent bleu acier `#245E97`, police Montserrat (900 pour les titres, tout en majuscules avec tracking large), wordmark "ELSASS/SIMRACING/HAGUENAU" repris tel quel.
- **Nouvelle maquette Claude Design importée** (projet "Simracing tablet menu", fichier `Kiosque Elsass Simracing.dc.html`) après un premier prompt de conception écrit à partir d'un rendu Playwright du vrai site (couleurs/police/photos extraites du CSS calculé, cf. tour précédent). Réimplémentation React fidèle au design, comme pour chaque maquette précédente de ce projet — le runtime `x-dc`/`sc-for`/`sc-if`/`<image-slot>` n'est qu'un outil de prévisualisation, jamais exécuté en prod.
- **Écarts assumés entre la maquette et l'implémentation, toujours pour ne rien inventer :**
  - La maquette ajoutait deux onglets fictifs **"Arcade"** (borne à jetons, billard, baby-foot...) et **"Le centre"** (photos de la salle + événements à venir) — **non repris** : aucune donnée réelle ne les alimente (pas de modèle Arcade/Événements en base), contrairement aux 4 onglets réels (Voitures/Circuits/Cuisine/Bar) que le prompt de conception avait explicitement demandés. Peuvent être commissionnés comme vraies fonctionnalités (nouveaux modèles + admin CRUD) si l'utilisateur le souhaite.
  - Les circuits de la maquette étaient dessinés en **tracés SVG inventés** avec longueur/nombre de virages/sens fictifs — remplacés par le **vrai schéma scanné** (`outline.png`, déjà en place depuis v2.2.128) affiché sur le même panneau noir à halo radial bleu ; aucune "Longueur"/"Virages"/"Sens" fabriqués dans la fiche détail (ces données n'existent pas réellement).
  - Les drapeaux pays de la maquette étaient dessinés à la main en SVG pour 9 pays fixes — gardé l'emoji `flagEmoji()` déjà en place (fonctionne pour n'importe quel code pays réellement renseigné, pas seulement les 9 anticipés par la maquette).
  - L'écran de veille de la maquette utilisait une photo plein écran du centre (`<image-slot>`) — aucun asset de ce type n'existe côté serveur (le scanner de contenu ne récupère que des photos de voitures/circuits) ; remplacé par un halo radial bleu + texture hachurée, sans photo inventée.
  - Les cartes voiture de la maquette étaient volontairement sans photo (juste un dégradé + un texte-filigrane géant de la catégorie) — la vraie photo scannée (déjà curatée : 344 voitures revues et orientées, v2.2.123) a été **conservée** en fond de carte (filtre duotone bleu + voile dégradé) plutôt que supprimée, pour ne pas perdre ce travail de curation ni la reconnaissance visuelle.
- **Nouveaux composants** : icônes de navigation dessinées au trait (`NavIconCars/Tracks/Kitchen/Bar`, reprises de la maquette) remplacent les icônes lucide génériques ; `CategoryTile` (tuile photo/pleine pour les filtres voitures) et `PillFilter` (pastille compacte pour les filtres circuits, sans photo) remplacent l'unique `FamilyTile` partagé.
- **Toujours responsive portrait/paysage réel** (pas le canvas fixe 1920×1200 mis à l'échelle de la maquette, qui letterboxerait en portrait) — même détection `portrait = viewport.h > viewport.w * 1.05` qu'avant, toute la mise en page reste fluide. Navigation simplifiée en barre basse unique dans les deux orientations (au lieu d'un rail latéral en paysage).
- Toute la logique de données reste inchangée (requêtes `/external/v1/content`/`/categories`/`/menu`, minuteur de veille 90 s, dérivation dynamique des familles de catégories v2.2.131, tracé réel des circuits, specs réelles des voitures).
- Vérifié en conditions réelles (Playwright) : écran de veille, grille voitures (avec les 48 catégories nettoyées v2.2.132), fiche détail voiture (tilt + grille specs 2×2), grille et fiche détail circuits (vrai tracé + configurations), onglet cuisine (état vide honnête), portrait et paysage.

## v2.2.133 — Bouton "Voitures sans infos" sur /content-names

### Ajouté

- **Demandé par l'utilisateur ("Tu peux faire un bouton pour les voitures qui manque les informations").** Bouton bascule dans l'en-tête de `/content-names`, affiche le nombre de voitures sans aucune information technique/descriptive (`isMissingInfo()` : ni catégorie, ni difficulté, ni année, ni pays/code pays, ni description, ni puissance/poids/vitesse max — le nom affiché seul ne compte pas comme "info"). Un clic filtre la liste sur ces voitures uniquement (force aussi le filtre Type sur "Voitures") ; un second clic revient à la liste complète.
- Message d'état vide dédié ("Tout est déjà renseigné !") quand le filtre est actif et qu'il ne reste plus rien à compléter.
- Vérifié en conditions réelles : 20 voitures actuellement sans infos sur 346, bouton et filtre fonctionnels sur `/content-names` (Playwright).

## v2.2.132 — Catégories configurables en admin (remplace le texte libre)

### Ajouté

- **Demandé par l'utilisateur ("j'aimerais que les catégorie soit configurable dans l'admin sim et que la catégorie soit selectionable en liste pour envoyer la voiture dans la catégorie").** La catégorie d'une voiture/d'un circuit était jusqu'ici un simple champ texte libre sur `/content-names` — en pratique, ça avait dérivé en 88 valeurs quasi-doublons pour les seules voitures (`Formula 1`/`Formule 1`, `Cup`/`CUP`/`Tourisme/Cup`, etc.), et le sélecteur de filtre de `/tablet-menu` s'appuyait sur une liste `CAR_FAMILIES` figée dans le code (11 familles, matching par regex) plutôt que sur ces valeurs réelles.
- **Nouveau modèle `ContentCategory`** (`id, type ('car'|'track'), name, sortOrder`, unique `(type, name)`) — liste de catégories gérée par type, seedée à la migration avec les 88 valeurs déjà en base pour les voitures (aucune fusion/invention à ce stade, juste une promotion du texte libre existant vers une liste éditable).
- **Nouveau module backend `content-categories`** (`GET/POST/PATCH/DELETE /api/content-categories`, admin) — renommer une catégorie met à jour tous les `ContentLabel` qui la référencent ; la supprimer les détache (`category` → `null`) plutôt que de laisser une valeur orpheline hors de la liste.
- **Nouvel endpoint externe `GET /external/v1/categories`** — consommé par `/tablet-menu` pour générer ses tuiles de filtre.
- **Nouvelle page admin `/content-categories`** (`ContentCategories.tsx`, lien "Gérer les catégories" depuis `/content-names`) — deux colonnes Voitures/Circuits, renommage inline, réordonnancement, suppression, ajout, filtre texte.
- **`/content-names`** : le champ catégorie devient un `<select>` alimenté par cette liste (filtré par type) au lieu d'un texte libre.
- **`/tablet-menu`** : `CAR_FAMILIES` (liste figée + regex, v2.2.121) supprimé — les tuiles de filtre sont désormais générées dynamiquement depuis `ContentCategory`, correspondance exacte sur `item.category`. Le bucket spécial "Autres" disparaît (n'a plus de sens avec une liste finie plutôt que du texte libre).
- **Premier nettoyage des 88 catégories voitures, demandé explicitement par l'utilisateur après avoir vu l'explosion de tuiles que cette migration a révélée sur `/tablet-menu`** (voir AskUserQuestion — l'utilisateur a choisi "fais un premier nettoyage maintenant" plutôt que de tout laisser en l'état) : fusion des 4 doublons de casse/langue sans ambiguïté (`Formule 1`→`Formula 1`, `Formule 4`→`Formula 4`, `LMP2`→`Prototype LMP2`, `CUP`→`Cup`), suppression de `Hors Catégories` (redondante avec l'absence de catégorie), détachement des 35 catégories ne s'appliquant plus qu'à une seule voiture après fusion (`category` remis à `null`, aucun autre champ touché). 88 → 48 catégories. Les sous-catégories réelles à faible effectif mais légitimes (`NASCAR`, `WRC`...) ont été conservées ; aucune fusion incertaine (`GT1` vs `GT1 / Le Mans`, variantes historique/préparé de chaque famille) n'a été décidée unilatéralement — laissées à l'admin via la nouvelle page.
- Vérifié en conditions réelles : CRUD complet (création, renommage avec cascade, suppression avec détachement, doublon rejeté en 409) testé via un compte admin jetable directement sur l'API de prod, puis visuellement sur `/content-categories`, `/content-names` et `/tablet-menu` (Playwright).

## v2.2.131 — Tracé du circuit sur la tuile catalogue (au lieu de la photo)

### Changé

- **Demandé par l'utilisateur ("dans l'image du circuit dans le catalogue j'aimerais un truc propre mais il me faut le tracé du circuit").** La tuile circuit de `/tablet-menu` (grille "Choisissez votre circuit") affichait la photo de piste (`preview`, type `'track'` — souvent sombre/encombrée, coupée en `object-fit: cover` sur seulement 176px de haut) au lieu du tracé propre déjà utilisé dans la fiche détail depuis v2.2.129.
- **`CatalogCard` (`TabletMenu.tsx`)** : quand un tracé existe (`layoutImages[0]` ou repli `layoutImageUrl`), la tuile l'affiche à la place de la photo — fond noir, `object-fit: contain`, marge intérieure pour ne pas coller aux bords. Aucun tracé disponible → repli sur l'ancienne photo, puis sur l'icône "pas d'image" si aucune des deux n'existe. Les voitures ne sont pas concernées (`layoutImages` est toujours vide pour un item `car`) — leur tuile garde la photo inchangée.
- Vérifié en conditions réelles sur `/tablet-menu` (Playwright) : tuiles circuits (24h Du Mans, Bahrain, Anneau du Rhin, etc.) affichent chacune leur tracé blanc sur fond noir ; onglet Voitures inchangé (photos couleur, badges catégorie/puissance intacts).
- Changement purement frontend, aucun code agent modifié — build + redéploiement du conteneur `backend` (qui sert aussi le frontend).

## v2.2.130 — Vitesse max + peuplement de 66 voitures via le catalogue elsass_catalogue

### Ajouté

- **Nouveau champ `ContentLabel.maxSpeedKmh`** (même règle que puissance/poids : réservé aux voitures réelles identifiées) — dump SQL `phpMyAdmin` fourni par l'utilisateur ("pour les voitures qui manque d'information voici ce qu'il y a en stock") contenant une vitesse max par voiture, exploitée en plus des champs déjà en place. `/content-names` gagne un champ "Vitesse max (km/h)" (même style que Puissance/Poids). `/tablet-menu` affiche un `SpecStat` "Vitesse max" dans la fiche détail quand renseigné.
- **66 des 87 voitures encore sans aucune info ont été peuplées** (puissance, poids — dérivé du ratio `power_to_weight × horsepower` fourni par le dump —, vitesse max, pays/code pays, année, difficulté, et catégorie quand elle est directement lisible dans le nom déjà scanné) à partir de ce dump — une base de données `elsass_catalogue` (nom de la table correspond au nom du venue) qui liste manifestement le même roster de voitures avec leurs vraies caractéristiques.
- **La correspondance acId ↔ ligne du dump a été faite à la main, entrée par entrée, jamais en masse par position ou par un score de similarité seul** — le dump ne contient pas d'acId, seulement un nom libre. Beaucoup des 87 voitures manquantes sont le pack RSS déjà signalé en 3.2 comme "constructeur déguisé pour raison de licence" (`Bayer`→BMW, `Lanzo`→Lamborghini, `Protech`→Porsche, `Ferruccio`/`Furiano`→Ferrari, `Adonis`→Aston Martin, `Cortex`→Corvette, `Akuro`→Honda, `Callahan`→Cadillac, `Nisumo`→Nissan, `Toyama`→Toyota, `Hyperion`→Ford/Mustang, `Mercer`→Mercedes, `Lux`→Lexus, `Macca`→McLaren, `Aero`→Audi) — mais le `rawName` réellement scanné (`ui_car.json`, jamais le dossier acId) révèle déjà le vrai constructeur pour la plupart d'entre elles (ex: `rss_gtm_bayer_i6_evo` a pour `rawName` scanné "GT3 BMW M4", pas "GT3 Bayer i6 Evo"), et les numéros de modèle abrégés dans les noms restants (ex: "Fera 55"/"57" → Ferrari 550/575, "Ferra 36" → Ferrari 360, "Ferra 96" → Ferrari 296, "Porsch 96" → Porsche 996, "Adonis D9" → Aston Martin DBR9) ont été décodés au cas par cas avant d'accepter une correspondance.
- **21 voitures explicitement exclues, aucune donnée inventée** : soit le dump n'a rien de plausible pour cet acId (packs Maserati Kunos hors MC12 GT1, mods VRC/URD sans équivalent, `Genesis GMR-001 LMH`...), soit plusieurs lignes du dump sont également plausibles sans indice suffisant pour trancher (ex: `rss_gtm_bayer_v8` "GT3 BMW V8" pourrait être la M6 GT3 **ou** la Z4 GT3, `rss_gtm_mercer_v8` "GT3 Mercedes V8" pourrait être l'AMG GT3 EVO **ou** la SLS AMG GT3, `rss_formula_hybrid_x*` "Formula Hybrid X" ne correspond clairement à aucune ligne du dump) — laissées telles quelles plutôt que de deviner.
- **Seuls les champs encore vides ont été renseignés** — un script one-off (comme pour les précédents peuplements) ne touche jamais un champ déjà curaté (manuellement via `/content-names` ou par un peuplement précédent), même si le dump propose une valeur différente.
- Peuplement via script Prisma one-off (comme pour les circuits/voitures précédents) — aucun code métier modifié dans cette partie de l'entrée, uniquement des données + le nouveau champ `maxSpeedKmh`.

## v2.2.129 — Fond noir + tous les layouts d'un circuit sur les schémas de tracé

### Changé

- **Demandé par l'utilisateur après avoir vu le résultat réel de v2.2.128 ("il faudrait mieux le voir circuit et blanc donc il faudrait fond noir, et ensuite il faudrait tout les layout possible de chaque circuit").** Le vrai `outline.png` scanné (v2.2.128) est un tracé **blanc sur fond transparent** — affiché dans l'encart blanc utilisé jusqu'ici (hérité des schémas Wikimedia, eux composités sur fond blanc opaque), le trait blanc devenait invisible. Encart passé au fond noir (`#000`) sur `/tablet-menu` (`DetailModal`, section "Tracé") et `/content-names` (champ "Layout") — les schémas Wikimedia (déjà opaques) restent lisibles aussi bien sur fond noir que blanc, donc aucune régression pour ceux-là.
- **`ContentLabelsService`** : nouveau champ `layoutImages: { name, url }[]` sur `KnownContentItem`/`CatalogItem` (nouvelle méthode privée `resolveLayoutImages()`) — une entrée par layout nommé du circuit ayant son propre `outline.png` scanné (`ContentPreview` type `'layout'`, acId `${trackAcId}:${layoutName}`, déjà uploadés par l'agent depuis v2.2.128 mais jusqu'ici jamais exposés par l'API). `gatherRawContent()` capture désormais aussi les noms de layout par circuit (`StationContentShape.tracks[].layouts`). `layoutImageUrl` (racine, sans nom de layout) reste le repli utilisé quand aucun layout nommé n'a de schéma propre (cas des circuits Wikimedia et des circuits à convention plate sans dossier de layout).
- **`/tablet-menu`** : la fiche détail d'un circuit multi-layout affiche désormais chaque tracé côte à côte, étiqueté par son nom de layout (ex: Bahrain → 6 tracés : `bahrain_wec_2024`, `endurance`, `gp`, `oasis`, `outer`, `paddock`), au lieu d'un seul tracé arbitrairement choisi. Un circuit à layout unique garde l'affichage simple (un seul encart, pas d'étiquette).
- **`/content-names`** : le champ "Layout" d'une ligne circuit devient une petite galerie (une vignette 48×36 par layout, infobulle = nom du layout) quand il y en a plusieurs, sinon inchangé (une seule vignette).
- Vérifié en conditions réelles sur `/tablet-menu` (Playwright) : le circuit de Bahreïn affiche ses 6 tracés distincts, traits blancs bien visibles sur fond noir.
- Changement purement frontend/backend, aucun code agent modifié (pas de nouvelle release GitHub nécessaire) — uniquement build + redéploiement du conteneur `backend`.

## v2.2.128 — Vrais schémas de circuits scannés depuis Content Manager (agent)

### Ajouté

- **Demandé par l'utilisateur, à partir d'une capture d'écran de Content Manager sur le poste admin ("récupérer toute les image de circuit... les layer etc... et les placer... sur les images de circuit sur le catalogue").** Clarifié : la source est le vrai fichier `outline.png` livré avec chaque circuit installé (fichier standard AC, à côté de `preview.png`/`ui_track.json` dans `content/tracks/<circuit>/ui/<layout>/` — c'est ce que Content Manager affiche dans sa fiche circuit), récupéré **par le même mécanisme que les photos** (scan agent + upload), pas par un transfert manuel de fichiers.
- **Agent (`contentScanner.ts`)** : nouvelles fonctions `findLayoutSchema`/`findTrackLayoutSchema` (mêmes conventions de recherche que `findLayoutPreview`/`findTrackPreview` — racine du circuit, dossier `ui/`, puis repli sur la première image trouvée parmi les layouts). `Track`/`TrackLayout` gagnent un champ `layoutImage`. `CACHE_VERSION` passé à 9 (un cache v8 n'a pas ce champ du tout, doit être invalidé plutôt que traité comme "scanné, rien trouvé").
- **Backend (`stations.service.ts`)** : `track.layoutImage` (et celui de chaque layout) routé à travers `upsertPreview()` sous un nouveau type `'layout'` (même table `ContentPreview` que les photos, `acId` = celui du circuit) — jamais laissé en base64 brut dans la colonne `content` (même précaution anti-bloat que pour les previews de layout, voir v2.2.56/gotcha `stations.service.ts`).
- **`ContentLabelsService`** : `loadPreviewMap()` généralisé pour accepter une liste de types (`car`/`track`/`layout`) au lieu d'être figé sur `car`/`track`. `getCatalog()` (donc `/tablet-menu`) et `getKnown()` (donc `/content-names`) préfèrent désormais ce vrai schéma scanné ; le schéma web (Wikimedia, peuplé manuellement en v2.2.126) ne reste utilisé qu'en repli pour les circuits pas encore (re-)scannés par un poste avec ce nouvel agent.
- **`/content-names`** : nouveau champ "Layout" (lecture seule, vignette sur fond blanc) sur chaque ligne circuit, symétrique au champ "Photo"/Miroir des voitures — visible dès qu'un poste a resynchronisé son contenu avec le nouvel agent.
- **Nécessite une nouvelle release de l'agent + mise à jour sur les postes pour avoir un effet réel** (contrairement à v2.2.120/124, qui étaient backend/frontend seul) : le champ `layoutImage` n'existe qu'à partir de cette version de l'agent — un poste qui n'a pas encore été mis à jour continue de scanner sans lui, sans erreur, juste sans image de layout tant qu'il n'est pas mis à jour puis resynchronisé (`content:sync`).
- Aucune image inventée : un circuit sans `outline.png` sur le disque garde `layoutImageUrl: null` (ou son repli web s'il en a un depuis v2.2.126) — même principe "pas de valeur devinée" que tout le reste de `ContentLabel`.

## v2.2.127 — Miniature photo sur /content-names

### Ajouté

- **Demandé par l'utilisateur ("il me faudrais un petit mais visible la photo de la voiture").** Chaque ligne de `/content-names` (voitures et circuits) affiche désormais une petite vignette (56×40, coins arrondis) avec la vraie photo scannée par l'agent, avant le badge de type — icône de remplacement discrète si aucune preview n'a encore été scannée pour cet acId.
- `ContentLabelsService.getKnown()` réutilise désormais le même mécanisme de résolution d'image que `getCatalog()` (extrait en une méthode privée partagée `loadPreviewMap()` — une preview par acId, n'importe quel poste l'ayant scannée fait l'affaire), plutôt que de dupliquer la logique.
- Changement purement frontend/backend, aucune donnée modifiée.

## v2.2.126 — Schémas et difficulté des circuits peuplés (63/68)

### Ajouté

- **Suite de v2.2.125 : peuplement réel des 68 circuits scannés en prod ("pour les circuit récupère les vrais schema du circuit").** Recherche menée en parallèle (5 agents, un par lot d'une quinzaine de circuits) : identification de chaque acId comme circuit réel ou non (aucune devinette — les mods au nom trop générique ou les circuits fictifs Kunos confirmés sont explicitement exclus), puis recherche du vrai plan de tracé (vue du dessus) sur Wikimedia Commons (licences libres CC/GFDL/domaine public), téléchargement, vérification visuelle individuelle (planche-contact + inspection à pleine résolution) avant import.
- **63/68 circuits reconnus comme réels et identifiables** : 59 avec un vrai schéma de tracé (`layoutImage`, normalisé en PNG max 900px de large, fond blanc), tous avec pays/code pays, tous avec une difficulté (1-5) estimée selon la réputation technique réelle du circuit (ex: Nordschleife/Spa/Suzuka/Monaco = Expert, petits circuits club = Débutant/Facile) — même principe que la difficulté des voitures (estimation experte documentée, pas une donnée mesurée).
- **5 circuits volontairement exclus, aucune donnée inventée** : `drift` et `marshal` (noms trop génériques), `ks_black_cat_county` (circuit fictif confirmé, DLC Kunos), `ks_drag` (drag strip générique sans lieu réel), `glava-zete` (route réelle au Monténégro mais sans circuit officiel/schéma publié fiable).
- **4 circuits réels sans schéma disponible** (mais avec pays/difficulté quand même renseignés) : `ack_nkrc_2023`, `chambley`, `circuit_mirecourt2025`, `spa_karting` — aucune image en licence libre trouvée malgré une recherche confirmée du circuit réel.
- Peuplement via script Prisma one-off (comme pour les voitures) — aucun code modifié dans cette entrée, uniquement des données.

## v2.2.125 — Difficulté nommée (Débutant→Expert) + infrastructure schéma de circuit

### Ajouté

- **Demandé par l'utilisateur ("difficulté dans les voitures débutant/facile/moyen/difficile/expert, et fait aussi ce les circuit").** Échelle 1-5 existante renommée avec des libellés explicites (`DIFFICULTY_LABELS` : Débutant/Facile/Moyen/Difficile/Expert), affichés à côté des barres sur `/content-names` (`DifficultyPicker`) et sur `/tablet-menu` (`DifficultyDots`, prop `showLabel` pour la fiche détail). Le champ `difficulty` était déjà générique (voitures **et** circuits, jamais limité aux voitures) — seul l'étiquetage change, aucune migration nécessaire.
- **`ContentLabel.layoutImage`** (base64, texte libre) : nouveau champ pour le vrai schéma d'un circuit (tracé vu du dessus), distinct de la photo scannée par l'agent. Servi via un nouvel endpoint public `GET /content/labels/layout-image/:id` (même principe que `ContentPreviewsController`, mime déduit du préfixe base64 — PNG/JPEG/SVG). Pas de champ dans `RowPayload`/formulaire admin : renseigné uniquement via script one-off (source externe, voir prochaine entrée) — `upsert()` ne le touche jamais, donc aucun risque de l'écraser en éditant un autre champ depuis `/content-names`.
- **`/tablet-menu`** : la fiche détail (`DetailModal`) affiche le tracé (`item.layoutImageUrl`) sous un encart blanc (les schémas sont typiquement des traits sombres sur fond clair/transparent) quand disponible, section "Tracé" sous la difficulté.
- Changement purement frontend/backend, aucune donnée de circuit encore peuplée à ce stade (voir entrée suivante) — infrastructure seule.

## v2.2.124 — Case à cocher "Afficher sur le catalogue" (/content-names)

### Ajouté

- **Demandé par l'utilisateur ("Fait moi une coche afficher sur la catalogue... coché il est visible sur catalogue et pas coché pas visible").** `ContentLabel` gagne `visible` (booléen, défaut `true` — rien ne disparaît par défaut). Case à cocher "Afficher sur le catalogue" ajoutée sur chaque ligne de `/content-names` (voitures **et** circuits), à côté du badge de type ; la ligne se grise légèrement (`opacity-50`) quand elle est décochée pour repérer d'un coup d'œil ce qui est masqué.
- **`ContentLabelsService.getCatalog()`** exclut désormais les items avec `visible: false` du résultat renvoyé à `/tablet-menu` (via `GET /external/v1/content`) — l'item disparaît complètement du catalogue public, pas juste grisé. `getKnown()` (utilisé par `/content-names`) continue de lister tout, masqué ou non, pour que l'admin puisse le retrouver et le réafficher.
- Scope volontairement limité au catalogue public (`/tablet-menu`) — un item masqué reste sélectionnable normalement partout ailleurs dans le dashboard (assistant de création de serveur, envoi de POD...), le staff a toujours besoin d'accéder à tout le contenu scanné.
- `upsert()` ne supprime la ligne que si tous les champs sont vides **et** `visible` est resté à sa valeur par défaut (`true`) — décocher seul doit suffire à garder la ligne en base (sinon le masquage serait perdu au prochain chargement).
- Vérifié en conditions réelles : décocher une voiture la fait passer de 346 à 345 entrées sur `GET /external/v1/content`, recochée elle revient à 346.
- Changement purement frontend/backend, aucun code agent modifié.

## v2.2.123 — Photos de voitures orientées capot à droite sur /tablet-menu

### Ajouté

- **Demandé par l'utilisateur ("j'aimerais changer tout les image pour qu'elle soit tous tournéer capot vers la droite"), scope confirmé à `/tablet-menu` uniquement (via AskUserQuestion).** `ContentLabel` gagne `mirrored` (booléen, défaut `false`) — appliqué en CSS (`transform: scaleX(-1)`) sur la photo, jamais un retournement des pixels stockés en base (une resynchronisation de contenu depuis un poste aurait sinon silencieusement annulé le retournement, `ContentPreview.data` étant réécrit à chaque scan).
- **Les 344 photos de voitures scannées ont été examinées une par une** (extraction en base64 → fichiers, planches-contact pour une revue rapide, puis vérification individuelle à pleine résolution pour toute photo ambiguë ou à fond non standard) pour repérer le sens du capot. Résultat : la quasi-totalité (307/344) est orientée capot à gauche (convention par défaut de l'outil de génération d'aperçus le plus utilisé pour ce contenu) et a été marquée `mirrored: true`. Exclusions délibérées (aucun retournement) : les 24 karts (`psc_*`/`ack_otk_*`, déjà capot à droite avec une convention différente), les 8 voitures du pack `rw_*` (déjà capot à droite), 4 voitures isolées déjà capot à droite (`rms_peugeot_908hdi_lm07`, `porsche_919_hybrid_evo_2018`, `rss_formula_hybrid_2025_alpine`, `urd_detroit_egt_2018_LM`), et 1 photo prise de l'arrière du véhicule où l'orientation du capot n'est pas déterminable (`rl_ford_fiesta_wrc_s1`).
- **`/content-names`** : nouveau bouton bascule "Miroir" par voiture (icône `FlipHorizontal`), pour que l'admin puisse corriger une voiture reclassée plus tard sans repasser par un script.
- **`/tablet-menu`** : le retournement s'applique sur la vignette (`CatalogCard`), la tuile de famille (`FamilyTile`, photo représentative) et la fiche détail (`Tilt3DImage`, combiné à l'effet de bascule existant sans conflit). Effet de bord attendu et accepté : les numéros de course/logos sponsors imprimés sur la carrosserie apparaissent inversés sur les photos retournées, propre à tout miroir d'image — pas un défaut.
- Changement purement frontend/backend, aucun code agent modifié.

## v2.2.122 — Page /content-names plus lisible (champs étiquetés)

### Changé

- **Demandé par l'utilisateur ("Tu peux le rendre plus lisible alors"), après lui avoir indiqué où éditer les infos voitures/circuits (`/content-names`).** Chaque champ (Nom affiché, Catégorie, Difficulté, Année, Pays, Code pays, Puissance, Poids, Description) a désormais une étiquette visible en permanence au-dessus (`Field`), au lieu de compter uniquement sur le texte de `placeholder` — qui disparaît dès qu'une valeur est saisie, rendant les lignes déjà remplies illisibles sur une liste de 346 voitures.
- Passage d'un flex-wrap improvisé à une vraie grille (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`) : les champs s'alignent proprement en colonnes, "Nom affiché" et "Description" prennent plus de largeur (texte plus long), le reste (Catégorie/Difficulté/Année/Pays/Code/Puissance/Poids) tient sur une seule ligne compacte. Boutons Enregistrer/Réinitialiser déplacés en haut à droite de chaque ligne, à côté de l'identité (badge + nom technique/acId), pour rester visibles sans dépendre du nombre de champs remplis en dessous.
- Aucun changement de comportement (mêmes champs, même sauvegarde groupée par ligne) — uniquement la lisibilité.

## v2.2.121 — Tuiles voitures GT2/GT3/GT4/Hypercar/DTM/Cup/Historique/Autres/Formula 1/2/4

### Changé

- **Demandé par l'utilisateur, à partir d'une image de référence (liste de catégories) : "replace en les catégorie suivant".** Les 4 tuiles fixes de l'onglet Voitures (`/tablet-menu`, v2.2.119 : GT/Formula/LMDH/Drift) sont remplacées par 11 tuiles correspondant exactement à la liste fournie : GT2, GT3, GT4, Hypercar, DTM, Cup, Historique, Autres, Formula 1, Formula 2, Formula 4 (+ "Toutes"). Portée confirmée explicitement (via AskUserQuestion) : uniquement les tuiles de la page tablette — le champ `category` texte libre déjà enregistré sur les 259 voitures n'est pas modifié.
- Les familles se recouvrent volontairement (ex: "Formule 1 historique" apparaît à la fois sous Historique et Formula 1) — aucune n'est exclusive, même principe qu'avant. **"Autres" est un vrai filtre** (regex négative : toute voiture qui ne matche aucune des 10 autres familles), distinct de "Toutes" qui n'exclut rien — n'existait pas dans la version précédente. Une famille sans aucune voiture correspondante ne s'affiche pas (`Formula 2` n'a aucune voiture taguée actuellement en prod, donc invisible tant qu'aucune n'est ajoutée via `/content-names`).
- Changement purement frontend, aucune donnée modifiée en base, aucun code agent touché.

## v2.2.120 — Puissance et poids sur les fiches voitures ("Tu peux me donner plus de jolie detail Poids puissance etc")

### Ajouté

- **Demandé par l'utilisateur.** `ContentLabel` gagne `powerHp` (chevaux) et `weightKg` (kg), mêmes règles que les autres champs de recherche (v2.2.118) : réservés aux voitures réelles identifiées, jamais une estimation pour un contenu ambigu/déguisé. `upsert()` étendu (suppression de la ligne seulement si **tous** les champs sont vides, désormais 9 champs).
- **Peuplement des 259 voitures déjà identifiées** (mêmes acId que v2.2.118) avec puissance/poids réels — fiche constructeur pour les voitures de route, valeur représentative de la classe pour les catégories réglementées (GT3/GT4/LMP2/LMP3...) où la puissance exacte varie selon le "Balance of Performance".
- **`/content-names`** : deux champs numériques de plus par ligne ("Puissance (ch)", "Poids (kg)"), enregistrés avec le reste via le même bouton "Enregistrer".
- **`/tablet-menu`** : badge puissance ("450 ch") en haut à droite de chaque vignette voiture (symétrique au badge catégorie à gauche). Fiche détail enrichie d'une mini fiche technique (`SpecStat`) — Puissance / Poids / Rapport poids-puissance calculé (kg/ch) — n'apparaît que si au moins une des deux valeurs est renseignée.
- Changement purement frontend/backend, aucun code agent modifié — pas de nouvelle release GitHub, seulement migration Prisma + rebuild/redéploiement du conteneur Docker `backend`.

## v2.2.119 — Sélecteur de voitures à tuiles photo (GT/Formula/LMDH/Drift)

### Changé

- **Demandé par l'utilisateur, à partir d'une image de référence (4 tuiles photo GT/Formula/LMDH/Drift) : "regoupe les groupe dans ça".** La barre de filtres texte de l'onglet Voitures (`/tablet-menu`) est remplacée par une grille de tuiles avec photo réelle en fond (désaturée/assombrie) et étiquette centrée, dans l'esprit de la maquette fournie. Volontairement restreint à **4 familles fixes** (confirmé explicitement par l'utilisateur, pas une liste exhaustive) : GT, Formula, LMDH, Drift + une tuile "Toutes". Les voitures qui ne rentrent dans aucune des 4 (Kart, route, rallye, tourisme, muscle car...) restent visibles sous "Toutes", simplement sans tuile dédiée.
- Chaque tuile utilise la photo de la première voiture de la famille qui en a une (`CAR_FAMILIES`, règles par mot-clé sur le champ `category` exact — LMDH regroupe en pratique tout le Prototype/Hypercar Le Mans : LMP1/2/3, Hypercar/LMH, Groupe C...). Le tag précis reste affiché tel quel sur chaque carte/fiche détail, seul le regroupement de la tuile est large.
- Remplace le fix précédent (v2.2.118, regroupement en ~30 familles en pastilles texte) — gardé un temps mais jugé encore trop chargé visuellement pour un écran tactile.

## v2.2.118 — Fiches voitures enrichies (année/pays/description) + effet 3D sur la tablette

### Ajouté

- **Demandé par l'utilisateur : "recherche les information suplémentaire Catégorie année pays Code pays difficulté et une petit description des voiture qui on été mis déja en BDD".** `ContentLabel` (Prisma) gagne trois nouveaux champs optionnels : `year`, `country` + `countryCode` (ISO 3166-1 alpha-2, pour l'emoji drapeau), `description` (texte court). `/content-names` affiche une seconde ligne par voiture/circuit avec ces champs (année, pays avec drapeau live, description) — un seul bouton "Enregistrer" par ligne pour tous les champs, même principe que catégorie/difficulté (v2.2.117) : la ligne n'est supprimée que si **tous** les champs sont vides à la fois.
- **Peuplement en masse** : 259 des 346 voitures du catalogue scanné en prod ont été recherchées et renseignées (catégorie, année, pays, difficulté estimée par catégorie, courte description) via un script Prisma one-off, à partir des vraies données (pas de valeur inventée). **Volontairement incomplet** : les ~87 voitures restantes sont des mods dont le nom de constructeur est déguisé pour raison de licence (ex: contenus RSS "Bayer"/"Lanzo"/"Protech" — des reskins non-officiels de BMW/Lamborghini/Porsche sous un faux nom) ou dont l'identité n'est pas fiable à 100% — choix explicite de l'utilisateur de laisser ces cas vides plutôt que de deviner, éditables ensuite à la main sur `/content-names` comme n'importe quel tag admin.
- **Visuel "3D" sur `/tablet-menu`** : demandé "un visuelle 3D des voitures pouvoire les tournée etc". Vérification faite avant d'implémenter — l'agent ne scanne qu'une **photo 2D unique** par voiture (`preview.png`/`.jpg` trouvée dans le dossier AC), jamais le modèle 3D natif (`.kn5`, format propriétaire Kunos) : aucune infrastructure de rendu 3D n'existe dans le projet, et extraire/republier les vrais modèles poserait un problème de licence (contenu payant Kunos + mods tiers non prévus pour être réexportés). Implémenté à la place, sur la vraie photo : nouvelle `Tilt3DImage` dans la fiche détail — bascule/parallaxe CSS pilotée par glissement au doigt/à la souris (`rotateX`/`rotateY` bornés, effet de brillance qui suit l'inclinaison), plus un léger effet de survol 3D sur les vignettes de la grille (desktop uniquement, `@media (hover: hover)`, pour ne pas gêner le défilement tactile). Présenté et validé comme un "effet pseudo-3D sur la vraie photo", pas un vrai modèle 3D pivotable à 360°.
- **Correction post-déploiement** : une fois les 259 voitures réellement peuplées, la barre de filtres de `/tablet-menu` (basée directement sur le champ catégorie, très spécifique par modèle — ex: "Coupé sportif préparé" vs "Coupé sportif") explosait à ~80-85 pastilles sur 8 lignes, illisible sur tablette. `categoryGroup()` (règles par mot-clé) regroupe ça en ~30 familles pour le filtre, sans toucher au tag exact affiché sur chaque carte/fiche détail.
- Changement purement frontend/backend, aucun code agent modifié — pas de nouvelle release GitHub, seulement migration Prisma + rebuild/redéploiement du conteneur Docker `backend`.

## v2.2.117 — App tablette "Menu interactif" : catalogue voitures/circuits + carte resto-bar

### Ajouté

- **Demandé par l'utilisateur : "crée moi un petit application ... une sorte d'app kiosque pour le centre de simu sur des tablette", à partir d'une maquette Claude Design importée (`Menu Tablette.dc.html`, projet "Menu interactif sur tablette").** Nouvelle page **publique, sans connexion** `/tablet-menu` — pensée pour être ouverte en plein écran sur des tablettes posées dans le centre : catalogue voitures/circuits réellement scanné sur les postes (photo, catégorie, difficulté), et carte resto/bar. Onglets Voitures/Circuits/Cuisine/Bar, filtres par catégorie (dynamiques, affichés seulement s'il existe au moins un item catégorisé), fiche détail au clic, écran de veille après 90s d'inactivité (accroche qui tourne, horloge, "Touchez l'écran"), responsive portrait/paysage. Thème repris de la maquette ("Nocturne", accent blurple `#9184d9`) mais scopé à cette seule page (`.tablet-menu`), sans toucher au thème du reste du dashboard.
- **Écart assumé avec la maquette** : celle-ci invente un catalogue fictif (F1 2024, Porsche 911 GT3 R, specs puissance/poids/année) et une carte alsacienne fictive — le vrai système ne connaît que `acId` + nom + photo scannés. Plutôt que d'inventer des specs, deux nouvelles pages d'administration permettent de renseigner le **vrai** contenu :
  - **`ContentNames.tsx`** (`/content-names`) : ajout de deux champs par voiture/circuit — catégorie (texte libre, ex "GT3") et difficulté (1-5) — en plus du nom déjà personnalisable. `ContentLabel` (Prisma) gagne `category`/`difficulty` (nullable). `upsert()` ne supprime plus la ligne quand seul le nom est vidé (sinon ça effacerait aussi la catégorie/difficulté déjà renseignées) — suppression seulement si les trois champs sont vides à la fois.
  - **Nouvelle page `/restaurant-menu`** (`Menu.tsx`) : CRUD complet de la carte resto/bar — catégories (Cuisine/Bar, titre, sous-titre) contenant des articles (nom, description, prix en texte libre). Nouveau module backend `menu/` (`MenuCategory`/`MenuItem`, mêmes conventions CRUD que `race-formats/`).
- **Backend, nouvelles routes externes** (`ExternalApiController`, déjà authentifié par clé API dédiée `ApiKeysModule` — pas le JWT dashboard) : `GET /external/v1/content` (catalogue voitures/circuits agrégé sur tous les postes, dédoublonné par `acId`, image + catégorie + difficulté) et `GET /external/v1/menu` (carte resto/bar groupée). La tablette consomme ces deux routes avec une clé créée par l'utilisateur (`ext_...`, nom "Catalogue").
- **Frontend, nouvelle instance axios dédiée** (`services/externalApi.ts`) — jamais `services/api.ts` (celle-ci attache le JWT localStorage et redirige vers `/login` sur 401, ce qui casserait une tablette publique sans compte). Clé API lue au build depuis `VITE_TABLET_MENU_API_KEY` (`apps/frontend/.env`, gitignored, jamais committée en clair).
- **Simplifications volontaires par rapport à la maquette** (hors scope de la demande, notées explicitement) : pas de toggle FR/EN (tout le reste du site est 100% français, sans infra i18n), pas de photo d'ambiance sur l'écran de veille (pas de source réelle disponible pour l'instant — juste le fond dégradé).

## v2.2.116 — Le format de course devient sa propre étape du wizard, séparée de la configuration de base

### Changé

- **Demandé par l'utilisateur : "il faut vraiment que tout le system de course soit dans une page différent si il faut dupliquer certainne choses fait le mais il faut bien séparer ça du system de bases".** En v2.2.115, le sélecteur de format de course avait été ajouté directement dans le panneau récapitulatif de l'étape 3 ("Configuration") du wizard `CreateDedicatedServer.tsx`, mélangeant un choix de nature "course" (Practice/Qualifying/Race) avec la configuration de base du serveur (poste, circuit, voitures, slots, mot de passe).
- Le wizard passe de 3 à **4 étapes** : Simulateur → Circuit → Configuration → **Course**. La nouvelle étape 4 (`StepRaceFormat`) reprend la sélection de format sous forme de grille de cartes cliquables (un preset par carte, badges Practice/Qualifying/Race/grille/météo — même contenu visuel que `RaceFormatCard` de `RaceFormats.tsx`, dupliqué localement plutôt que partagé entre les deux pages) plutôt qu'un simple `<select>` noyé dans un récapitulatif d'étape précédente. Un lien "Gérer les formats" ouvre `/race-formats` dans un nouvel onglet sans perdre la progression du wizard.
- Le panneau récapitulatif (Poste/Circuit/Slots/Accès/Format + checklist finale) est **dupliqué** entre l'étape 3 et l'étape 4 plutôt que partagé — chaque étape reste lisible seule, sans dépendre de ce qui restait affiché à l'écran précédent.
- `canProceed()` pour l'étape 3 exige désormais nom + au moins une voiture (le format de course n'est plus une condition à ce stade, il est vérifié à l'étape 4 avec `canSubmit`).
- Changement purement frontend, aucun code agent modifié — pas de nouvelle release GitHub, seulement rebuild + redéploiement du conteneur Docker `backend` (qui sert aussi le frontend).

## v2.2.115 — Formats de course : Practice/Qualifying/Race entièrement configurables

### Ajouté

- **Demandé par l'utilisateur : "créer un system de race donc practice qualif et race vraiment propre et avec toute les fonctionaliter choix des temps etc".** Nouvelle page admin **Formats de course** (`/race-formats`) : CRUD de presets réutilisables, chacun définissant Practice (activé + durée), Qualifying (activé + durée), Race (activé + tours **ou** durée, grille de départ normale/inversée top 3/top 8/complète), et une ou plusieurs météo (le serveur alterne entre elles s'il y en a plusieurs). Un format nommé **"Practice libre (12h)"** est créé automatiquement par la migration, avec exactement le comportement par défaut existant (v2.2.105) — rien ne change pour les serveurs créés sans y toucher.
- **Assistant "Créer un serveur dédié"** : nouveau sélecteur **Format de course**, obligatoire, toujours visible dans le récapitulatif de configuration (pas caché dans "Options avancées") — présélectionné sur le premier format disponible.
- **Backend** : modèle `RaceFormat` (Prisma) + `RaceFormatsModule` (`GET/POST/PATCH/DELETE /api/race-formats`, lecture admin+technicien pour l'assistant, écriture admin uniquement). `DedicatedServer.raceFormatId` (FK nullable, `SetNull` à la suppression d'un format). Le format choisi est résolu une seule fois à la création du serveur et envoyé à l'agent sous forme de valeurs déjà calculées (`RaceFormatConfig`, `@simracing/shared`) — l'agent ne connaît jamais l'entité `RaceFormat`, même principe que `carName`/`trackName` déjà résolus côté backend.
- **Agent** : `serverLauncher.ts#writeServerConfig()` génère désormais `[PRACTICE]`/`[QUALIFY]`/`[RACE]`/`[WEATHER_N]` dynamiquement à partir du format reçu — une session désactivée est **absente** du `server_cfg.ini` (`acServer.exe` passe simplement à la session suivante) plutôt que représentée par un faux "off". `[RACE]` écrit `LAPS=` ou `TIME=` selon le mode choisi, plus `REVERSED_GRID_RACE_POSITIONS=` (0/3/8/-1 selon le type de grille). Filet de sécurité si un payload arrive sans `raceFormat` (décalage de version pendant un déploiement) : mêmes valeurs par défaut qu'avant cette fonctionnalité.
- **Limite honnête assumée** : `acServer.exe` (protocole dédié vanilla, sans extension serveur CSP) n'a pas de notion de météo _par session_ — les `[WEATHER_N]` s'appliquent à tout le serveur, avec rotation entre plusieurs entrées d'un lancement à l'autre si plusieurs sont configurées. Pas de "Practice ensoleillé, Race sous la pluie" déterministe possible avec ce protocole.

## v2.2.114 — Le jeu se fermait tout seul dès qu'on rentrait en session, quand il était lancé sans passer par l'agent

### Corrigé

- **Signalé par l'utilisateur : "quand je lance le jeu sans passer par l'agent il se coupe tout de suite dès qu'on rentre dans la session".** Cause : `LuaBridge.sendCommand()` écrit chaque commande (`command.txt`) mais ne l'efface jamais après exécution — et `luaBridge.quit()` (la commande envoyée à la toute fin de **chaque** session, normale ou dédiée) écrit `type=quit`. Ce fichier restait donc sur disque avec `quit` comme dernière commande en permanence entre deux sessions. Le compteur `lastCommandId` de l'app Lua repart à `nil` à chaque nouveau chargement d'AC — au tout premier tick d'une nouvelle session, l'app Lua trouve ce `quit` périmé, le prend pour une commande toute neuve et l'exécute (`ac.shutdownAssettoCorsa()`), fermant le jeu quasi instantanément. Un lancement via l'agent échappe au bug par pur hasard de timing : `autoStart()` réécrit `command.txt` juste après avoir spawné `acs.exe`, bien avant qu'AC n'ait eu le temps de charger son environnement Lua — un lancement direct (Steam, Content Manager, double-clic sur `acs.exe`...) n'a rien qui réécrit ce fichier avant que l'app Lua ne lise le `quit` laissé par la session précédente.
- Fix : nouvelle méthode `LuaBridge.clearCommand()` (supprime `command.txt`, best-effort), appelée dans `AcLauncher.stop()` une fois AC confirmé arrêté (gracieux ou forcé) — chaque fin de session repart donc sur un fichier de commande propre, quel que soit le prochain moyen de lancement.

## v2.2.113 — Diaporama de lancement repensé de zéro : bascule de classe par timer au lieu de keyframes CSS

### Changé

- **Demandé par l'utilisateur : repartir de zéro sur la transition, quitte à abandonner le fondu s'il le faut, pour un rendu propre et sans lag possible.** L'ancien mécanisme (N couches empilées, chacune avec son propre `animation-delay`, toutes animées en permanence via un `@keyframes` calculé en pourcentages) a connu plusieurs bugs réels en quatre versions (fondu asymétrique, hack GPU probablement responsable d'un blocage total de l'animation) avant que la vraie cause de "rien ne change" soit trouvée ailleurs (cache IE11 sur un nom de fichier fixe, v2.2.112). Une fois cette cause réglée, le mécanisme CSS lui-même restait plus complexe que nécessaire.
- **Nouveau mécanisme, radicalement plus simple** : chaque image de fond est une couche `.scene-bg-layer` normale ; seule la première démarre avec la classe `active`. Un minuscule script inline (`renderSlideshowScript()`) déplace cette classe d'une couche à la suivante toutes les 4 secondes via `setInterval` — la transition `opacity` déjà existante et déjà éprouvée pour le cas image unique fait tout le travail de fondu des deux côtés en même temps, puisque les deux couches réagissent à la même mutation DOM. Plus aucun calcul de pourcentages de keyframes, plus qu'un seul fondu actif à la fois (au lieu de N animations perpétuelles en arrière-plan) — la lecture la plus directe possible de "propre et sans lag".
- **Le script est protégé (`try/catch`) et le côté sûr par défaut** : si l'exécution JS échouait pour une raison quelconque dans ce moteur, la première image reste simplement affichée sans rotation — jamais d'écran cassé, juste pas de diaporama. L'ancienne réserve envers le JS dans ce moteur ("aucun antécédent vérifié") est levée : `FEATURE_BROWSER_EMULATION` force déjà un vrai mode document IE11, où `setInterval`/`className` sont des fonctionnalités de base, pas une zone grise — et l'approche 100% CSS a fini par accumuler plus de bugs réels que n'en aurait jamais causé un script aussi minimal.
- Nouveau test verrouillant le mécanisme : la classe `active` n'existe qu'une fois dans le HTML initial, le script de rotation est bien présent pour plusieurs images et absent pour une seule.

## v2.2.112 — Vraie root-cause : le fichier HTML de lancement gardait toujours le même nom, IE11 servait une version en cache

### Corrigé

- **Signalé par l'utilisateur après v2.2.108→111 : "rendu exactement comme si rien n'avait changé"** — un signal fort qu'aucune des quatre corrections précédentes (fondu symétrique, promotion GPU puis son retrait, réglages de rythme) n'avait de chance d'être visible, quel que soit leur bien-fondé individuel.
- **Vraie cause trouvée** : `generateLaunchingHtml()` écrivait toujours sur le même chemin fixe (`session-launching.html`), et le contrôle WebBrowser (moteur IE11) garde un cache disque persistant indexé par URL qui survit au redémarrage du processus — chaque écran de lancement est une toute nouvelle fenêtre PowerShell/WPF, pas un rechargement d'une fenêtre déjà ouverte, donc `Navigate()` vers un chemin déjà visité par une session précédente peut renvoyer le document mis en cache au lieu de reparser le fichier fraîchement réécrit. Résultat : n'importe quel changement de CSS/HTML sur cet écran pouvait rester invisible indéfiniment, peu importe sa correction.
- **Fix** : chaque génération de l'écran de lancement obtient désormais un nom de fichier unique (`session-launching-<timestamp>-<random>.html`), donc jamais vu par le cache. Le fichier précédent est supprimé juste après la bascule vers le nouveau pour ne pas accumuler de fichiers dans le dossier temporaire sur une longue session. L'écran de résultats n'est pas concerné : son mécanisme de rafraîchissement en place (poll + `Navigate()` vers le même chemin, déjà en prod) dépend justement d'un chemin stable pour fonctionner.
- Nouveau test verrouillant ce comportement : deux lancements séparés (avec un vrai redémarrage entre les deux, pas la mise à jour en place déjà couverte) doivent obtenir deux chemins différents.

## v2.2.111 — Retrait du hack GPU probablement responsable du "pop" au lieu du fondu

### Corrigé

- **Signalé par l'utilisateur après la mise à jour v2.2.109/110 : transition toujours pas fluide, désormais décrite comme "écran noir et paf prochaine image"** — un symptôme de cut brutal, pas d'un fondu qui manque juste de finesse. Suspect principal : le hack de promotion GPU ajouté en v2.2.109 (`transform: translateZ(0)` sur `.scene-bg-layer`), une technique choisie sans aucun antécédent vérifié dans cette combinaison précise (WPF WebBrowser control verrouillé sur le moteur IE11) — or les anciens builds Trident ont un historique documenté de blocage complet de l'animation d'autres propriétés sur un élément promu en 3D, plutôt qu'une simple accélération. Ce comportement collerait exactement avec un cut brutal à la place d'un fondu.
- **Retiré** : plus de `transform`/`backface-visibility` sur les couches de fond. Retour à une animation `opacity` pure, sans aucun hack — la même approche minimale déjà éprouvée ailleurs dans cette feuille de style (transition `.scene-bg-layer` d'origine, animations spinner/barre de chargement) plutôt qu'une technique inventée sans preuve qu'elle fonctionne dans ce moteur précis. Le fondu croisé symétrique (v2.2.109) et la neutralisation du conflit `transition`/`animation` restent en place, tous deux de simples animations `opacity` sans transform.
- Courbe de transition repassée de `cubic-bezier(0.45, 0, 0.55, 1)` à `ease-in-out`, déjà utilisée avec succès pour l'opacité dans cette même feuille de style.

## v2.2.110 — Root-cause du jank du diaporama : images redimensionnées côté serveur + bug de cache agent corrigé

### Ajouté

- **Suite du fix v2.2.109 : redimensionnement automatique des images de blanking (`launching`/`results`) à l'upload.** Confirmé en creusant que les 11 photos de lancement actuellement en ligne pesaient jusqu'à 2,2 Mo en **5120×1440 natif** (résolution des fonds d'écran sources), sans aucune limite ni redimensionnement nulle part dans le pipeline d'upload (max 100 Mo autorisé). Décoder et blender plusieurs images de cette taille en continu dans le moteur IE11 (software, pas de vraie composition GPU pour du contenu non promu) était probablement le facteur dominant du jank, indépendamment du fondu CSS lui-même. Nouvelle dépendance `sharp` côté backend : toute image envoyée sur ces catégories est désormais limitée à 2560px sur son plus grand côté (`fit: inside`, format d'origine conservé, aucun forçage en JPEG) — largement au-dessus de la résolution physique de n'importe quel POD connu (1920×1080), très en dessous du coût de décodage d'un fond d'écran natif.
- **Migration ponctuelle des 12 fichiers déjà en base** (11 photos de lancement + logo résultats) : toutes redimensionnées en place (même id, `updatedAt` mis à jour automatiquement par Prisma). Exemple : `2024-Formula1-Alpine-A524-001-1440sw.jpg` passe de 2 178 025 à 394 325 octets (5120×1440 → 2560×720).

### Corrigé

- **Bug de cache trouvé en creusant le pipeline de sync agent, indépendant du jank lui-même mais qui aurait empêché ce correctif de jamais atteindre les PODs déjà provisionnés** : `BlankingMediaSync.syncCategory()` ne re-téléchargeait un média que s'il n'existait pas _du tout_ localement (`localFiles.has(id+ext)`) — un fichier déjà présent sous son id était considéré à jour pour toujours, même si son contenu changeait côté serveur (comme ici, un remplacement en place lors du redimensionnement). Nouveau manifeste local (`.manifest.json` par catégorie, `id → updatedAt`) : un média n'est plus considéré à jour que si son `updatedAt` serveur correspond à celui enregistré lors du dernier téléchargement — sinon il est retéléchargé même si le fichier existe déjà localement.

## v2.2.109 — Diaporama de lancement : transition repensée pour être vraiment fluide

### Changé

- **Signalé par l'utilisateur après la mise à jour v2.2.108 : la transition n'était toujours pas fluide malgré le fondu enchaîné corrigé.** Root-cause probable identifiée en creusant : deux problèmes de rendu spécifiques au moteur IE11 (WPF WebBrowser control) faisaient concurrence au fondu, indépendamment de la correction du fondu croisé lui-même.
  1. **Pas de promotion GPU** : `.scene-bg-layer` n'avait aucun hint de composition matérielle — le moteur software-rasterisait chaque image plein écran à chaque tick d'opacité au lieu de déléguer le blend au compositeur DirectComposition. Ajout du "null transform hack" (`transform: translateZ(0)`, supporté depuis IE10) sur toutes les couches de fond, y compris l'écran de résultats.
  2. **`transition` et `animation` en conflit sur `opacity`** : la règle de base `.scene-bg-layer` posait un `transition: opacity` pensé pour le cas image unique (`.active`), toujours actif sur les couches en rotation où c'est le `@keyframes` qui pilote `opacity` — les deux mécanismes se disputaient la même propriété à chaque frame dans IE11. `.scene-bg-layer.slideshow` neutralise maintenant explicitement la transition.
- **Rythme retravaillé pour un rendu plus posé/premium** : intervalle 2500ms → 4000ms, fondu 1200ms → 1800ms — l'ancien réglage ne laissait qu'1,3s d'image parfaitement stable entre deux fondus (près de la moitié du cycle en transition permanente), ce qui donnait une impression d'agitation plutôt que de fluidité, même une fois le fondu lui-même corrigé.
- **Piste non retenue dans ce correctif, à évaluer séparément** : les photos de lancement actuellement en ligne pèsent 600 Ko–2,2 Mo en JPEG, très probablement à la résolution native des fonds d'écran sources (jusqu'à 5120×1440) — aucune redimension n'existe nulle part dans le pipeline d'upload (`blanking-media.service.ts`). Décoder et blender plusieurs images de cette taille en continu peut à lui seul rester coûteux pour le rendu logiciel d'IE11, même avec la promotion GPU. Un vrai correctif root-cause impliquerait de redimensionner les images côté backend (nouvelle dépendance `sharp`) et de corriger un bug de cache constaté au passage dans `blankingMediaSync.ts` (l'agent ne retélécharge jamais un média dont l'id existe déjà localement, même si son contenu a changé côté serveur) — hors scope de ce correctif, nécessite un go séparé de l'utilisateur avant d'y toucher (nouvelle dépendance + migration de données).

## v2.2.108 — Le diaporama de l'écran de lancement fait un vrai fondu enchaîné

### Corrigé

- **Signalé par l'utilisateur : la transition entre les images de l'écran de lancement n'était pas fluide/propre.** `renderSlideshowStyles()` ne définissait qu'un fondu de _sortie_ (`opacity: 1 → 1 → 0 → 0`) — chaque photo s'effaçait donc vers le noir toute seule, puis la suivante apparaissait d'un coup à pleine opacité une fois le fondu terminé : un fondu au noir suivi d'un cut, pas un vrai fondu enchaîné.
- Les keyframes CSS sont désormais symétriques : chaque image fond en entrée pendant la toute fin du cycle précédent (`100% - fadePct` → `100%`, les deux bornes à opacité 1 pour que la boucle reparte sans saut) exactement pendant la même fenêtre où l'image précédente fond en sortie — les deux se fondent donc réellement l'une dans l'autre au lieu de passer chacune par le noir. Courbe de transition passée de `ease-in-out` à `cubic-bezier(0.45, 0, 0.55, 1)` pour un rendu plus doux. Toujours 100% CSS `@keyframes` (pas de JS, moteur IE11 de la WebBrowser control — voir `renderSlideshowStyles()`).

## v2.2.107 — Refonte HUD de la page Sessions en cours + protection anti-missclick

### Changé

- **Demandé par l'utilisateur : refaire le design de `/en-cours` dans le même style HUD racing-blue/cyan que le reste du site** (Dashboard, Postes, Serveurs dédiés, Kiosque, Assistant serveur), resté à l'ancien design system (orange, cartes génériques) depuis la refonte v2.2.96. Design produit avec Claude Design (projet "Assetto Corsa HUD Design", fichier `Sessions en cours HUD.dc.html`) puis adapté directement en React/Tailwind : état vide avec anneaux concentriques + motif diagonal, cartes de session avec vignette circuit, jauges arc SVG RPM/vitesse, barres accélérateur/frein/progression circuit, tuiles meilleur/dernier tour, badges de connexion et de difficulté. Icônes Phosphor du mockup converties en Lucide (seule bibliothèque du projet).

### Ajouté

- **Demandé par l'utilisateur : protéger les boutons à risque (Stop, réduction de temps) contre les erreurs de missclick, avec une confirmation simple.** Nouveau composant `ConfirmButton` : premier clic arme le bouton (libellé "Confirmer ?" + barre témoin qui se vide sur ~2,2s), second clic dans la fenêtre déclenche l'action, sinon retour automatique à l'état normal. Appliqué au bouton **Stop** et aux boutons **−1 min / −5 min** de chaque carte de session — les boutons d'ajout de temps (+1/+5/+15 min), sans risque, restent en accès direct.

## v2.2.106 — Date de création visible sur les serveurs dédiés

### Ajouté

- **Demandé par l'utilisateur : ajouter une date de création visible sur les serveurs créés.** Chaque carte de la page `/dedicated-servers` affiche désormais "Créé le JJ/MM/AAAA HH:MM" (`DedicatedServer.createdAt`, déjà présent en base et déjà renvoyé par l'API — aucun changement backend nécessaire, seul l'affichage manquait côté frontend).

## v2.2.105 — Les serveurs dédiés restent en Practice 12h au lieu de basculer en Qualifying/Race au bout de 30 min

### Changé

- **Demandé par l'utilisateur : "quand tu crée les serveur tu les place en 12H de durée pour éviter qu'il change ... et si possible le bloquer sur l'heur actuelle qu'on avait mis niveau soleil".** `[PRACTICE] TIME=` dans `server_cfg.ini` (`serverLauncher.ts#writeServerConfig()`) passe de `30` à `720` (minutes, soit 12h) : avec `LOOP_MODE=1`, une durée courte faisait basculer automatiquement le serveur en Qualifying puis Race au bout de 30-45 min, coupant les pilotes en pleine conduite libre (grille imposée, écran de session). 12h couvre toute une journée d'exploitation sans jamais quitter Practice.
- **L'heure/soleil (`SUN_ANGLE=80`, ~17:00) était déjà fixe et identique pour chaque serveur créé** (constante codée en dur, aucun champ ne permet de le faire varier à la création) — déjà "bloqué" comme demandé, aucun changement nécessaire sur ce point.

## v2.2.104 — Le blanking de lancement se retirait trop tôt, avant que le pilote soit vraiment en piste

### Corrigé

- **Signalé par l'utilisateur : "il faut bien que le blanking screen de start ... ce retire avec le temps mis dans les paramétre du site mais aprés la mise en drive"** (déjà signalé une première fois plus tôt dans le projet, réapparu). Deux mécanismes déclenchaient le compte à rebours de retrait du blanking bien avant que le pilote soit réellement en piste : `notifyDriveTriggered()` (appelé juste après l'envoi de la commande `autoStart` à l'app Lua — un simple fichier écrit sur disque, sans confirmation, potentiellement des dizaines de secondes avant qu'AC n'ait fini de charger) et, dans `evaluate()`, `acRunning` seul (le process `acs.exe` détecté vivant, ce qui arrive dès l'apparition du process dans la liste Windows — bien avant que le menu ou la voiture n'aient chargé). Résultat : le blanking se retirait pendant qu'AC affichait encore son propre écran de chargement/menu en dessous.
- `notifyDriveTriggered()` supprimé (plus appelé nulle part). Le déclencheur du décompte devient `acLoaded` (mémoire partagée AC mappée **et** fraîche, `packetId` qui avance) — le seul signal qui reflète réellement une session live avec la voiture spawnée, donc la vraie "mise en drive". `acRunning` seul ne suffit plus à démarrer le décompte, mais reste un filet de sécurité (`AC_LOADED_SAFETY_FALLBACK_MS`, 90s) pour ne jamais bloquer le blanking indéfiniment si la mémoire partagée ne se charge jamais.

## v2.2.103 — Le rétroviseur virtuel (F11) est désormais activé par défaut à chaque lancement

### Changé

- **Demandé par l'utilisateur : "il faudrais ajouter l'option au lancement du rétro intérieur f11 par default".** `AcLauncher` ne touchait jamais à `cfg/gameplay.ini` : sans `[VIRTUAL_MIRROR] ACTIVE=1` dans ce fichier, l'app HUD du rétroviseur virtuel n'existe pas du tout et la touche F11 (raccourci par défaut d'AC pour l'afficher/masquer) ne fait rien. Nouvelle méthode `configureGameplayIni()`, appelée à chaque lancement (`launch()` et `joinServer()`) juste après `configureVideoIni()`, qui force cette valeur à `1` (même prudence que pour `video.ini` : si `gameplay.ini` n'existe pas encore sur le poste, on ne le crée pas nous-même).

## v2.2.102 — Le pilote et un skin aléatoire sont désormais envoyés à AC/Content Manager en rejoignant un serveur

### Changé

- **Demandé par l'utilisateur : "j'aimerais que ça envoie a content manager le nom du pilote pour qu'il le voie en jeu" + "et skin random".** `AcLauncher.writeJoinRaceIni()` (le `race.ini` écrit avant de lancer `acs.exe` pour rejoindre un serveur dédié) écrivait `DRIVERNAME=`/`NAME=` (`[CAR_0]`/`[REMOTE]`) systématiquement vides, alors que le nom du pilote (`clientName`, saisi côté kiosque/dashboard à l'envoi du POD) est déjà transmis à l'agent dans le payload `server:join` — il n'était simplement jamais reporté dans le fichier. Les deux champs sont désormais remplis avec ce nom (CR/LF filtrés pour ne pas casser la structure ligne-par-ligne de l'INI), donc AC — et Content Manager si utilisé comme overlay — l'affichent réellement en jeu.
- `SKIN=` (vide, ce qui figeait tout le monde sur le même skin par défaut) passé à `SKIN=random` dans `[RACE]`/`[CAR_0]`, aussi bien pour le join (`writeJoinRaceIni`) que pour le lancement direct/solo (`writeRaceIni`), pour varier l'apparence des voitures.

## v2.2.101 — Correctifs suite au premier vrai test sur POD (diaporama figé, blanking qui ne se retire pas)

### Corrigé

- **Signalé par l'utilisateur après la mise à jour v2.2.100 sur `desktop-gl3t50t` : les images de lancement ne tournaient pas, et le blanking ne se retirait pas ~5s après la mise en Drive.** La série v2.2.84→v2.2.100 (dont le diaporama et le mécanisme de confirmation `notifyDriveTriggered`/`revealThenStop`) n'avait jamais tourné sur du vrai matériel avant cette mise à jour — seulement testée via les mocks Vitest.
- **Diaporama** : la rotation reposait sur un `<script>` (`setInterval`) — le tout premier script embarqué dans ces écrans, jamais exécuté en conditions réelles dans le moteur IE11 de la WebBrowser control WPF. Remplacée par une **animation CSS `@keyframes` pure** (`scene-bg-layer.slideshow` + `animation-delay` décalé par image), la même technique déjà utilisée avec succès dans ce fichier pour le spinner et la barre de chargement — aucune dépendance à l'exécution de JS dans ce moteur.
- **Blanking qui ne se retire pas** : `BlankingManager.revealThenStop()` attendait `onGameRevealed()` (`KioskManager.revealGame()`, un spawn PowerShell) sans aucune limite de temps propre — si ce spawn restait bloqué (process PowerShell coincé), `this.revealing` restait `true` pour toujours et **plus aucun appel ultérieur ne pouvait jamais retirer le blanking**, pour le reste de la session voire des sessions suivantes. Trois filets de sécurité imbriqués ajoutés : le timeout interne de `kiosk.ps1` (`ForegroundTimeoutMs`, réduit de 20s à 6s), un nouveau timeout côté agent dans `KioskManager.runAwaited()` (9s, force-kill le process PowerShell s'il n'est pas sorti), et un nouveau `REVEAL_WATCHDOG_MS` (12s) dans `revealThenStop()` lui-même qui force la suite même si tout le reste est resté bloqué. Fait aussi tomber le pire cas total (3 tentatives) de 60s à 36s.

## v2.2.100 — Diaporama en fondu pour les images de lancement

### Changé

- **Demandé par l'utilisateur : "j'aimerais que chaque Images de lancement ce change avec une jolie transition toute les 2-3 secondes".** L'écran "Lancement en cours" affichait une seule image de fond, choisie au hasard parmi la playlist `launching` au début de chaque session, fixe pour toute sa durée. Il affiche maintenant **toutes** les images de la playlist, empilées et fondues en fondu enchaîné les unes sur les autres toutes les 2,5s (transition CSS `opacity` de 1,2s). L'ordre de rotation est mélangé à chaque nouveau lancement (même intention de variété qu'avant, plus poussée). Une playlist à une seule image reste statique (aucune rotation inutile) ; playlist vide inchangée (dégradé/texture par défaut).
- `BlankingManager.commonStyles()` généralisé pour prendre un tableau d'images au lieu d'une seule (`photoPaths: string[]`) — réutilisé tel quel par l'écran de résultats (toujours un logo unique, donc jamais de rotation là) pour éviter deux mécanismes de fond d'écran qui divergent avec le temps.
- Rotation implémentée en JS ES5 pur (`var`, pas de flèches/template literals) car rendue dans le moteur IE11 de la WebBrowser control WPF (`blanking.ps1`) — aucun script embarqué n'existait avant dans ces écrans.

## v2.2.99 — Le logo devient le vrai fond de l'écran de résultats

### Changé

- **Demandé par l'utilisateur : "il faut les images et le logo que je donne, pas le fond par défaut".** Le logo de résultats (catégorie globale `results`) n'était affiché qu'en petit filigrane centré, faiblement opaque, par-dessus le dégradé de fond par défaut — qui restait donc toujours visible. Le logo est désormais utilisé comme **vrai fond d'écran** (plein cadre, même traitement `cover` + voile sombre que les photos de lancement), et le dégradé/texture/anneau/texte "AC" par défaut ne s'affichent plus du tout dès qu'un logo est configuré — exactement le même comportement que l'écran de lancement avec ses photos.

## v2.2.98 — Le décompte de session démarre au retrait du blanking, pas au lancement

### Changé

- **Demandé par l'utilisateur : "lance le décompte du timer après avoir retiré le blanking screen drive, en gros quand il peut commencer à rouler".** Pour un join de serveur dédié avec une durée fixée, `Session.startedAt` (et donc le décompte affiché sur `/en-cours`, `/en-cours/kiosk` et `/kiosk`) était fixé à l'instant où la commande de join était reçue par le backend — avant même que l'agent lance Content Manager/AC. Le chargement (CM, AC, circuit) pouvait manger 10-15s de la durée sans que le pilote ait pu rouler une seconde.
- **Nouveau point d'ancrage : le moment où le blanking est réellement retiré et le jeu confirmé au premier plan** (`BlankingManager.revealThenStop()` → nouveau callback `onSessionRevealed`, câblé depuis `agent.ts#handleSessionRevealed()`). L'agent n'appelle plus `scheduleSessionEnd()` (le timer d'arrêt auto réel) au moment du join, mais seulement à ce moment-là — et envoie un nouvel événement `agent:session:started` au backend, qui met à jour `Session.startedAt` et republie `session:updated`. Si le staff prolonge la session pendant que l'écran de chargement est encore affiché, la nouvelle durée est mémorisée mais le décompte ne démarre toujours qu'au reveal.
- `Session.startedAt` n'est plus renseigné à la création pour un join de serveur dédié — reste `null` jusqu'au reveal ; le frontend traitait déjà ce cas (aucun décompte affiché tant qu'il est absent), un seul ajustement nécessaire (tri par date + calcul du temps écoulé sur `/kiosk`/`/en-cours/kiosk`, qui ne géraient pas encore ce cas).

## v2.2.97 — Retrait du nom de layout sur les écrans de lancement/résultats

### Changé

- **Demandé par l'utilisateur : "retire le nom des layout pas besoin".** Les écrans de lancement et de résultats affichaient `Circuit (Layout)` quand un layout était renseigné (ex. "Spa-Francorchamps (gp)") — n'affichent plus que le nom du circuit.

## v2.2.96 — Refonte visuelle des écrans de lancement/résultats + config globale

### Changé

- **Refonte complète du design des écrans "Lancement" et "Résultats"**, à partir d'une maquette fournie par l'utilisateur (Claude Design, projet "Assetto Corsa HUD Design") : nouveau panneau HUD translucide centré (bordure fine, coins en équerre cyan, barres d'accent bleu racing/violet), typographie condensée en majuscules, thème bleu racing (`#0057ff`→`#00c2ff`) avec l'orange conservé uniquement en petite touche (meilleur tour). Écran de résultats : position finale affichée en tête (or/argent/bronze), classement en lignes (plus un tableau HTML), 3 tuiles d'info (circuit/voiture/meilleur tour, + tuile tour non-validé si présent). Toute la mise en page utilise une seule unité (vw dérivée du design natif 5120x1440) au lieu du système précédent vw+override vh à 5120px — fonctionne nativement aux deux résolutions (1920x1080 et 5120x1440) sans double réglage, vérifié visuellement aux deux tailles.
- **Compatibilité IE11 (moteur de rendu de `blanking.ps1`)** : le design source utilise `backdrop-filter`/`clip-path`/`display:grid`, tous non supportés par IE11 — remplacés respectivement par une transparence simple (opacité de fond), des coins droits, et des lignes flexbox (déjà éprouvé dans ce moteur via `gap`).
- **Demandé par l'utilisateur : "vu que tous les simus auront le même écran de chargement et de fin, configurer ça au même endroit pour tous les pods"** — `BlankingMedia.stationId` devient nullable ; les catégories `launching` (plusieurs images, une choisie au hasard par lancement, en fond plein écran) et `results` (un seul logo, incrusté en filigrane centré) passent en **médias globaux** (un seul jeu de fichiers pour toute la flotte), avec deux nouveaux endpoints `/api/blanking-media/global` (list/upload/reorder) et `/api/blanking-media/global/:id` (delete). L'écran d'attente (`idle`) reste per-station, inchangé. Nouvelle diffusion WebSocket : une mise à jour de média global notifie tous les agents connectés (`server.emit`, même mécanisme que `settings:updated`) au lieu de cibler une seule room de station.
- Les boutons "Images de lancement"/"Logo écran de fin" retirés du panneau par-station (page Postes) ; remplacés par deux sections toujours visibles en haut de la page `/blanking-media`, à côté de l'envoi groupé existant pour l'écran d'attente.

## v2.2.95 — Images personnalisées pour les écrans de lancement et de fin

### Ajouté

- **Demandé par l'utilisateur : "avoir plusieurs images pour le blanking screen de start et juste le logo en fin".** `BlankingMedia` gère désormais 3 catégories bien distinctes par station : `idle` (écran d'attente existant, inchangé — diaporama images/vidéos), `launching` (nouveau — plusieurs images de fond, une choisie au hasard à chaque lancement de session) et `results` (nouveau — un seul logo, remplacé si un nouvel upload arrive). Chaque catégorie a son propre stockage/upload/liste côté backend (`?category=` sur les endpoints `blanking-media` existants, défaut `idle` pour rester compatible), sa propre synchronisation locale côté agent (dossiers séparés), et sa propre logique d'affichage — aucun mélange possible entre les trois écrans.
- Écran de lancement : l'image choisie remplit tout le fond (`cover`) avec un léger voile sombre pour garder le texte (pilote/voiture/circuit) lisible par-dessus.
- Écran de fin : le logo s'affiche en incrustation centrée (`contain`, ~30% de la hauteur d'écran), pas étiré en plein écran, pour ne pas déformer un logo.
- Nouveau : deux boutons "Images de lancement" et "Logo écran de fin" dans le panneau "Écran" de chaque station (dashboard), même interface que l'écran d'attente existant (glisser-déposer, suppression), sans réordonnancement pour le logo (un seul fichier).
- Prochaine étape (hors de cette version) : demander les visuels eux-mêmes à un outil de design, puis les uploader via ces nouveaux boutons.

## v2.2.94 — Retrait du forçage FULLSCREEN au lancement

### Corrigé

- **Signalé par l'utilisateur : rétroviseur intérieur, app leaderboard CSP et drapeaux ne fonctionnaient plus sur certains PODs.** Root-cause trouvée en comparant `video.ini` d'un POD sain avec le code : le forçage inconditionnel de `FULLSCREEN=1` ajouté en v2.2.91 écrasait `FULLSCREEN=0` sur les PODs qui tournent en fenêtré sans bordure positionné manuellement via `_EXT_PLACEMENT` de CSP (technique utilisée pour les configs ultrawide/triple écran, ex. 5120x1440). Passer en plein écran exclusif cassait ce placement, avec pour effet de bord de casser le rendu des overlays CSP (mirror, leaderboard, drapeaux). `configureVideoIni()` ne touche plus à `FULLSCREEN` — chaque POD garde sa configuration vidéo existante.

## v2.2.93 — Correction du SUN_ANGLE pour viser vraiment 17h

### Corrigé

- **Signalé par l'utilisateur juste après le déploiement de v2.2.92 : "SUN_ANGLE=48 correspond à environ 15h en jeu, pas 17h".** Calibré avec ce point de mesure réel : 48 unités = 3h après midi (SUN_ANGLE=0 = 12h) → ~16 unités/heure → 80 unités pour 17h (5h après midi). Reste une approximation (la position solaire réelle dépend de la localisation de chaque circuit), mais nettement plus proche que la valeur précédente.

## v2.2.92 — Météo claire et 17h par défaut pour tous les serveurs dédiés

### Ajouté

- **Demandé par l'utilisateur : "sur toutes les créations de serveur soit en weather clear et à 17h".** La météo `3_clear` (ciel dégagé) était déjà appliquée par défaut à chaque serveur dédié ; il manquait l'heure — aucun `SUN_ANGLE` n'était écrit dans `server_cfg.ini`, laissant AC sur son heure par défaut. Ajouté `SUN_ANGLE=48` dans la section `[SERVER]`, en miroir du `SUN_ANGLE=-48` déjà utilisé ailleurs pour les sessions classiques (même magnitude bien éclairée, côté après-midi/soir au lieu du matin).
- **Non vérifié en jeu** : AC n'a pas de champ "heure" direct, seulement cet angle solaire — la valeur est une estimation raisonnée, pas testée en conditions réelles. À ajuster si l'heure affichée en jeu ne correspond pas exactement à 17h.

## v2.2.91 — Sécurité fin de session, plein écran forcé, écrans de blanking adaptés au 5120x1440

### Ajouté

- **Sécurité demandée par l'utilisateur : éviter qu'un client soit blessé par le retour de force si la voiture percute un mur pendant la fenêtre (jusqu'à 15s) entre la fin de session et la fermeture réelle du jeu.** 1 seconde après l'affichage de l'écran de blanking de fin, la voiture est automatiquement envoyée aux stands (`ac.tryToTeleportToPits()`, arrête et repositionne la voiture) puis le menu pause d'AC s'ouvre (touche Echap simulée via `System.Windows.Forms.SendKeys`) — les deux avant que la commande de fermeture du jeu ne soit envoyée. Appliqué aux deux chemins de fin de session (session suivie et arrêt manuel non suivi).
- **Plein écran forcé au lancement d'une session** : `video.ini` (`[VIDEO] FULLSCREEN=1`) est désormais toujours appliqué au lancement, y compris pour le lancement direct/Content Manager qui ne le configurait pas du tout auparavant (seul le join d'un serveur dédié le faisait).
- **Écrans de blanking (lancement + fin) adaptés à la résolution ultra-wide 5120x1440** : le dimensionnement (polices, espacements) était calculé en `vw` par rapport à une référence 16:9 — sur un écran 32:9, ça produisait un texte dimensionné par rapport à une largeur énorme plutôt que la hauteur réelle (1440px), assez surdimensionné pour faire déborder le classement hors de l'écran. Nouveau bloc `@media (min-width: 5120px)` recalculant chaque valeur en `vh` (proportionnel à la hauteur, comme prévu à l'origine) — vérifié visuellement en 5120x1440 et 1920x1080 (aucune régression sur les résolutions standards).

## v2.2.90 — Le délai avant retrait du blanking part du Drive automatique, pas de la détection du jeu

### Changé

- **Demandé par l'utilisateur : "si on met drive en soi le jeu est lancé".** Le délai configurable (Paramètres → "Délai avant le retrait du blanking une fois le jeu lancé") ne démarrait son compte à rebours qu'une fois `acRunning`/`acLoaded` détecté par sondage (toutes les ~2s) — quelques secondes après le moment réel où le Drive automatique (`luaBridge.autoStart()`) est déclenché, puisque celui-ci a lieu dès la fin du lancement/join, avant que le sondage n'ait la moindre chance de voir le jeu.
- **Fix** : nouveau `BlankingManager.notifyDriveTriggered()`, appelé juste après le Drive automatique dans `handleLaunch()`/`handleJoinServer()` — démarre le compte à rebours immédiatement à cet instant. L'ancien déclenchement par sondage `acRunning`/`acLoaded` reste en filet de sécurité (ne se redéclenche pas si un compte à rebours est déjà en cours).

## v2.2.89 — Le scan de contenu ne tourne plus en boucle toutes les 60s

### Changé

- **Demandé par l'utilisateur : "il faut vraiment une fois au lancement de l'agent seulement".** Le scan des voitures/circuits (lecture de centaines de dossiers et d'images de preview) tournait sur une boucle de 60s pendant toute la durée de connexion de l'agent, en plus du scan initial à la connexion — un travail disque/CPU répété pour un contenu qui ne change quasiment jamais une fois l'agent démarré.
- **Fix** : le scan ne se déclenche plus qu'une seule fois, à la connexion de l'agent. Un nouveau mod ajouté sur le poste sera pris en compte au prochain redémarrage de l'agent.

## v2.2.88 — Trois détections d'Assetto Corsa indépendantes fusionnées en une seule

### Corrigé

- **Signalé par l'utilisateur : création d'un serveur dédié échouée sur `pcelsassvap` avec "Assetto Corsa non trouvé", alors que le scan de contenu venait de trouver 214 voitures / 65 circuits sur `D:\SteamLibrary\...\assettocorsa` quelques secondes plus tôt.** Confirmé via les logs distants : la détection Steam (registre + bibliothèques secondaires, v2.2.85) n'avait été appliquée qu'au scan de contenu (`contentScanner.ts`) — le lancement de serveur dédié (`serverLauncher.ts`) et le lancement du jeu (`acLauncher.ts`) avaient chacun leur **propre copie, non mise à jour**, de la logique de détection (l'une limitée aux chemins Steam par défaut, l'autre encore plus sommaire : un unique chemin codé en dur si `AC_PATH` n'était pas configuré). Un `acPathResolver.ts` déjà présent dans le dépôt (jamais fini d'être branché) portait d'ailleurs une version encore plus ancienne de cette même logique, utilisée uniquement au démarrage de l'agent pour pré-remplir `AC_PATH`.
- **Fix** : toute la détection (registre Windows, bibliothèques Steam secondaires, chemins par défaut) vit maintenant dans un seul module partagé (`acPathResolver.ts`), utilisé par les quatre points qui en ont besoin — scan de contenu, lancement de serveur dédié, lancement du jeu, et résolution de `AC_PATH` au démarrage de l'agent. Impossible désormais qu'une installation Steam soit trouvée par l'un et invisible pour les autres.

## v2.2.87 — Un Assetto Corsa détecté ne peut plus jamais remonter 0 voiture/circuit

### Renforcé

- **Demandé par l'utilisateur : "si Assetto Corsa est détecté, 0 car et 0 track est impossible".** Trois renforts supplémentaires sur le pipeline de scan/envoi :
  - **Listage de dossiers avec retry** : `content/cars` et `content/tracks` sont maintenant lus avec 3 tentatives (500ms d'écart) avant d'abandonner — un accès disque transitoire (antivirus en plein scan, disque réseau/USB pas encore monté) ne peut plus se faire passer pour "ce dossier est vide".
  - **Alerte systématique, pas seulement en cas de régression** : si Assetto Corsa est détecté (chemin résolu, dossier `content/cars`/`content/tracks` trouvé) mais que le scan remonte 0 voiture ou 0 circuit, c'est désormais toujours signalé en erreur — même pour un tout premier scan sans historique — puisqu'une install AC réelle n'est jamais vide.
  - **L'envoi refuse un résultat vide suspect** : si un scan revient à 0 voiture ou 0 circuit alors que l'agent avait déjà synchronisé du contenu réel avant (cache local non vide), l'envoi au backend est bloqué — le contenu déjà connu côté serveur n'est jamais écrasé par un scan raté ponctuel. Un poste tout juste installé, sans aucun historique, continue lui d'envoyer normalement pour ne pas rester bloqué en "jamais synchronisé".

## v2.2.86 — Vérification, alerte et détection élargie pour les voitures/circuits (mods inclus)

### Ajouté

- **Demandé par l'utilisateur en suite du bug pod04/pcelsassvap : "rectification vérification alerte et analyse pour la recherche des track et car compatible avec mod".** Renforce le pipeline de bout en bout au lieu de ne corriger qu'un seul chemin d'installation :
  - **Détection Steam via le registre Windows** (`HKCU\SOFTWARE\Valve\Steam`, `HKLM...\Valve\Steam`) en plus des chemins devinés — c'est l'endroit où Steam enregistre lui-même son install, quel que soit le dossier choisi à l'installation, donc ça couvre des cas que la liste de chemins codés en dur ne peut jamais deviner.
  - **Alerte de régression** : si un scan trouve subitement beaucoup moins de voitures/circuits que le scan précédent (ex: bibliothèque Steam débranchée, dossier de contenu corrompu), c'est maintenant loggué en erreur et remonté au backend via `agent:log` à chaque cycle — jusqu'ici un scan "réussi" avec un résultat quasi vide ne se distinguait en rien d'un scan normal.
  - **Alerte visible dans le dashboard** : un badge "Aucun contenu" apparaît sur la page Postes pour tout poste connecté qui remonte 0 voiture ou 0 circuit, et un avertissement similaire s'affiche directement dans le sélecteur de poste hôte de l'assistant de création de serveur dédié (l'écran réellement concerné par le bug pod04/pcelsassvap, puisque c'est le contenu du poste hôte qui alimente le picker voiture/circuit) — plus besoin d'aller fouiller les logs distants pour s'en apercevoir.
- Les mods (voitures/circuits ajoutés manuellement ou via Content Manager) étaient déjà pris en compte par le scan une fois le dossier `content/cars`/`content/tracks` d'Assetto Corsa localisé — le vrai point de défaillance était uniquement la localisation de ce dossier, maintenant couverte par la détection registre + bibliothèques Steam (v2.2.85) + ce fix.

## v2.2.85 — La détection auto d'Assetto Corsa ratait les installs sur une bibliothèque Steam secondaire

### Corrigé

- **Signalé par l'utilisateur : deux nouveaux postes (`pod04`, `pcelsassvap`) remontaient 0 voiture / 0 circuit alors qu'Assetto Corsa était bien installé "au bon endroit".** Confirmé via les logs distants (`GET /stations/:id/logs`) : `WARN Assetto Corsa directory not found` en boucle sur les deux. La détection auto ne cherchait que dans `<dossier d'install Steam>\steamapps\common\assettocorsa` — un jeu installé via Steam sur une **bibliothèque secondaire** (un autre disque, ce qui est très courant pour économiser l'espace du disque système) vit ailleurs et était donc invisible, même si l'installation Steam elle-même était parfaitement standard.
- **Fix** : le scan lit maintenant `steamapps/libraryfolders.vdf` à côté de chaque install Steam détectée pour découvrir toutes ses bibliothèques (y compris sur d'autres disques), et sonde `steamapps\common\assettocorsa` dans chacune d'elles en plus de l'emplacement principal.

## v2.2.84 — Relance bloquée par un verrou transitoire sur l'exe fraîchement extrait

### Corrigé

- **Signalé par l'utilisateur juste après le fix v2.2.83 (tâche interactive) : `desktop-gl3t50t` est resté bloqué en 2.2.82 après une MAJ à distance, avec une boîte de dialogue Windows Script Host affichant l'erreur `0x80070020` ("Le processus ne peut pas accéder au fichier car ce fichier est utilisé par un autre processus") sur `start-agent.vbs`, ligne 13 (`shell.Run` sur l'exe fraîchement extrait).** `concombre` avait basculé en 2.2.83 sans problème au même moment — confirmant qu'il s'agit d'un verrou transitoire (le suspect principal reste l'analyse temps réel de Windows Defender juste après l'écriture du nouvel exe par `Expand-Archive`), pas d'un bug systématique.
- **Fix** : `start-agent.vbs` retente maintenant jusqu'à 10 fois (1s d'intervalle) avant d'abandonner et d'afficher l'erreur — ce script étant réextrait à chaque MAJ, le correctif s'applique dès la toute prochaine tentative de MAJ, sans avoir besoin d'un aller-retour de version supplémentaire. `update-agent.ps1` ajoute en plus un court délai (1.5s) avant la relance pour éviter la course dans le cas courant.

## v2.2.83 — La tâche planifiée relançait l'agent en session non-interactive, invisible sur le bureau

### Corrigé

- **Signalé par l'utilisateur juste après le fix v2.2.82 (structure du zip) : "j'ai dû faire un double clic sur l'exe car il ne l'avait pas fait".** L'extraction fonctionnait désormais correctement, mais la relance finale du script (`wscript.exe` → `start-agent.vbs` → nouvel agent avec son icône de tray) ne se produisait pas visiblement sur le bureau. Cause : `schtasks /create` sans `/RU`/`/IT` explicites crée par défaut une tâche en session **non-interactive** (logon batch/S4U) — le script s'exécute bien (l'extraction avait réussi), mais tout ce qu'il lance ensuite tourne isolé du bureau réel de l'utilisateur, invisible, comme s'il ne s'était rien passé.
- **Fix** : `schtasks /create` inclut maintenant `/RU <utilisateur courant>` (`os.userInfo().username`) et `/IT` (jeton interactif) — la tâche s'exécute alors dans la session déjà déverrouillée de l'utilisateur, indiscernable d'un double-clic manuel. Appliqué aux deux usages de tâche planifiée (mise à jour et redémarrage local, `updater.ts` et `handleLocalRestart()`).

## v2.2.82 — Le zip de mise à jour créait un dossier `exe\exe\` imbriqué au lieu d'écraser sur place

### Corrigé

- **Signalé par l'utilisateur juste après le fix v2.2.80 (tâche planifiée) : "ça a mis le unzip de l'exe dans le dossier exe déjà".** Le zip de release (`sim-center-agent-win.zip`) contenait tous ses fichiers préfixés par `exe/` (`exe/sim-center-agent-win.exe`, `exe/build/...`) — confirmé en téléchargeant et inspectant l'archive réelle. `update-agent.ps1` extrait pourtant directement dans le dossier `exe` déjà existant (`Expand-Archive -DestinationPath $BaseDir`), donc ce préfixe créait un `exe\exe\...` imbriqué au lieu d'écraser les fichiers en place — le nouvel exe n'était donc jamais réellement utilisé. Même mismatch pour l'installeur SFX manuel : son `RunProgram="%%T\sim-center-agent-win.exe"` supposait déjà un placement à la racine, sans le préfixe `exe\`.
- **Fix** : l'étape de packaging (`.github/workflows/release-agent.yml`) archive maintenant depuis **l'intérieur** du dossier `exe/` avec des noms de fichiers nus (`Push-Location exe` puis `7z a ... sim-center-agent-win.exe start-agent.vbs build`, sans préfixe) — la racine de l'archive correspond désormais exactement au contenu attendu du dossier `exe`, pour la mise à jour automatique comme pour l'installation manuelle via le SFX.
- **Note pour une installation manuelle avec ce fix** : le SFX (`sim-center-agent-win-setup.exe`) doit maintenant être extrait avec le dossier `exe` existant lui-même comme destination (plus le dossier parent comme avant ce fix).

## v2.2.81 — Les écrans de lancement/résultats affichent maintenant le nom personnalisé des voitures/circuits

### Ajouté

- **Demandé par l'utilisateur** : les écrans d'attente "Lancement en cours" et "Session terminée" affichaient le nom technique brut (`abarth500`, `spa`...) au lieu du nom personnalisé défini dans la page "Noms". Le backend résout désormais le nom d'affichage (renommage personnalisé, sinon nom AC nettoyé, sinon acId mis en forme — exactement la même logique que le dashboard) et l'inclut dans les payloads `session:launch`/`server:join` envoyés à l'agent (`carName`/`trackName`, en plus des `carAcId`/`track` techniques déjà utilisés pour le lancement réel). L'agent transporte ces noms dans le suivi de session et les affiche à la place de l'acId sur les deux écrans.
- **Logique de formatage déplacée dans `packages/shared/src/naming.ts`** (`formatCarName`, `formatTrackName`, `cleanTrackName`, `formatTrackAcId`) — elle n'existait auparavant que côté frontend (`utils/track.ts`) ; le backend en a maintenant besoin aussi pour résoudre les noms avant de les envoyer à l'agent. Le frontend importe désormais ces fonctions depuis `@simracing/shared` au lieu d'en garder sa propre copie.

## v2.2.80 — Le script de MAJ/redémarrage ne survivait pas à la fermeture de l'agent

### Corrigé

- **Confirmé par l'utilisateur juste après le fix v2.2.79 : le téléchargement fonctionnait enfin, mais "il manque le dézip et la relance de l'exe"** — a dû le faire à la main. Le script PowerShell chargé de continuer la mise à jour (extraction + relance) était lancé en `detached: true` classique, ce qui ne suffit pas toujours sur Windows : si le process de l'agent (packagé via `pkg`) appartient à un Job Object avec kill-on-close, **tous ses enfants meurent avec lui**, `detached: true` ne fait que créer un nouveau groupe de processus, ça ne l'exempte pas d'un job auquel il appartient déjà.
- **Fix** : le script de continuation (mise à jour comme redémarrage local) est maintenant lancé via une **tâche planifiée Windows ponctuelle** (`schtasks /create ... /sc once /st 00:00 /f` puis `/run` immédiat) — le service Task Scheduler lance le process, entièrement en dehors de l'arborescence/job de l'agent, donc il survit quoi qu'il arrive à ce dernier. `update-agent.ps1` reçoit désormais ses paramètres via un fichier JSON (`-ParamsPath`, un seul argument à passer proprement à travers `schtasks`) plutôt que 5 arguments nommés séparés ; le script de redémarrage local a ses valeurs directement injectées dans le texte généré (aucun paramètre à passer du tout). Les deux se désinscrivent eux-mêmes de la tâche planifiée en fin d'exécution.

## v2.2.79 — La MAJ à distance échouait silencieusement (EPERM au téléchargement)

### Corrigé

- **Signalé par l'utilisateur : "ça télécharge la MAJ mais ne fait rien de plus".** Confirmé via les logs distants : `Agent update failed (err=EPERM: operation not permitted, open 'C:\...\exe\update.zip')` — l'échec survenait dès le téléchargement, avant même d'atteindre le script de relance, et n'était visible que dans le log local de l'agent (rien ne remonte au dashboard). `updater.ts` écrivait `update.zip` sous un nom fixe **juste à côté de l'exécutable en cours d'exécution** — exactement le genre d'emplacement où Windows Defender pose un verrou transitoire pendant son scan temps réel ; un verrou (ou un fichier résiduel d'une tentative précédente jamais nettoyé) bloque alors **toutes les tentatives suivantes**, silencieusement, pour toujours.
- **Fix** : le zip et le script de mise à jour sont désormais écrits dans le dossier temporaire (même convention que `blanking.ps1`/`kiosk.ps1`), avec un nom **unique par tentative** (`update-<timestamp>.zip`) — plus aucune collision possible avec un fichier verrouillé ou résiduel. Un nettoyage best-effort des anciens fichiers `update-*.zip/.ps1` tourne au début de chaque nouvelle tentative. Un échec de mise à jour est aussi désormais poussé via `sendLog()` vers les logs du backend (visible immédiatement, sans avoir besoin de tirer les logs distants de l'agent manuellement).

## v2.2.78 — Le nettoyage des acServer.exe orphelins (v2.2.75) ne suffisait pas, il ne tournait qu'au démarrage

### Corrigé

- **Signalé par l'utilisateur après avoir renommé une voiture/un circuit : le serveur ne voulait plus lancer.** Investigation en conditions réelles : le rename n'y était pour rien (reproduit avec le contenu renommé exact, ça fonctionne) — c'est le même bug de port squatté que v2.2.75 (`acServer.exe` orphelin qui panique sur bind échoué), mais qui **recommençait des heures après un redémarrage d'agent**, sans qu'aucun redémarrage n'ait eu lieu entre-temps. Le nettoyage de v2.2.75 ne tournait qu'**une fois au démarrage de l'agent** — un process orphelin apparu depuis (une tentative de lancement en apparence échouée peut laisser le process vivant) continuait de squatter son port indéfiniment.
- **Fix** : `killOrphanedProcesses()` tourne désormais aussi **avant chaque lancement**, pas seulement au démarrage de l'agent — et ne tue plus que les process `acServer.exe` non suivis dans `servers` (comparaison par PID via `tasklist`), laissant intact un éventuel serveur légitimement en cours (le modèle de données supporte plusieurs serveurs dédiés simultanés par poste).

## v2.2.77 — Relancer une session très vite après la précédente pouvait perturber son blanking

### Corrigé

- **Signalé par l'utilisateur : relancer rapidement une session juste après avoir terminé la précédente faisait apparaître le blanking de fin (résultats) pendant la nouvelle partie**, avant que l'ancien écran n'ait eu le temps de repasser en mode normal. Deux causes :
  - `handleJoinServer()` (rejoindre un serveur dédié) n'annulait pas le minuteur de 60s qui ramène blanking en mode auto après l'affichage des résultats (`resultsTimeout`) — contrairement à `handleLaunch()`, qui le fait déjà. Une nouvelle session démarrée dans cette fenêtre de 60s laissait donc ce minuteur périmé actif, capable de perturber blanking en pleine nouvelle partie.
  - `endSession()` (fin de session, affichage des résultats) enchaîne plusieurs attentes longues (`acLauncher.quit()` jusqu'à 15s, puis 3s pour la lecture de `race_out.json`) avant de toucher à nouveau blanking/statut/kiosque. Relancer une session pendant cette fenêtre laissait l'ancien `endSession()` continuer en arrière-plan et écraser l'état (statut, `podInGame`, écran de résultats) de la session **déjà en cours**.
- **Fix** : `sessionGeneration`, un compteur incrémenté à chaque nouveau démarrage de session (`handleLaunch`, `handleJoinServer`). `endSession()`/`handleStop()` capturent sa valeur au début et la revérifient après chaque attente longue — si elle a changé (une nouvelle session a démarré entre-temps), le reste du traitement est abandonné (log warning) plutôt que d'écraser l'état de la session déjà en cours. `handleJoinServer()` annule aussi désormais `resultsTimeout` au démarrage, comme `handleLaunch()`.

## v2.2.76 — Blanking pouvait réapparaître en pleine session sur un simple faux-positif

### Corrigé

- **Signalé en conditions réelles : l'écran d'attente est réapparu alors que le pilote était bien en course.** `acRunning`/`acLoaded` sont re-vérifiés à zéro toutes les ~2s (`tasklist.exe` / mémoire partagée AC) et peuvent ponctuellement se tromper sur un seul tick sans qu'il y ait de changement réel côté jeu — `evaluate()` réagissait immédiatement au premier faux-positif et rappelait `startBlanking()`, recouvrant le jeu en pleine partie.
- **Fix** : une fois le jeu réellement confirmé à l'écran pendant la session en cours (`gameRevealedThisSession`), il faut désormais **3 vérifications consécutives** disant "AC absent" avant que blanking ne soit autorisé à réapparaître — un seul accroc est ignoré (juste loggé en warning), un vrai crash/fermeture du jeu reste couvert quelques secondes plus tard. Aucun changement en dehors d'une session active (l'écran d'attente en mode "accueil" doit toujours réagir immédiatement, rien à protéger là) ni avant la première révélation du jeu (l'écran de lancement doit toujours s'afficher normalement).

## v2.2.75 — Un redémarrage de l'agent laissait `acServer.exe` orphelin, squattant son port pour toujours

### Corrigé

- **Cause racine réelle de l'échec instantané (code 2) de tout lancement de serveur dédié — le fix v2.2.74 (dédup de `CARS=`) était une fausse piste.** Confirmé via le `server.log` d'`acServer.exe` lui-même (fourni par l'utilisateur) : `CreateServer(): ERROR OPENING UDP CONNECTION ... bind 10048` puis `listen tcp :9600: bind: Only one usage of each socket address...` — le port 9600 était déjà occupé par un **autre process**. `acServer.exe` ne quitte pas proprement dans ce cas : il continue avec un socket UDP nul puis **panique** (nil pointer dereference) dès qu'il essaie de l'utiliser, quelques centaines de ms plus tard — d'où le "code 2" quasi instantané, peu importe la config (voitures, circuit...) testée.
- **`ServerLauncher.servers` (la table des serveurs en cours) est purement en mémoire.** Tout serveur dédié lancé par une **précédente** instance de l'agent (avant une mise à jour, un crash, ou un redémarrage manuel) n'y a plus d'entrée — `stop()` ne le retrouve donc jamais ("No matching server process to stop"), mais le vrai `acServer.exe` continue de tourner indéfiniment, squattant son port. Comme chaque nouveau lancement retente systématiquement le port 9600 en premier, **tout redémarrage de l'agent pendant qu'un serveur dédié tourne casse silencieusement toute création future de serveur** jusqu'à un redémarrage complet de la machine ou un `taskkill` manuel. C'est exactement ce qui s'est produit ce soir : le premier serveur de test (port 9600, lancé avec succès) a survécu à plusieurs mises à jour d'agent (v2.2.70 → v2.2.74) sans jamais être arrêté proprement.
- **Fix** : `ServerLauncher.killOrphanedProcesses()` (nouveau), appelé une fois au démarrage de l'agent — `taskkill /F /IM acServer.exe`, best-effort. Même principe déjà utilisé pour la fenêtre de blanking (`BlankingManager.killOrphanedProcess()`, via pidfile) et pour le client AC (`AcLauncher.launchAcs()` fait déjà un `taskkill /F /IM acs.exe` avant chaque lancement).

## v2.2.74 — `CARS=` avec des doublons faisait crasher acServer.exe instantanément sur un mix de voitures

### Corrigé

- **Un serveur dédié avec plusieurs voitures différentes (fonctionnalité de mix ajoutée cette session) échouait à chaque lancement réel**, `acServer.exe` quittant en moins d'une seconde (code 2), avant même de tenter d'ouvrir son port. Signalé par l'utilisateur juste après avoir testé la nouvelle grille de voitures en conditions réelles pour la première fois. Cause : `serverLauncher.ts#writeServerConfig()` écrivait le champ `CARS=` de `server_cfg.ini` (qui doit lister les modèles de voitures **distincts** autorisés) directement à partir du tableau brut par-emplacement — désormais capable de contenir des doublons (une voiture choisie 3 fois donne 3 entrées identiques) depuis que le sélecteur permet de mélanger plusieurs voitures. `entry_list.ini` (l'assignation par emplacement, avec doublons légitimes) n'était pas concerné. Fix : `CARS=` est maintenant dédupliqué (`[...new Set(carIds)]`) avant écriture.

## v2.2.73 — Le jeu mettait jusqu'à 1 minute à apparaître, et le bureau flashait brièvement au lancement

### Corrigé

- **`SetForegroundWindow` échouait silencieusement pendant ~1 minute à chaque lancement, alors que le jeu était prêt en ~15s.** Constaté en conditions réelles via les logs distants : la mémoire partagée AC confirmait `acLoaded=true` ~13s après le lancement d'`acs.exe` (le "bruit de portière" que l'utilisateur entend), mais `revealThenStop()` épuisait ses 3 tentatives (chacune avec un budget de 20s dans `Set-GameForeground`) avant d'abandonner et de retirer l'écran d'attente de force — environ 71 secondes plus tard. Cause : Windows refuse silencieusement `SetForegroundWindow` quand l'appelant (un script PowerShell en arrière-plan) n'est pas déjà le process au premier plan et n'a pas traité d'entrée utilisateur récente — la fenêtre du jeu était bien trouvée à chaque itération de la boucle, l'appel échouait juste systématiquement. `kiosk.ps1` utilise maintenant la technique standard `AttachThreadInput` (attacher la file d'entrée de ce thread à celle de la fenêtre au premier plan et à celle de la cible avant l'appel) pour forcer un succès fiable.
- **Le bureau (ou tout ce qui était derrière) pouvait flasher 1-2 secondes pendant les transitions de l'écran d'attente** (ex: passage de l'écran "en attente" à l'écran "lancement en cours" au début d'une session). Cause : `restartIfActive()` tuait la fenêtre PowerShell/WPF actuelle _avant_ d'en relancer une nouvelle — le démarrage à froid de PowerShell/WPF prend facilement 1-2s, pendant lesquelles rien ne couvrait l'écran. Remplacé par `crossfadeRestart()` : la nouvelle fenêtre est lancée et confirmée visible (`BLANKING_WINDOW_READY`) _avant_ que l'ancienne soit fermée, donc l'écran reste toujours couvert par l'une des deux.

## v2.2.72 — La télémétrie partagée mourait silencieusement dès la première reconnexion

### Corrigé

- **Trouvé pendant une re-vérification complète en conditions réelles** : après toute reconnexion agent↔backend (Wi-Fi instable, redémarrage backend...), `AcSharedMemoryReader` était recréé à neuf (`agent.ts`, handler `socket.on('connect')`) et réenregistrait ses trois types `koffi.pack('SPageFilePhysics'/'SPageFileGraphic'/'SPageFileStatic', ...)` dans le constructeur — sauf que le registre de types de koffi est **global au process**, pas par instance. Le second enregistrement jetait `Duplicate type name 'SPageFilePhysics'`, silencieusement avalé par un `catch` qui se contentait de logger une erreur — **toute lecture de télémétrie partagée restait cassée pour le reste de la vie du process**, sans aucun signal visible à part ce log. Repéré via les logs distants : `AC shared memory state changed` s'affichait bien (mécanisme indépendant) mais zéro paquet de télémétrie n'atteignait le backend.
- **Fix** : les trois `koffi.pack(...)` sont maintenant enregistrés **une seule fois au chargement du module** (avant la classe), pas dans le constructeur — chaque nouvelle instance de `AcSharedMemoryReader` réutilise le même type déjà enregistré au lieu de le redéclarer. Le chargement `kernel32.dll`/déclaration des fonctions reste par instance (pas concerné, aucune erreur observée à ce sujet).

## v2.2.71 — Le balayage des fenêtres ne doit jamais tourner sans session, ni sur un poste admin

### Corrigé

- **`revealThenStop()` (v2.2.70) déclenchait le balayage "minimiser les autres fenêtres" + mise au premier plan à chaque fois qu'un `hide()` manuel était reçu, même hors session.** Un "Masquer écran" déclenché pendant une maintenance (aucune session en cours) minimisait donc les fenêtres de l'opérateur pour rien — il n'y a aucun jeu à révéler dans ce cas. Ajout d'une garde : le balayage ne se déclenche que si `acRunning`/`acLoaded` indique qu'une session tourne ou charge réellement ; sinon l'écran d'attente se retire simplement, sans toucher à quoi que ce soit d'autre.
- **Idem, explicitement, sur les postes admin (hébergement uniquement)** — ils ne lancent jamais le client AC eux-mêmes donc `acRunning`/`acLoaded` ne devraient déjà jamais y être vrais, mais l'exclusion est maintenant explicite (`!this.enabled`, déjà utilisé pour désactiver l'écran d'attente sur ces postes) plutôt que de reposer sur ça indirectement.

## v2.2.70 — Le jeu doit être confirmé au premier plan avant que l'écran d'attente ne se retire

### Corrigé

- **L'écran d'attente (blanking) se retirait _avant_ que la remise au premier plan du jeu soit tentée, et sans jamais vérifier qu'elle avait réussi.** `BlankingManager` appelait `stopBlanking()` puis lançait `onGameRevealed()` en fire-and-forget juste après — tout ce qui traînait derrière (bureau, une boîte de dialogue, Content Manager encore ouvert...) pouvait donc apparaître brièvement avant que le jeu ne reprenne le focus. `revealThenStop()` inverse l'ordre : le jeu est ramené au premier plan (avec un nouveau balayage des fenêtres parasites, pas juste celui fait une fois à l'entrée en mode kiosque) et **confirmé** avant que l'écran d'attente ne disparaisse réellement, avec jusqu'à 3 tentatives avant d'abandonner (l'écran ne reste jamais bloqué indéfiniment si la fenêtre du jeu n'est jamais trouvée).
- `kiosk.ps1` : `Set-GameForeground` vérifie maintenant via `GetForegroundWindow()` que le jeu est _réellement_ devenu la fenêtre active (`SetForegroundWindow` peut échouer silencieusement à cause des restrictions Windows) avant de rapporter un succès, et re-balaie les fenêtres parasites (`Minimize-OtherWindows`) à chaque appel plutôt qu'une seule fois à l'entrée en mode kiosque.
- `KioskManager.revealGame()` retourne maintenant `Promise<boolean>` (au lieu d'un spawn fire-and-forget) pour que l'appelant puisse effectivement attendre et vérifier le résultat.

## v2.2.69 — Désactive l'enregistrement au lobby public Kunos (cause probable des crashs ~29-30s)

### Corrigé

- **`REGISTER_TO_LOBBY=1` → `0` dans `server_cfg.ini`.** Constaté en conditions réelles (2 incidents distincts, un client réel bloqué) : `acServer.exe` démarre, passe les vérifications, puis quitte tout seul systématiquement ~29-30s après — un timing bien trop régulier pour un crash aléatoire. Ce venue n'a aucun besoin d'un serveur listé publiquement (les joueurs rejoignent uniquement via le dashboard, jamais via une liste de serveurs publics) — désactiver l'enregistrement retire toute dépendance à la joignabilité du master server Kunos, plausiblement la cause du crash. Le signalement du crash lui-même (v2.2.68) reste en place comme filet de sécurité si ce n'était pas (ou pas la seule) cause réelle.

## v2.2.68 — Détecte un crash tardif d'acServer.exe (cause réelle de "Failed to handshake" silencieux)

### Corrigé

- **Un serveur dédié qui crashe après son démarrage restait "running" en base pour toujours.** Constaté en conditions réelles cette session : `acServer.exe` démarrait, passait les vérifications (process vivant + port UDP bound), puis quittait tout seul ~29s plus tard sans qu'aucun signal ne remonte nulle part. Le POD qui tentait de rejoindre ce serveur restait bloqué avec une mémoire partagée AC "frozen" indéfiniment — exactement le symptôme "Failed to handshake" déjà chassé plusieurs fois cette session, mais avec une cause différente (le serveur hôte, pas le `race.ini` du client). `ServerLauncher` accepte maintenant un callback `onUnexpectedExit` déclenché quand le process meurt sans être passé par `stop()` ; l'agent émet alors `server:stopped` avec une erreur, ce que le backend traduit déjà en statut `error` (libérant le port au passage, cf. v2.2.66).
- **Le ring buffer de logs distants perdait tous les champs structurés** (`code`, `err`, `serverId`...) et ne gardait que `msg` — ce qui a empêché de voir directement le code de sortie d'`acServer.exe` pendant cet investigation. Les champs pertinents sont maintenant ajoutés en suffixe de la ligne (`msg (code=1, serverId=...)`).

## v2.2.67 — Ajoute un watchdog indépendant qui relance l'agent s'il disparaît

### Ajouté

- **Un processus "watchdog" séparé** (`watchdogManager.ts` + `assets/watchdog.ps1`) surveille toutes les 20s si l'agent tourne encore et le relance après 15s de grâce sinon — utile constaté en conditions réelles cette session : la MAJ vers v2.2.66 a laissé les deux postes hors ligne près de 90-100s avant de revenir (heureusement grâce au filet de sécurité de v2.2.65, mais rien ne garantit qu'un futur échec de relance se rattrape tout seul). Le watchdog est arrêté explicitement avant tout arrêt volontaire (quit, MAJ, redémarrage local) pour ne jamais interférer avec un arrêt légitime.

### Corrigé

- **`handleLocalRestart()` (redémarrage depuis la console locale) avait le même bug cmd.exe déjà corrigé une fois dans le updater (v2.2.61)** — `set /a waitTime+=1` dans un bloc `if (...)` entre parenthèses ne s'incrémentait jamais dans la même itération. Corrigé avec la même approche PowerShell (`Wait-Process`), et relance maintenant via `start-agent.vbs` (plus de fenêtre console qui flashe).

## v2.2.66 — Vérifié en conditions réelles : handshake corrigé, ports libérés, MAJ agent testée

### Corrigé

- **Confirmé en production que le fix du handshake (v2.2.64) fonctionne** : test réel (création serveur + envoi POD), la mémoire partagée de `acs.exe` ne reste plus gelée et près de 500 paquets de télémétrie ont été reçus en 2 minutes (contre zéro avant le fix).
- `writeJoinRaceIni()` inclut maintenant aussi `[LIGHTING]` (déjà présent dans `writeRaceIni()`, le lancement direct/solo), par cohérence entre les deux chemins.
- **Backend : les ports des serveurs dédiés arrêtés restaient réservés indéfiniment.** `getUsedPorts()` ne filtrait pas par statut — un serveur arrêté ou en erreur gardait son port occupé pour toujours, épuisant progressivement les plages 9600-9700/8081-8181 sans raison. Ne compte maintenant que les serveurs `starting`/`running`.

## v2.2.65 — Une mise à jour ratée pouvait laisser l'agent complètement arrêté

### Corrigé

- **Le script de mise à jour n'avait aucune gestion d'erreur : si `Expand-Archive` échouait pour une raison quelconque (fichier verrouillé, zip corrompu, etc.), l'agent restait purement et simplement arrêté** — plus aucun contrôle à distance jusqu'à une intervention physique sur le PC. Constaté en conditions réelles : après avoir déclenché "MAJ agent" sur les deux postes, aucun des deux n'est jamais revenu en ligne. Le script sauvegarde maintenant l'exécutable et le module natif (`build/`) actuels avant d'extraire la nouvelle version ; si l'extraction échoue, il restaure cette sauvegarde ; et il tente **toujours** de relancer l'agent à la fin (nouvelle version si l'extraction a réussi, ancienne sinon) plutôt que de s'arrêter en silence si une étape échoue. Toutes les étapes sont maintenant journalisées dans `update-agent.log` à côté de l'exécutable, pour diagnostiquer un futur échec sans accès physique.

## v2.2.64 — Corrige les "Failed to handshake" intermittents en rejoignant un serveur dédié

### Corrigé

- **`race.ini` écrit pour un join direct (`acs.exe`) était incomplet, causant des échecs intermittents à rejoindre un serveur dédié.** Reproduit et diagnostiqué grâce au nouveau bouton "Logs" (v2.2.63) : `acs.exe` se lance bien, la mémoire partagée se mappe, mais reste "gelée" en continu (le `packetId` n'avance jamais) — signe que le client ne rentre jamais réellement en course, cohérent avec un handshake qui échoue silencieusement. En comparant avec `agent-legacy` (l'implémentation précédente, en production pendant longtemps) et avec `writeRaceIni()` (utilisée pour le lancement direct/solo, juste à côté dans le même fichier et qui fonctionne bien), `writeJoinRaceIni()` s'est révélée avoir perdu plusieurs sections lors d'une réécriture précédente : `[AUTOSPAWN]`, `[SESSION_0]`, `[TEMPERATURE]`, `[WEATHER]`, `[WIND]`, ainsi que plusieurs champs de `[CAR_0]`/`[REMOTE]` (`DRIVERNAME`, `TEAM`, `GUID`, `RESTRICTOR`, `SPECTATOR_MODE`, `SPAWN_POINT`, `NAME`, `__CM_EXTENDED`). Le `race.ini` du join direct correspond maintenant exactement à celui du lancement direct/legacy.

## v2.2.63 — Logs de l'agent consultables à distance depuis le dashboard

### Ajouté

- **Un bouton "Logs" sur la page Postes** (groupe "Maintenance") ouvre les ~100 dernières lignes du journal de l'agent (le même contenu déjà affiché dans sa console locale via l'icône de la barre système) directement dans le dashboard — plus besoin d'aller physiquement ouvrir la console sur le PC pour diagnostiquer un problème (ex: un "Failed to handshake" côté client). Le backend demande les logs à l'agent via un aller-retour WebSocket (`logs:request` / `agent:logs`, timeout 4s) et les expose via `GET /api/stations/:id/logs` ; si l'agent n'est pas connecté ou ne répond pas, la liste revient vide plutôt que de bloquer la requête.

## v2.2.62 — Un agent pouvait rester déconnecté indéfiniment après un redéploiement du backend

### Corrigé

- **Après un redémarrage du conteneur backend (redéploiement), un agent déjà connecté pouvait ne jamais se reconnecter tout seul.** La socket est créée avec `reconnection: false` (le code gère lui-même la reconnexion) ; la seule tentative de reprise était programmée sur l'événement `disconnect`, qui ne se déclenche que pour une connexion ayant déjà réussi au moins une fois. Si cette unique tentative de reconnexion (5s après la coupure) tombait pendant que le backend était encore en train de redémarrer, elle échouait avec `connect_error` — événement qui, avec `reconnection: false`, ne déclenche **aucune** nouvelle tentative. L'agent restait alors bloqué, silencieusement déconnecté, jusqu'à un redémarrage manuel — expliquant un serveur dédié créé depuis le mode kiosque qui ne démarrait jamais (la commande de lancement était bien émise côté backend mais n'atteignait aucun agent connecté). `connect_error` programme désormais lui aussi une nouvelle tentative (`scheduleReconnect()`, mêmes 5s, tentatives coalescées pour éviter les doublons), sauf en cas de clé API invalide (qui relance déjà une re-provision).

## v2.2.61 — La mise à jour automatique de l'agent ("MAJ agent") ne se terminait jamais

### Corrigé

- **Le script de mise à jour généré (`update-agent.bat`) restait bloqué dans sa boucle d'attente.** Il attendait la fin du processus de l'ancien agent via `tasklist | find` dans un `if (...)` de `cmd.exe` — or `cmd` évalue les variables `%var%` d'un bloc parenthésé une seule fois, au moment où le bloc est lu : le `set /a waitTime+=1` fait à l'intérieur ne se reflétait donc jamais dans la même itération, un classique piège de scripting batch qui faussait le compteur et pouvait laisser la boucle tourner indéfiniment. Le mécanisme est réécrit en PowerShell (`Wait-Process -Timeout 30`), sans ce genre de piège.
- **La fenêtre de la mise à jour n'était pas fiablement masquée** (`cmd.exe` + `windowsHide` n'est pas garanti sur Windows), et le nouvel agent était relancé directement (`start "" agent.exe`) au lieu de passer par `start-agent.vbs` — le lanceur silencieux déjà utilisé pour le démarrage automatique — ce qui aurait de toute façon fait apparaître une fenêtre de console après la mise à jour (un exécutable `pkg` est une app console par défaut). Le nouveau script PowerShell tourne avec `-WindowStyle Hidden` (le même mécanisme déjà utilisé et éprouvé pour l'écran de blanking) et relance l'agent via `start-agent.vbs`, donc de façon réellement silencieuse.

## v2.2.60 — Corrige le rôle admin jamais reçu par l'agent + le blanking pas encore affiché avant de fermer le jeu

### Corrigé

- **Le rôle de la station (admin/simulateur) n'atteignait en réalité jamais l'agent, donc un poste admin continuait d'afficher le blanking.** `station:role` (et `settings:updated`, déjà présent) était émis depuis `handleConnection`, en s'appuyant sur `client.stationId` — qui n'est en pratique **jamais renseigné** à ce stade (confirmé en production : chaque connexion réelle logue "Agent connected: unknown station"). `AgentAuthGuard` ne s'exécute qu'en amont des handlers `@SubscribeMessage`, pas de ce hook de cycle de vie. Les deux émissions sont déplacées sur le premier heartbeat (`isFirstHeartbeat`), le seul point où l'identité de la station est réellement connue — c'est d'ailleurs déjà là que le rejoin de room avait un repli pour cette même raison.
- **Le bureau pouvait encore apparaître brièvement en fermant le jeu**, malgré le fix v2.2.59 : afficher le blanking puis enchaîner immédiatement sur `quit()`/`stop()` ne garantit pas que la fenêtre WPF soit réellement affichée à l'écran — le démarrage à froid de PowerShell/WPF peut prendre plusieurs centaines de ms. `blanking.ps1` signale maintenant précisément le moment où sa fenêtre est chargée (`BLANKING_WINDOW_READY` sur stdout, dans `Add_Loaded`), et l'agent attend ce signal (`BlankingManager.waitUntilShown()`, avec un filet de sécurité de 4s) avant de continuer vers `quit()`/`stop()` — aussi bien pour l'arrêt d'une session trackée (`endSession()`) que pour un lancement direct (`handleStop()`).

## v2.2.59 — Blanking toujours à l'écran hors jeu, jamais sur un poste admin, refonte du choix des voitures

### Corrigé

- **Le bureau Windows pouvait rester visible au démarrage de l'agent.** `resolveAcPath()` (scan de plusieurs dossiers Steam) et `ensureContentManagerPath()` (qui peut ouvrir une popup bloquante si Content Manager n'est pas trouvé) passaient avant le lancement du blanking. Le blanking démarre désormais en tout premier, avant toute autre initialisation.
- **Le bureau pouvait rester visible pendant l'arrêt d'un lancement direct** (hors serveur dédié). `handleStop()` attendait la fin de `quit()` (jusqu'à 15s, et le jeu peut fermer sa fenêtre avant que le process soit confirmé mort) avant de réafficher le blanking. Il se réaffiche maintenant immédiatement, avant même de demander à AC de quitter — comme le fait déjà `endSession()` pour les sessions trackées.
- **Un poste de type "Admin" (hébergement uniquement) ne doit jamais afficher le blanking.** Le backend pousse désormais le rôle de la station à l'agent (à la connexion, et en direct si le rôle change depuis le dashboard) ; `BlankingManager` bloque tout affichage tant que le rôle est `admin`. Le rôle est aussi mis en cache localement pour qu'un poste déjà connu comme admin ne montre jamais le blanking, pas même une fraction de seconde, dès le prochain démarrage.

### Ajouté

- **Choix des voitures en quantité, à la création d'un serveur dédié.** Cliquer sur une voiture l'ajoute (jusqu'à la limite de slots), un badge affiche le nombre d'exemplaires, cliquer sur le badge en retire un. Bouton "remplir tous les slots avec cette voiture" au survol de chaque carte. Le backend n'a pas changé : l'agent répartissait déjà les voitures en round-robin sur les slots à partir du tableau envoyé, donc les doublons dans la sélection se traduisent naturellement par plus de poids pour cette voiture.
- **Étape "Configuration" simplifiée.** Nom, slots, mot de passe et mot de passe RCON sont désormais repliés dans "Options avancées" (masqué par défaut) — le nom se remplit automatiquement depuis le circuit choisi, et les slots sont à 11 par défaut.

## v2.2.58 — Diagnostic préventif du "Failed to handshake" en rejoignant un serveur dédié

### Corrigé

- **Cause identifiée : un serveur dédié pouvait être signalé "running" alors que son port UDP n'était en réalité pas accessible**, laissant les PODs qui le rejoignaient échouer avec "Failed to handshake" côté Assetto Corsa sans aucune trace côté dashboard/agent. `serverLauncher.ts` ne vérifiait que la survie du processus `acServer.exe` (2.5s après le lancement), pas que son socket UDP était effectivement ouvert — un pare-feu Windows bloquant le port, ou un port déjà tenu par un autre processus au niveau OS malgré la vérification préalable, laissaient le process tourner sans que personne ne puisse s'y connecter.
- Ajout d'une vérification via `netstat` après le lancement (jusqu'à 5s) confirmant que le PID d'`acServer.exe` détient bien le port UDP annoncé ; sinon le lancement échoue explicitement avec un message clair au lieu de rapporter silencieusement "running".
- Ajout d'une règle de pare-feu Windows entrante automatique pour `acServer.exe` (créée une fois, program-scoped donc valable pour tous les ports dynamiques 9600-9700 utilisés au fil des lancements) afin de prévenir la cause la plus fréquente de ce blocage.

## v2.2.57 — Nom des voitures corrigé (impactait aussi les aperçus manquants)

### Corrigé

- **Cause trouvée : le nom des voitures était cassé pour la quasi-totalité du contenu.** L'agent ne lisait `ui_car.json` qu'à la racine du dossier de la voiture (`content/cars/<voiture>/ui_car.json`), alors que la convention standard d'Assetto Corsa le range dans un sous-dossier `ui/` (`content/cars/<voiture>/ui/ui_car.json`). Cette lecture échouait silencieusement (pas d'erreur visible), et le nom affiché retombait sur l'identifiant technique brut (`ks_ferrari_488_gt3_2020` au lieu de son vrai nom) — présent sur la quasi-totalité du catalogue, pas seulement quelques voitures. La recherche vérifie désormais `ui/ui_car.json` en priorité, avec la racine en repli.
- Ajout de `ui/` comme emplacement supplémentaire pour la photo de la voiture (en plus de la racine et des dossiers `skins/`), pour couvrir un peu plus de conventions de contenu.
- Écrans d'envoi (`JoinServer.tsx`) et de création de serveur (`CreateDedicatedServer.tsx`) : le nom affiché repasse maintenant par le même formatage que `/en-cours`/`DedicatedServers.tsx` (mise en forme lisible à partir de l'identifiant technique quand le vrai nom est absent), au lieu d'afficher l'identifiant brut tel quel.
- Version du cache de contenu à nouveau incrémentée pour forcer un nouveau scan avec la logique corrigée (les fichiers sur le disque n'ayant pas changé, un simple changement de code ne suffisait pas à invalider l'ancien cache).

### Note sur les circuits sans photo signalés

Vérifié directement en base : sur un POD déjà mis à jour en v2.2.56, les 21 circuits scannés ont désormais tous une photo (0 manquant), et les layouts multiples (Barcelone, Nürburgring, Silverstone, etc.) ont chacun leur propre vignette. Le correctif v2.2.56 fonctionne bien — le POD qui montrait encore des circuits sans photo tournait simplement une version plus ancienne (v2.2.50), pas encore mise à jour.

## v2.2.56 — Choix du layout avec visuel à la création du serveur + photos de circuits manquantes corrigées

### Corrigé

- **Cause trouvée pour les photos de circuits manquantes** : pour un circuit à plusieurs layouts, l'agent ne cherchait la photo de chaque layout que dans `<circuit>/<layout>/` — hors la convention Assetto Corsa range en réalité ces fichiers sous `<circuit>/ui/<layout>/`, un dossier jamais consulté. Résultat : toute photo qui n'existait que sous cette convention standard n'était simplement jamais trouvée. La recherche vérifie désormais aussi `<circuit>/ui/<layout>/`, en plus des autres emplacements déjà couverts, pour couvrir les différentes conventions utilisées par les circuits (officiels et communautaires).

### Ajouté

- **Choix du layout avec visuel à la création d'un serveur dédié** : l'étape "Circuit" affiche maintenant chaque layout disponible sous forme de vignette (comme pour le choix du circuit et de la voiture) au lieu d'une simple liste de noms. Nécessite une resynchronisation du contenu (bouton "Synchroniser le contenu") sur les PODs déjà scannés pour que les nouvelles photos de layout apparaissent.

## v2.2.55 — Choix boîte manuelle/auto, redirection vers "En cours", mode kiosque

### Ajouté

- **Boîte de vitesses indépendante de la difficulté** : sur l'écran d'envoi des PODs vers un serveur dédié, chaque poste a maintenant un choix « Manuelle » / « Automatique » séparé de la difficulté (Easy/Pro/Custom). Avant, la boîte auto était rigidement liée à la difficulté Easy — un pilote pouvait donc vouloir jouer en Pro (aides réduites) mais rester bloqué en boîte manuelle, ou l'inverse. Câblé de bout en bout : DTO backend, colonne `gearbox` sur `Session`, jusqu'à l'agent qui force `AUTO_SHIFTER` dans `assists.ini` selon ce choix, quelle que soit la difficulté.
- **Redirection automatique vers "En cours" après l'envoi** : cliquer sur "Envoyer" sur l'écran d'envoi des PODs redirige désormais directement vers `/en-cours` au lieu d'un écran de succès avec un bouton à cliquer manuellement.
- **Mode kiosque pour "En cours"** (`/en-cours/kiosk`, bouton "Mode kiosque" sur la page `/en-cours`) : affichage plein écran sans menu de navigation, pensé pour un TV/moniteur mural — grille 5x2 affichant jusqu'à 10 PODs (les 10 sessions les plus récentes si plus sont actives), avec une carte simplifiée par poste (pilote, voiture/circuit, vitesse, temps restant/écoulé) au lieu des jauges et boutons d'action détaillés de la page normale.

## v2.2.54 — Écran de lancement (pilote / circuit / voiture) au lieu de l'écran d'attente générique

### Ajouté

- Au lancement d'une session (`session:launch` ou envoi vers un serveur dédié), l'écran d'attente affiche désormais un écran dédié « Lancement en cours » — même habillage visuel que l'écran de fin de session (dégradés, bandeau pilote, tuiles Circuit/Voiture) — au lieu du simple écran d'attente générique, pendant tout le temps où Assetto Corsa charge.
- Cet écran est affiché **avant même que le jeu ne soit lancé**, pas après : le seul redémarrage de fenêtre que ça déclenche a donc lieu à un moment où rien d'autre ne peut apparaître par-dessus, au lieu de se produire pendant le lancement du jeu lui-même — ce qui était la source du flicker signalé sur les versions précédentes (v2.2.51 à v2.2.53 corrigeaient déjà des causes réelles, mais distinctes, du même symptôme).
- Si le lancement échoue (erreur de connexion, jeu introuvable, etc.), l'écran revient automatiquement à l'écran d'attente normal au lieu de rester bloqué sur « Lancement en cours ».

## v2.2.53 — Flicker au lancement encore visible malgré le v2.2.52

### Corrigé

- **Cause trouvée, cette fois côté fenêtre elle-même** : l'écran d'attente ne réaffirme son statut "toujours au premier plan" (`Topmost`) qu'une seule fois, à sa création. Or au lancement d'une session, Content Manager (ou AC) crée sa propre fenêtre de lancement — souvent elle-même marquée "toujours au premier plan" le temps de son chargement — ce qui la fait passer **devant** l'écran d'attente pendant un court instant, avant que l'action qui masque la taskbar et réduit les autres fenêtres (elle-même lancée dans un processus PowerShell séparé, qui doit d'abord démarrer) n'ait eu le temps de s'exécuter.
- L'écran d'attente réaffirme désormais sa position au premier plan en continu (toutes les 200 ms) pendant toute sa durée d'affichage, au lieu d'une seule fois. Toute fenêtre qui apparaîtrait brièvement par-dessus est repoussée derrière quasi instantanément, au lieu d'attendre l'action externe de mise en kiosque.

## v2.2.52 — Léger flicker restant au lancement d'une session

### Corrigé

- **Cause trouvée** : au lancement d'une session (`setPodInGame(true)`, juste avant que le jeu apparaisse), l'agent forçait **systématiquement** un redémarrage complet de la fenêtre d'écran d'attente — même quand elle affichait déjà le simple écran d'attente et que rien à l'écran n'avait besoin de changer. Ce redémarrage inutile (fermeture puis recréation de la fenêtre WPF) provoquait le petit flicker visible pile au moment de l'envoi vers le poste, signalé après le correctif du v2.2.51.
- Un redémarrage n'est en réalité utile que pour faire disparaître l'écran de résultats d'une session précédente (son contenu est figé au démarrage du processus, voir `showResults()`). L'agent ne redémarre désormais la fenêtre que dans ce cas précis ; si l'écran d'attente normal est déjà affiché, il reste simplement en place au lancement de la session, sans coupure visible.
- Même correction appliquée à `setAuto()`, qui suivait la même logique inconditionnelle. Nouveau test verrouillant l'absence de redémarrage inutile.

## v2.2.51 — Statut "blanking" bloqué après un flicker au lancement (impossible à retirer depuis le site)

### Corrigé

- **Cause trouvée** : au lancement d'une session, `restartIfActive()` tue la fenêtre d'écran d'attente en cours puis en relance une nouvelle **dans le même passage synchrone**. Mais Windows ne délivre l'événement de fin de l'ancien processus que plus tard, de façon asynchrone — une fois la nouvelle fenêtre déjà en place et affichée. Le gestionnaire de cet événement, écrit sans distinguer "à quel processus il appartient", remettait alors à zéro la référence vers la fenêtre **actuelle** (pourtant bien vivante à l'écran) dès qu'il se déclenchait.
- Conséquence exacte du signalement : l'écran d'attente reste réellement affiché sur le POD, mais l'agent croit qu'il n'y en a plus (`isBlankingActive()` renvoie `false`) — la LED/le statut du site affiche "non-blanking" alors que ce n'est pas le cas, et cliquer sur "masquer" depuis le site ne fait plus rien (le code pense qu'il n'y a rien à arrêter). Seule la touche Échap directement sur le POD fonctionnait encore, puisqu'elle ferme la fenêtre sans passer par cet état incohérent.
- Chaque fenêtre d'écran d'attente identifie maintenant précisément l'événement de fin qui lui appartient ; un événement provenant d'une fenêtre déjà remplacée par une plus récente est désormais ignoré au lieu d'écraser l'état de la fenêtre courante. Nouveau test verrouillant ce scénario exact.

## v2.2.50 — Correction de la régression introduite par la v2.2.49 (délai de 10s à nouveau fiable)

### Corrigé

- La vérification "Not Responding" ajoutée en v2.2.49 pour ignorer les process `acs.exe` fantômes avait un effet de bord non voulu : le moteur physique d'AC continue de tourner (et de produire de la télémétrie) même quand Windows marque brièvement la fenêtre du jeu comme "Not Responding" pendant un chargement — ce qui est parfaitement normal. Résultat : pendant un lancement tout à fait normal, l'agent pouvait considérer qu'AC n'était "pas en cours" pendant toute la durée de ce chargement, retardant (parfois bien au-delà des 10 secondes configurées) voire empêchant le retrait de l'écran d'attente.
- **`processMonitor.ts` sépare maintenant clairement les deux rôles** : `isAcRunning()` redevient une simple vérification de présence (comme avant la v2.2.49, et comme RS Launcher) — un `acs.exe` présent compte immédiatement comme "en cours", peu importe s'il est temporairement "Not Responding". Le suivi de la réactivité continue de tourner en tâche de fond, uniquement pour le nettoyage automatique des process réellement zombies après 5 minutes d'inactivité totale — il n'influence plus le délai de retrait du blanking.
- Tests mis à jour en conséquence.

## v2.2.49 — Vérification de la présence réelle d'Assetto Corsa (pas juste process/mémoire présents)

### Corrigé

- **Cause probable du blanking qui se retire tout seul au démarrage de l'agent, sans rien de lancé** : `isAcRunning()` se contentait de vérifier qu'un processus nommé `acs.exe` existe (`tasklist`), et `isAcLoaded()` que la mémoire partagée d'AC est mappée — aucun des deux ne vérifiait que c'était réellement le jeu **en cours d'utilisation**, pas un reste d'une session précédente (process planté/zombie, mémoire partagée restée mappée après un crash). Vérifié dans la dernière version de RS Launcher (`isAssettoRunning()`) : il fait exactement le même check `tasklist` basique, sans vérification supplémentaire — ce n'était donc pas quelque chose à copier depuis là, il fallait construire une vérification plus robuste que l'original.
- **`processMonitor.ts`** : `tasklist` est maintenant appelé en mode verbeux (`/V`) pour lire la colonne Status — un `acs.exe` présent mais marqué "Not Responding" par Windows n'est plus considéré comme "en cours" (donc ne masque plus l'écran d'attente à tort). S'il reste non-réactif plus de 5 minutes (largement au-delà de n'importe quel écran de chargement légitime), il est nettoyé automatiquement (`taskkill /F /T`).
- **`acSharedMemory.ts`** / `check-ac-shared-memory.ps1` : la présence des sections de mémoire partagée ne suffit plus — le script lit maintenant `packetId` (les 4 premiers octets d'`acpmf_graphics`) à deux reprises, à un instant d'écart ; s'il n'a pas bougé, la mémoire est considérée figée/périmée (laissée par une session précédente) et ignorée.
- Nouveaux tests (`processMonitor.spec.ts`, `acSharedMemory.spec.ts`) verrouillant ce comportement.

## v2.2.48 — Blanking qui se coupe presque instantanément malgré le délai réglé à 10s

### Corrigé

- **Cause probable trouvée** : la fenêtre de l'écran d'attente n'a ni barre de titre ni bouton de fermeture (recouvrement plein écran) — la seule façon "normale" de la fermer manuellement est la touche Échap. Or si le processus PowerShell/WPF se ferme tout seul (crash, exception WPF, etc.) très peu de temps après son lancement, l'agent interprétait ça comme une fermeture manuelle et basculait immédiatement en mode "masqué" — ce qui révélait le jeu instantanément, sans jamais passer par le délai configuré (10s par défaut), puisque ce délai ne s'applique qu'au chemin normal (jeu détecté → minuteur → masquage), pas à ce cas.
- L'agent relance maintenant automatiquement l'écran d'attente si le processus se ferme tout seul moins de 2 secondes après son démarrage (jusqu'à 3 tentatives consécutives), au lieu de considérer ça comme une fermeture volontaire et de révéler le jeu. Au-delà de 3 échecs consécutifs, l'ancien comportement (bascule en "masqué") reprend le dessus pour ne pas boucler indéfiniment si le script est réellement cassé.
- La sortie standard et les erreurs du script PowerShell de l'écran d'attente sont désormais capturées et journalisées (visibles dans le fichier de log et le panneau de la console locale ajoutés en v2.2.47) — jusqu'ici, une exception dans ce script ne laissait aucune trace exploitable.

## v2.2.47 — Console locale moderne pour l'agent

### Ajouté

- **Nouvelle fenêtre « Console »** accessible depuis l'icône de la barre des
  tâches (« Ouvrir la console », ou double-clic sur l'icône) : statut en
  direct (connexion serveur, Assetto Corsa en cours, écran d'attente
  actif/masqué — mêmes indicateurs que la LED ajoutée sur la page Postes du
  dashboard en v2.2.45), boutons d'action, et un panneau de logs récents.
  Construite en HTML/CSS (atomes : LED, bouton ; molécules : ligne de statut,
  ligne de log ; organismes : en-tête, panneau de statut, panneau d'actions,
  panneau de logs) rendu dans un contrôle `WebBrowser` WPF — même technique
  déjà utilisée en production pour l'écran d'attente et de résultats
  (`blanking.ps1`), pas d'Electron : l'agent reste un exécutable `pkg` léger.
- **Actions disponibles dans la console** : tout ce qui existait déjà dans le
  menu du tray (masquer/afficher l'écran d'attente, quitter), plus
  nouveau : synchroniser le contenu, vérifier les mises à jour, et
  redémarrer l'agent (relance propre du process, utile sur place sans accès
  au dashboard).
- **Logs persistés** : l'agent packagé écrit désormais aussi ses logs dans
  `%TEMP%\simracing-manager\logs\agent.log` (rotation simple au-delà de
  5 Mo) — jusqu'ici les logs partaient uniquement sur une sortie standard
  jetée puisque l'agent est lancé caché (`start-agent.vbs`). Les ~100
  dernières lignes alimentent aussi le panneau de logs de la console.
- L'icône de la barre des tâches est maintenant **activée par défaut** dans
  le `.env` généré pour les nouvelles installations (`TRAY_ICON=1`), puisque
  c'est désormais la porte d'entrée de la console. Les PODs déjà déployés
  gardent leur réglage actuel — éditer `TRAY_ICON=1` dans leur `.env` pour y
  avoir accès.

## v2.2.46 — Le vrai bug de l'écran d'attente qui se coupe instantanément

### Corrigé

- **Cause racine trouvée** : le blanking se coupait instantanément non pas à cause du délai (qui fonctionnait), mais parce que le mode kiosque amenait la fenêtre du jeu au premier plan dès qu'elle apparaissait (`Set-GameForeground`), en parallèle et sans se soucier du délai configuré de `BlankingManager`. La fenêtre du jeu passait ainsi visuellement par-dessus l'écran d'attente (pourtant "topmost") bien avant la fin du délai — les deux fonctionnalités (kiosque et délai) ne communiquaient pas entre elles.
- Le passage au premier plan du jeu est maintenant déclenché uniquement au moment où le blanking se retire réellement (fin du délai, ou masquage manuel), via un callback (`onGameRevealed`) — plus jamais avant. `kiosk.ps1` a une nouvelle action `Foreground` séparée de `Enter` (qui ne fait plus que masquer la barre des tâches et minimiser les autres fenêtres).
- **Fiche de fin affichée avant la fermeture du jeu** : `endSession()` affichait d'abord la fiche des stats _après_ avoir attendu la fermeture d'AC (jusqu'à 15s), laissant un temps mort. La fiche s'affiche maintenant immédiatement (fenêtre topmost par-dessus le jeu encore ouvert), puis le jeu se ferme derrière en tâche de fond.

## v2.2.45 — LED de statut du blanking sur la page des stations

### Ajouté

- **LED "Blanking"** sur chaque carte station de la page Postes : ambre (avec halo pulsant) quand l'écran d'attente est actif, grise quand il est retiré (jeu affiché). Reflète l'état réel envoyé par l'agent à chaque battement de cœur (`blankingActive`), donc à jour en direct sans rechargement.
- Nouvelle colonne `blanking_active` sur `stations` (migration `20260706195500_add_station_blanking_active`), alimentée par le heartbeat de l'agent et diffusée via `station:updated`.

### Note de déploiement

- Le délai configurable de 10s (v2.2.42) et son réglage dans **Paramètres** étaient déjà déployés en production (vérifié : bundle frontend et route backend `/api/settings` bien servis), mais ne pouvaient pas être visibles/actifs sur les PODs qui tournent encore une version de l'agent antérieure à la v2.2.42 — la mise à jour de l'agent ne se fait pas automatiquement, il faut déclencher le bouton **"Mettre à jour l'agent"** sur la page Postes pour chaque POD concerné (ou réinstaller manuellement).

## v2.2.44 — Détection du meilleur tour non valide (cut)

### Ajouté

- L'écran de fin de session affiche désormais **deux lignes de temps** : le meilleur tour **vérifié** (temps officiel reconnu par AC, `iBestTime`) et, si pertinent, le meilleur tour **non valide** (temps plus rapide mais rejeté par AC — sortie de piste/cut, etc.), affiché en rouge.
- Détection sans nouvelle donnée de télémétrie : AC exclut déjà les tours invalides de son propre `bestLapMs`. Un tour tout juste bouclé (`lastLapMs`) plus rapide que le meilleur temps valide connu, mais qui n'a pas fait progresser ce dernier, est donc forcément invalide — l'agent le repère par comparaison, sans heuristique de sortie de piste (`numberOfTyresOut`) ni nouveau champ de mémoire partagée.
- La tuile "meilleur tour non valide" n'apparaît que si un tel tour a réellement été enregistré durant la session.

## v2.2.43 — Auto-réparation périodique du blanking et du statut du POD

### Ajouté

- **Réconciliation périodique** (à chaque battement de cœur, toutes les 2s) : l'agent réévalue systématiquement l'état du blanking (voir v2.2.41 — déjà implicitement réévalué à chaque battement, rendu explicite ici) et **le statut rapporté au dashboard** (`agent:status`). Si le statut envoyé ne correspond plus à la réalité (processus AC réellement lancé/arrêté), l'agent le corrige tout seul après quelques secondes, sans attendre un événement explicite — même principe que RS Launcher (`syncAssettoState()`), qui resynchronisait `isconnected` à chaque cycle de sondage.
- Un délai de quelques secondes (2 battements) protège cette correction automatique des transitions normales de lancement/arrêt (le temps que `tasklist` détecte le nouveau processus), sauf à la toute première connexion de l'agent où la correction est immédiate (ex. agent redémarré alors qu'Assetto Corsa tournait déjà).

## v2.2.42 — Délai de retrait du blanking configurable

### Ajouté

- **Réglage "Écran d'attente"** dans la page Paramètres : délai (en secondes) avant le retrait du blanking une fois le jeu détecté lancé, pour laisser le temps au chargement. Réglable par l'admin, appliqué en direct à tous les PODs connectés (et à tout nouvel agent qui se connecte), par défaut **10 secondes**.
- Nouveau modèle `AppSettings` (backend), endpoints `GET/PATCH /api/settings`, événement socket `settings:updated` diffusé aux agents.
- Côté agent : `BlankingManager` applique désormais ce délai comme simple minuteur après détection du jeu (`acRunning`/`acLoaded`), sans dépendre de la télémétrie — s'il redevient "non prêt" avant la fin du délai, le retrait est annulé.

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
