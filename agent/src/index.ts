import { io, Socket } from 'socket.io-client';
import { config } from './config';
import { launchSession } from './cm';
import { isAcRunning, isCmRunning, killAssettoCorsa } from './ac';
import { getLatestResults } from './results';
import { AcServerInfo, getLocalAcServers } from './acServer';
import { launchDedicatedServer, stopDedicatedServer } from './serverLauncher';
import { AcContent, scanAssettoContent } from './contentScanner';
import { writeSessionState, clearSessionState } from './state';
import { setupConsole, setStatus, log } from './console';
import { triggerUpdate } from './updater';
import { getLocalIp } from './network';
import { joinServer } from './joinServer';

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

const AGENT_VERSION = '1.3.11';

process.on('uncaughtException', (err) => {
  const fs = require('fs');
  const path = require('path');
  const crashPath = path.join(config.baseDir, 'crash.log');
  const line = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.stack || err.message || err}\n`;
  try {
    fs.appendFileSync(crashPath, line);
  } catch {}
  console.error(line);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const fs = require('fs');
  const path = require('path');
  const crashPath = path.join(config.baseDir, 'crash.log');
  const line = `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n`;
  try {
    fs.appendFileSync(crashPath, line);
  } catch {}
  console.error(line);
});

setupConsole();
setStatus({
  version: AGENT_VERSION,
  stationName: config.stationName,
  stationId: config.stationId,
  serverUrl: config.serverUrl,
  launchMode: config.launchMode,
});
log('info', `Poste ${config.stationName} (${config.stationId})`);
log('info', `Serveur central ${config.serverUrl}`);
log('info', `Mode de lancement ${config.launchMode.toUpperCase()}`);
log('info', `Heartbeat ${config.heartbeatIntervalMs}ms`);
log('info', `Scan serveurs ${config.serverScanIntervalMs}ms`);

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
let lastKnownContent: AcContent | null = null;

socket.on('agent:update', async () => {
  log('info', 'Mise à jour : demande reçue');
  try {
    await triggerUpdate(process.execPath);
  } catch (err: any) {
    log('error', `Mise à jour : ${err.message}`);
  }
});

socket.on('pod:joinServer', async (data: { serverIp: string; serverPort: number; serverHttpPort?: number; serverName?: string; carAcId: string; password?: string; skin?: string }) => {
  log('info', `Demande de rejoindre le serveur ${data.serverIp}:${data.serverPort}`);
  try {
    await joinServer(data);
    log('success', 'Assetto Corsa lancé pour rejoindre le serveur');
    socket.emit('pod:joinedServer', { success: true });
  } catch (err: any) {
    log('error', `Erreur join server : ${err.message}`);
    socket.emit('pod:joinedServer', { success: false, error: err.message });
  }
});

socket.on('connect', () => {
  log('success', 'Connecté au serveur central');
  setStatus({ status: 'online' });
  socket.emit('agent:register', {
    stationId: config.stationId,
    pcIdentifier: require('os').hostname(),
    version: AGENT_VERSION,
  });
  // Envoyer immédiatement l'état des serveurs locaux et le contenu AC à la connexion
  sendServerStatus();
  sendContentStatus();
});

socket.on('disconnect', (reason: string) => {
  log('warn', `Déconnexion : ${reason}`);
  setStatus({ status: 'offline' });
});

socket.on('session:launch', async (launchConfig: LaunchConfig) => {
  log('info', 'Session : commande de lancement reçue');

  if (launchConfig.stationId !== config.stationId) {
    log('warn', 'Session : ignorée (pas pour ce poste)');
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
    log('error', `Session : ${err.message}`);
    socket.emit('session:finished', {
      sessionId: launchConfig.sessionId,
      stationId: config.stationId,
      error: err.message,
    });
    currentSession = null;
    currentSessionId = undefined;
  }
});

socket.on('server:launch', async (cfg: { serverId: string; name: string; track: string; trackLayout?: string; cars: string[]; maxClients?: number; password?: string }) => {
  log('info', 'Serveur dédié : commande de lancement reçue');
  try {
    const launched = await launchDedicatedServer(cfg, (code, signal) => {
      log('error', `Serveur dédié terminé (code ${code}, signal ${signal})`);
      socket.emit('server:stopped', { serverId: cfg.serverId, error: `Processus terminé (code ${code}, signal ${signal})` });
    });
    log('success', `Serveur dédié démarré (PID ${launched.pid})`);
    socket.emit('server:started', { serverId: cfg.serverId, serverDir: launched.serverDir });
  } catch (err: any) {
    log('error', `Serveur dédié : ${err.message}`);
    socket.emit('server:stopped', { serverId: cfg.serverId, error: err.message });
  }
});

socket.on('server:stop', async (data: { serverId: string }) => {
  log('info', 'Serveur dédié : commande d\'arrêt reçue');
  await stopDedicatedServer();
  socket.emit('server:stopped', { serverId: data.serverId });
});

socket.on('session:stop', async (data: { sessionId: string; stationId: string }) => {
  log('info', 'Session : commande d\'arrêt reçue');

  if (data.stationId !== config.stationId) return;

  stopResultChecking();
  setStatus({ status: 'online', currentSessionId: undefined });
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
      setStatus({ acRunning: running });
      if (!running && currentSession) {
        log('info', 'AC/CM ne tourne plus, récupération des résultats...');
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
      log('error', `Surveillance AC : ${err.message}`);
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
  setStatus({ status, currentSessionId, acRunning: lastKnownAcRunning, cmRunning: lastKnownCmRunning });
  socket.emit('station:heartbeat', {
    stationId: config.stationId,
    status,
    currentSessionId,
    acRunning: lastKnownAcRunning,
    cmRunning: lastKnownCmRunning,
    localIp: getLocalIp(),
  });
}, config.heartbeatIntervalMs);

// Surveillance périodique d'AC/CM (moins fréquente que le heartbeat)
setInterval(async () => {
  try {
    lastKnownAcRunning = await isAcRunning();
    lastKnownCmRunning = await isCmRunning();
    setStatus({ acRunning: lastKnownAcRunning, cmRunning: lastKnownCmRunning });
  } catch (err: any) {
    log('error', `Surveillance : ${err.message}`);
  }
}, config.resultCheckIntervalMs);

// Surveillance périodique du contenu Assetto Corsa (toutes les 5 min)
setInterval(async () => {
  try {
    await sendContentStatus();
  } catch (err: any) {
    log('error', `Contenu AC : ${err.message}`);
  }
}, 5 * 60 * 1000);

// Surveillance périodique des serveurs dédiés AC locaux
log('info', `Démarrage du scan des serveurs locaux toutes les ${config.serverScanIntervalMs || 15000}ms`);
setInterval(async () => {
  try {
    await sendServerStatus();
  } catch (err: any) {
    log('error', `Serveurs : ${err.message}`);
  }
}, config.serverScanIntervalMs || 15000);

async function sendServerStatus() {
  const servers = await getLocalAcServers();
  const changed =
    servers.length !== lastKnownServers.length ||
    JSON.stringify(servers) !== JSON.stringify(lastKnownServers);
  lastKnownServers = servers;
  setStatus({ serversRunning: servers.length });
  socket.emit('server:status', {
    stationId: config.stationId,
    servers,
    localIp: getLocalIp(),
  });
}

async function sendContentStatus() {
  log('info', 'Scan du contenu Assetto Corsa...');
  const content = await scanAssettoContent();
  const changed = JSON.stringify(content) !== JSON.stringify(lastKnownContent);
  if (changed) {
    lastKnownContent = content;
    socket.emit('station:content', {
      stationId: config.stationId,
      content,
    });
  }
}

log('info', 'Agent en attente de commandes...');
