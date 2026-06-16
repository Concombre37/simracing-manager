import type { StationWithApiKey } from '../services/stations';

export function downloadEnvFile(station: Pick<StationWithApiKey, 'stationId' | 'name' | 'apiKey'>) {
  const serverUrl = window.location.origin;
  const content = [
    '# Configuration SimRacing Manager Agent',
    `SERVER_URL=${serverUrl}`,
    `STATION_ID=${station.stationId}`,
    `STATION_NAME=${station.name}`,
    `API_KEY=${station.apiKey}`,
    'LAUNCH_MODE=cm',
    '',
    '# Chemin vers le dossier Documents Assetto Corsa (optionnel, auto-détecté)',
    '# DOCUMENTS_PATH=C:\\\\Users\\\\Nom\\\\Documents\\\\Assetto Corsa',
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `.env_${station.stationId}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
