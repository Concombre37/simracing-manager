import { useState, FormEvent } from 'react';
import { api } from '../services/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStationModal({ onClose, onCreated }: Props) {
  const [stationId, setStationId] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<{ apiKey: string }>('/stations', { stationId, name });
      setApiKey(data.apiKey);
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Create station</h2>
        {apiKey ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Station created. Copy the API key now, it will not be shown again:
            </p>
            <code className="block break-all rounded-lg bg-gray-100 p-3 text-xs">{apiKey}</code>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Station ID</label>
              <input
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="poste-1"
                required
                pattern="[a-z0-9-]+"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Display name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="Poste 1"
                required
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
