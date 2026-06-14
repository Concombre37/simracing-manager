import { io, Socket } from 'socket.io-client';
import { config } from './config';
import { launchSession } from './cm';
import { isAcRunning, isCmRunning, killAssettoCorsa } from './ac';
import { getLatestResults } from './results';
import { AcServerInfo, getLocalAcServers } from './acServer';
import { writeSessionState, clearSessionState } from './state';

interface LaunchConfig {
  sessionId: string;
  reservationId: string;
  stationId: string;
  userId: string;
  userName?: string;
  carId?: string;
  carAcId?: string;
  trackAcId?: string;
  trackLayoutId?: string;
  layoutName?: string;
  weatherPreset?: string;
  sessionType?: 'practice' | 'race' | 'hotlap';
}

console.log(`Agent Sim Center démarrant pour ${config.stationName} (${config.stationId})`);
console.log(`Connexion au serveur: ${config.serverUrl}`);
console.log(`Mode de lancement: ${config.launchMode}`);
console.log(`Heartbeat interval: ${config.heartbeatIntervalMs}ms`);
console.log(`Server scan interval: ${config.serverScanIntervalMs}ms`);

const socket: Socket = io(config.serverUrl, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
});

let currentSession: LaunchConfig | null = null;
let currentSessionId: string | undefined;
let resultCheckInterval: NodeJS.Timeout | null = null;
let lastKnownAcRunning = false;
let lastKnownCmRunning = false;
let lastKnownServers: AcServerInfo[] = [];

socket.on('connect', () => {
  console.log('Connecté au serveur central');
  socket.emit('agent:register', {
    stationId: config.stationId,
    pcIdentifier: require('os').hostname(),
  });
  // Envoyer immédiatement l'état des serveurs locaux à la connexion
  sendServerStatus();
});

socket.on('disconnect', (reason: string) => {
  console.log('Déconnecté du serveur central:', reason);
});

socket.on('session:launch', async (launchConfig: LaunchConfig) => {
  console.log('Commande de lancement reçue:', launchConfig);

  if (launchConfig.stationId !== config.stationId) {
    console.log('Session ignorée (pas pour ce poste)');
    return;
  }

  try {
    currentSession = launchConfig;
    currentSessionId = launchConfig.sessionId;

    // Calculer l'heure de fin approximative (1h par défaut)
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    await writeSessionState({
      clientName: launchConfig.userName || 'Pilote',
      endTime,
      sessionId: launchConfig.sessionId,
    });

    socket.emit('session:started', {
      sessionId: launchConfig.sessionId,
      stationId: config.stationId,
    });

    await launchSession({
      sessionId: launchConfig.sessionId,
      userId: launchConfig.userId,
      carAcId: launchConfig.carAcId,
      trackAcId: launchConfig.trackAcId,
      layoutName: launchConfig.layoutName,
      weatherPreset: launchConfig.weatherPreset,
      sessionType: launchConfig.sessionType || 'practice',
    });

    startResultChecking(launchConfig.sessionId);
  } catch (err: any) {
    console.error('Erreur lors du lancement:', err.message);
    socket.emit('session:finished', {
      sessionId: launchConfig.sessionId,
      stationId: config.stationId,
      error: err.message,
    });
    currentSession = null;
    currentSessionId = undefined;
  }
});

socket.on('session:stop', async (data: { sessionId: string; stationId: string }) => {
  console.log('Commande d\'arrêt reçue:', data);

  if (data.stationId !== config.stationId) return;

  stopResultChecking();
  await killAssettoCorsa();
  await clearSessionState();

  const results = await getLatestResults();
  socket.emit('session:finished', {
    sessionId: data.sessionId,
    stationId: config.stationId,
    results: results
      ? {
          sessionId: data.sessionId,
          userId: currentSession?.userId,
          lapCount: results.lapCount,
          bestLapTimeMs: results.bestLapTimeMs,
          totalTimeMs: results.totalTimeMs,
          position: results.position,
        }
      : undefined,
  });

  currentSession = null;
  currentSessionId = undefined;
});

function startResultChecking(sessionId: string) {
  if (resultCheckInterval) clearInterval(resultCheckInterval);

  resultCheckInterval = setInterval(async () => {
    try {
      const running = await isAcRunning();
      lastKnownAcRunning = running;
      if (!running && currentSession) {
        console.log('AC/CM ne tourne plus, récupération des résultats...');
        stopResultChecking();
        const results = await getLatestResults();
        socket.emit('session:finished', {
          sessionId,
          stationId: config.stationId,
          results: results
            ? {
                sessionId,
                userId: currentSession.userId,
                lapCount: results.lapCount,
                bestLapTimeMs: results.bestLapTimeMs,
                totalTimeMs: results.totalTimeMs,
                position: results.position,
              }
            : undefined,
        });
        currentSession = null;
        currentSessionId = undefined;
      }
    } catch (err: any) {
      console.error('Erreur surveillance AC:', err.message);
    }
  }, config.resultCheckIntervalMs);
}

function stopResultChecking() {
  if (resultCheckInterval) {
    clearInterval(resultCheckInterval);
    resultCheckInterval = null;
  }
}

// Heartbeat simple sans dépendre de isAcRunning pour éviter les blocages
setInterval(() => {
  const status = currentSession ? (lastKnownAcRunning ? 'in_use' : 'online') : 'online';
  console.log(`Envoi heartbeat: ${config.stationId} -> ${status}`);
  socket.emit('station:heartbeat', {
    stationId: config.stationId,
    status,
    currentSessionId,
    acRunning: lastKnownAcRunning,
    cmRunning: lastKnownCmRunning,
  });
}, config.heartbeatIntervalMs);

// Surveillance périodique d'AC/CM (moins fréquente que le heartbeat)
setInterval(async () => {
  try {
    lastKnownAcRunning = await isAcRunning();
    lastKnownCmRunning = await isCmRunning();
  } catch (err: any) {
    console.error('Erreur isAcRunning/isCmRunning:', err.message);
  }
}, config.resultCheckIntervalMs);

// Surveillance périodique des serveurs dédiés AC locaux
console.log(`[acServer] Démarrage du scan des serveurs locaux toutes les ${config.serverScanIntervalMs || 15000}ms`);
setInterval(async () => {
  try {
    console.log('[acServer] Scan des serveurs locaux en cours...');
    await sendServerStatus();
  } catch (err: any) {
    console.error('Erreur scan serveurs locaux:', err.message);
  }
}, config.serverScanIntervalMs || 15000);

async function sendServerStatus() {
  console.log('[acServer] Appel de getLocalAcServers()');
  const servers = await getLocalAcServers();
  const changed =
    servers.length !== lastKnownServers.length ||
    JSON.stringify(servers) !== JSON.stringify(lastKnownServers);
  console.log(`[acServer] Changement détecté: ${changed}, serveurs: ${servers.length}`);
  if (changed) {
    lastKnownServers = servers;
    console.log(`Serveurs locaux détectés: ${servers.length}`);
    socket.emit('server:status', {
      stationId: config.stationId,
      servers,
    });
  }
}

console.log('Agent en attente de commandes...');
