import { api } from './api';
import type { TelemetrySnapshot } from '@simracing/shared';

export const telemetryApi = {
  getByStation: (stationId: string) =>
    api.get<TelemetrySnapshot | null>(`/stations/${stationId}/telemetry`).then((res) => res.data),
};
