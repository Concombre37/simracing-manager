import { useState, useEffect } from 'react';
import { leaderboardApi, carsApi, tracksApi } from '../services/api';
import { Car, Track } from '../types';

function formatTime(ms?: number) {
  if (!ms) return '-';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export default function Leaderboard() {
  const [results, setResults] = useState<any[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedCar, setSelectedCar] = useState('');
  const [selectedTrack, setSelectedTrack] = useState('');

  useEffect(() => {
    carsApi.getAll().then(setCars);
    tracksApi.getAll().then(setTracks);
    loadResults();
  }, []);

  const loadResults = () => {
    leaderboardApi
      .get({ trackId: selectedTrack || undefined, carId: selectedCar || undefined })
      .then(setResults);
  };

  useEffect(() => {
    loadResults();
  }, [selectedCar, selectedTrack]);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Classement</h1>

      <div className="card mb-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Circuit</label>
            <select
              className="select"
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
            >
              <option value="">Tous les circuits</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Voiture</label>
            <select
              className="select"
              value={selectedCar}
              onChange={(e) => setSelectedCar(e.target.value)}
            >
              <option value="">Toutes les voitures</option>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {results.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Aucun temps enregistré.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-dark-600">
                <th className="pb-3 text-gray-400 font-medium">#</th>
                <th className="pb-3 text-gray-400 font-medium">Config</th>
                <th className="pb-3 text-gray-400 font-medium">Circuit</th>
                <th className="pb-3 text-gray-400 font-medium">Voiture</th>
                <th className="pb-3 text-gray-400 font-medium">Poste</th>
                <th className="pb-3 text-gray-400 font-medium">Meilleur tour</th>
                <th className="pb-3 text-gray-400 font-medium">Tours</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, index) => (
                <tr key={r.id} className="border-b border-dark-700 last:border-0">
                  <td className="py-3 font-bold text-accent-orange">{index + 1}</td>
                  <td className="py-3">{r.config_name}</td>
                  <td className="py-3 text-gray-400">
                    {r.track_name} {r.layout_name && `(${r.layout_name})`}
                  </td>
                  <td className="py-3 text-gray-400">{r.car_name}</td>
                  <td className="py-3 text-gray-400">{r.station_name}</td>
                  <td className="py-3 font-mono text-white">{formatTime(r.best_lap_time_ms)}</td>
                  <td className="py-3 text-gray-400">{r.lap_count || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
