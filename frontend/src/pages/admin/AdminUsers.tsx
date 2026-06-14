import { useEffect, useState } from 'react';
import { usersApi } from '../../services/api';
import { User } from '../../types';

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  employee: 'Employé',
  customer: 'Client',
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    usersApi.getAll().then(setUsers);
  };

  const updateRole = async (id: string, role: string) => {
    await usersApi.updateRole(id, role as any);
    loadData();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Gestion des clients</h1>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left border-b border-dark-600">
              <th className="pb-3 text-gray-400 font-medium">Nom</th>
              <th className="pb-3 text-gray-400 font-medium">Email</th>
              <th className="pb-3 text-gray-400 font-medium">Téléphone</th>
              <th className="pb-3 text-gray-400 font-medium">Rôle</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-dark-700 last:border-0">
                <td className="py-3">
                  {u.first_name} {u.last_name}
                </td>
                <td className="py-3">{u.email}</td>
                <td className="py-3">-</td>
                <td className="py-3">
                  <select
                    className="select text-sm py-1"
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
