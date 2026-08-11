import axios from 'axios';

/** Instance dédiée à la page tablette publique (`/tablet-menu`) — jamais
 * `services/api.ts` : celle-ci attache le JWT localStorage et redirige vers
 * `/login` sur 401, ce qui casserait une page sans compte utilisateur.
 * Authentifiée par clé API externe (`ApiKeysModule`/`ExternalApiController`
 * côté backend), lue au build depuis `VITE_TABLET_MENU_API_KEY`
 * (`apps/frontend/.env`, jamais committée). */
export const externalApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '/api') + '/external/v1',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': import.meta.env.VITE_TABLET_MENU_API_KEY ?? '',
  },
});
