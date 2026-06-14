import { useEffect, useState } from 'react';
import { tracksApi } from '../../services/api';
import { Track } from '../../types';

export default function AdminTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [form, setForm] = useState({
    acId: '',
    name: '',
    country: '',
    lengthKm: '',
    layouts: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    tracksApi.getAll().then(setTracks);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await tracksApi.create({
      ac_id: form.acId,
      name: form.name,
      country: form.country,
      length_km: form.lengthKm ? parseFloat(form.lengthKm) : undefined,
      layouts: form.layouts.split(',').map((l) => l.trim()).filter(Boolean) as any,
    });
    setForm({ acId: '', name: '', country: '', lengthKm: '', layouts: '' });
    loadData();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Gestion des circuits</h1>

      <div className="card">
        <h2 className="text-lg font-bold mb-4">Ajouter un circuit</h2>
        <form onSubmit={handleSubmit} className="grid md:grid-cols-6 gap-4 items-end">
          <div>
            <label className="label">ID AC</label>
            <input
              type="text"
              className="input"
              value={form.acId}
              onChange={(e) => setForm({ ...form, acId: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Nom</label>
            <input
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Pays</label>
            <input
              type="text"
              className="input"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Longueur (km)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.lengthKm}
              onChange={(e) => setForm({ ...form, lengthKm: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Layouts (séparés par ,)</label>
            <input
              type="text"
              className="input"
              value={form.layouts}
              onChange={(e) => setForm({ ...form, layouts: e.target.value })}
              placeholder="GP, Endurance"
            />
          </div>
          <button type="submit" className="btn-primary">
            Ajouter
          </button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left border-b border-dark-600">
              <th className="pb-3 text-gray-400 font-medium">ID AC</th>
              <th className="pb-3 text-gray-400 font-medium">Nom</th>
              <th className="pb-3 text-gray-400 font-medium">Pays</th>
              <th className="pb-3 text-gray-400 font-medium">Longueur</th>
              <th className="pb-3 text-gray-400 font-medium">Layouts</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((t) => (
              <tr key={t.id} className="border-b border-dark-700 last:border-0">
                <td className="py-3 font-mono text-sm">{t.ac_id}</td>
                <td className="py-3">{t.name}</td>
                <td className="py-3">{t.country}</td>
                <td className="py-3">{t.length_km} km</td>
                <td className="py-3">
                  {t.layouts?.map((l) => l.name).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
