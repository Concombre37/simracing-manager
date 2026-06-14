import { useEffect, useState } from 'react';
import { sessionConfigsApi, carsApi, tracksApi } from '../services/api';
import { SessionConfig, Car, Track } from '../types';

export default function SessionConfigs() {
  const [configs, setConfigs] = useState<SessionConfig[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    carId: '',
    trackLayoutId: '',
    weatherPreset: 'default',
    sessionType: 'practice' as const,
    isDefault: false,
  });

  useEffect(() => {
    loadData();
    carsApi.getAll().then(setCars);
    tracksApi.getAll().then(setTracks);
  }, []);

  const loadData = () => {
    sessionConfigsApi.getAll().then(setConfigs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sessionConfigsApi.create({
      name: form.name,
      car_id: form.carId,
      track_layout_id: form.trackLayoutId,
      weather_preset: form.weatherPreset,
      session_type: form.sessionType,
      is_default: form.isDefault,
    });
    setForm({ name: '', carId: '', trackLayoutId: '', weatherPreset: 'default', sessionType: 'practice', isDefault: false });
    setShowForm(false);
    loadData();
  };

  const deleteConfig = async (id: string) => {
    if (confirm('Supprimer cette configuration ?')) {
      await sessionConfigsApi.delete(id);
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Configurations de session</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Annuler' : 'Nouvelle config'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-bold mb-4">Créer une configuration</h2>
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
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
              <label className="label">Type de session</label>
              <select
                className="select"
                value={form.sessionType}
                onChange={(e) => setForm({ ...form, sessionType: e.target.value as any })}
              >
                <option value="practice">Practice</option>
                <option value="race">Course</option>
                <option value="hotlap">Hotlap</option>
              </select>
            </div>
            <div>
              <label className="label">Voiture</label>
              <select
                className="select"
                value={form.carId}
                onChange={(e) => setForm({ ...form, carId: e.target.value })}
                required
              >
                <option value="">Choisir</option>
                {cars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Circuit / Layout</label>
              <select
                className="select"
                value={form.trackLayoutId}
                onChange={(e) => setForm({ ...form, trackLayoutId: e.target.value })}
                required
              >
                <option value="">Choisir</option>
                {tracks.map((t) => (
                  <optgroup key={t.id} label={t.name}>
                    {t.layouts?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Météo</label>
              <input
                type="text"
                className="input"
                value={form.weatherPreset}
                onChange={(e) => setForm({ ...form, weatherPreset: e.target.value })}
              />
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-gray-300">Configuration par défaut</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Créer la configuration
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {configs.map((c) => (
          <div key={c.id} className={`card ${c.is_default ? 'border-accent-orange' : ''}`}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-bold">{c.name}</h3>
              {c.is_default && <span className="badge badge-orange">Défaut</span>}
            </div>
            <div className="text-sm text-gray-400 space-y-1">
              <p>Voiture: {c.car_name}</p>
              <p>Circuit: {c.track_name} ({c.layout_name})</p>
              <p>Météo: {c.weather_preset || 'default'}</p>
              <p>Type: {c.session_type}</p>
            </div>
            <button
              onClick={() => deleteConfig(c.id)}
              className="btn-danger text-sm mt-4 w-full"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
