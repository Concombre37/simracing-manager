import { api } from './api';

export interface ScreenRecording {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  createdAt: string;
  playbackUrl: string;
  downloadUrl: string;
}

export const spectatorApi = {
  listRecordings: () => api.get<ScreenRecording[]>('/spectator/recordings').then((res) => res.data),
  uploadRecording: (file: Blob, fileName: string, title: string, durationSeconds: number) => {
    const form = new FormData();
    form.append('file', file, fileName);
    form.append('title', title);
    form.append('durationSeconds', String(durationSeconds));
    return api
      .post<ScreenRecording>('/spectator/recordings', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10 * 60 * 1000,
      })
      .then((res) => res.data);
  },
  removeRecording: (id: string) => api.delete(`/spectator/recordings/${id}`),
  getRecordingBlob: (id: string) =>
    api.get<Blob>(`/spectator/recordings/${id}/file`, { responseType: 'blob' }).then((res) => res.data),
};
