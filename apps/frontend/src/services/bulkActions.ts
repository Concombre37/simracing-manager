import { api } from './api';

export interface BulkActionResult {
  succeeded: string[];
  failed: { stationId: string; error: string }[];
}

function post(action: string, stationIds: string[]) {
  return api
    .post<BulkActionResult>(`/bulk-actions/${action}`, { stationIds })
    .then((res) => res.data);
}

export const bulkActionsApi = {
  wake: (stationIds: string[]) => post('wake', stationIds),
  shutdown: (stationIds: string[]) => post('shutdown', stationIds),
  restart: (stationIds: string[]) => post('restart', stationIds),
  blankingHide: (stationIds: string[]) => post('blanking-hide', stationIds),
  blankingShow: (stationIds: string[]) => post('blanking-show', stationIds),
  updateAgent: (stationIds: string[]) => post('update-agent', stationIds),
  syncContent: (stationIds: string[]) => post('sync-content', stationIds),
};
