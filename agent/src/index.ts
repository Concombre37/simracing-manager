import { io, Socket } from 'socket.io-client';
import { config } from './config';
import { launchSession } from './cm';
import { isAcRunning, killAssettoCorsa } from './ac';
import { getLatestResults } from './results';
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

const socket: Socket = io(config.serverUrl, {
  transports: ['websocket', 'polling'],
});

let currentSession: LaunchConfig | null = null;
let currentUserId: string | undefined;
let resultCheckInterval: NodeJS.Timeout | null = null;

socket.on('connect', () => {
  console.log('Connecté au serveur central');
  socket.emit('agent:register', {
    stationId: config.stationId,
    pcIdentifier: require('os').hostname(),
  });
});

socket.on('disconnect', () => {
  console.log('Déconnecté du serveur central');
});

socket.on('session:launch', async (launchConfig: LaunchConfig) => {
  console.log('Commande de lancement reçue:', launchConfig);

  if (launchConfig.stationId !== config.stationId) {
    console.log('Session ignorée (pas pour ce poste)');
    return;
  }

  try {
    currentSession = launchConfig;
    currentUserId = launchConfig.userId;

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
    currentUserId = undefined;
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
          userId: currentUserId,
          lapCount: results.lapCount,
          bestLapTimeMs: results.bestLapTimeMs,
          totalTimeMs: results.totalTimeMs,
          position: results.position,
        }
      : undefined,
  });

  currentSession = null;
  currentUserId = undefined;
});

function startResultChecking(sessionId: string) {
  if (resultCheckInterval) clearInterval(resultCheckInterval);

  resultCheckInterval = setInterval(async () => {
    const running = await isAcRunning();
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
              userId: currentUserId,
              lapCount: results.lapCount,
              bestLapTimeMs: results.bestLapTimeMs,
              totalTimeMs: results.totalTimeMs,
              position: results.position,
            }
          : undefined,
      });
      currentSession = null;
      currentUserId = undefined;
    }
  }, config.resultCheckIntervalMs);
}

function stopResultChecking() {
  if (resultCheckInterval) {
    clearInterval(resultCheckInterval);
    resultCheckInterval = null;
  }
}

setInterval(async () => {
  const running = await isAcRunning();
  socket.emit('station:heartbeat', {
    stationId: config.stationId,
    status: currentSession ? (running ? 'in_use' : 'online') : running ? 'in_use' : 'online',
    currentUserId: currentUserId,
    acRunning: running,
  });
}, config.heartbeatIntervalMs);

console.log('Agent en attente de commandes...');
