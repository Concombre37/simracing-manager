import { useEffect, useState } from 'react';
import { carsApi } from '../../services/api';
import { Car } from '../../types';

export default function AdminCars() {
  const [cars, setCars] = useState<Car[]>([]);
  const [form, setForm] = useState({
    acId: '',
    name: '',
    brand: '',
    category: '',
    isPremium: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    carsApi.getAll().then(setCars);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await carsApi.create({
      ac_id: form.acId,
      name: form.name,
      brand: form.brand,
      category: form.category,
      is_premium: form.isPremium,
    });
    setForm({ acId: '', name: '', brand: '', category: '', isPremium: false });
    loadData();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Gestion des voitures</h1>

      <div className="card">
        <h2 className="text-lg font-bold mb-4">Ajouter une voiture</h2>
        <form onSubmit={handleSubmit} className="grid md:grid-cols-5 gap-4 items-end">
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
            <label className="label">Marque</label>
            <input
              type="text"
              className="input"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Catégorie</label>
            <input
              type="text"
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
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
              <th className="pb-3 text-gray-400 font-medium">Marque</th>
              <th className="pb-3 text-gray-400 font-medium">Catégorie</th>
              <th className="pb-3 text-gray-400 font-medium">Premium</th>
            </tr>
          </thead>
          <tbody>
            {cars.map((c) => (
              <tr key={c.id} className="border-b border-dark-700 last:border-0">
                <td className="py-3 font-mono text-sm">{c.ac_id}</td>
                <td className="py-3">{c.name}</td>
                <td className="py-3">{c.brand}</td>
                <td className="py-3">{c.category}</td>
                <td className="py-3">{c.is_premium ? 'Oui' : 'Non'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
