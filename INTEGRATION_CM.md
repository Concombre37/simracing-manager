# Intégration Content Manager / Assetto Corsa

## Architecture

```
Site web (simracing.hytlabs.com)
        ↓ WebSocket
Serveur central (Docker sur la VM)
        ↓ WebSocket
Agent local (PC de simulation)
        ↓ lancement / fichiers
Content Manager → Assetto Corsa
        ↓ résultats
Fichiers JSON dans Documents\Assetto Corsa\out
```

## Composants créés

### 1. Agent local (`/agent`)

Fichiers principaux :
- `src/index.ts` : connexion WebSocket, commandes serveur
- `src/cm.ts` : génération de preset CM et lancement
- `src/ac.ts` : surveillance des processus AC/CM
- `src/results.ts` : lecture des résultats AC
- `src/state.ts` : écriture de l'état pour l'overlay CSP

### 2. Overlay CSP (`/csp-app`)

À copier dans `Documents\Assetto Corsa\apps\lua\simcenter_overlay`

Affiche en jeu :
- Nom du pilote
- Temps restant de session

### 3. Backend

- Endpoint `POST /api/sessions` : lance une session sur un poste
- Événement `session:launch` : envoyé à l'agent
- Événement `session:stop` : arrêt de session
- Événement `session:finished` : récupération des résultats

## Installation sur un PC de simulation

### Prérequis

- Windows 10/11
- Node.js 20+
- Assetto Corsa installé
- Content Manager installé (recommandé)
- Custom Shaders Patch (CSP) installé pour l'overlay

### Étapes

1. **Copier l'agent** sur le PC :
   ```
   C:\SimCenter\agent\
   ```

2. **Créer le fichier `.env`** :
   ```env
   SERVER_URL=https://simracing.hytlabs.com
   STATION_ID=poste-1
   STATION_NAME=Poste 1
   AC_PATH=C:\Program Files (x86)\Steam\steamapps\common\assettocorsa
   CM_PATH=C:\Program Files\Content Manager
   LAUNCH_MODE=cm
   ```

3. **Installer et lancer** :
   ```bash
   cd C:\SimCenter\agent
   npm install
   npm start
   ```

4. **Installer l'overlay CSP** :
   Copier le dossier `csp-app/SimCenter/apps/lua/simcenter_overlay` dans :
   ```
   Documents\Assetto Corsa\apps\lua\
   ```
   Activer l'app dans le menu CSP en jeu.

## Test d'une session

1. Créer une réservation depuis le site
2. Aller dans le back-office → Réservations
3. Créer une session de jeu associée (si l'interface admin le permet) ou utiliser l'API :
   ```bash
   curl -X POST https://simracing.hytlabs.com/api/sessions \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "reservationId": "...",
       "carId": "...",
       "trackLayoutId": "...",
       "sessionType": "practice"
     }'
   ```
4. L'agent reçoit la commande et lance CM/AC
5. Quand le jeu se ferme, les résultats sont envoyés automatiquement

## Limitations

- L'agent nécessite des droits pour lancer des processus
- Content Manager n'a pas d'API officielle stable : on passe par des presets
- Les chemins AC/CM doivent être configurés manuellement
- L'overlay CSP est basique et peut nécessiter des ajustements selon la version de CSP

## Débogage

Logs agent :
```
npm start
```

Logs serveur :
```bash
docker logs -f simracing
```
