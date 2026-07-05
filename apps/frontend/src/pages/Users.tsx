import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, type User } from '../services/users';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Label } from '../components/ui/Input';
import { Plus, Pencil, Trash2, Users as UsersIcon, Shield, Wrench } from 'lucide-react';

export function Users() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: usersApi.remove,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <PageShell
      title="Utilisateurs"
      subtitle="Gestion des comptes et des rôles"
      actions={
        <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Créer un compte
        </Button>
      }
    >
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-dark-900/70 border-b border-dark-600">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Utilisateur
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Rôle
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Créé le
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Chargement...
                  </td>
                </tr>
              ) : (
                users?.map((user) => (
                  <tr key={user.id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-dark-700 rounded-lg">
                          <UsersIcon className="w-4 h-4 text-gray-400" />
                        </div>
                        <span className="text-sm font-medium text-white">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingUser(user)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          onClick={() => {
                            if (confirm('Supprimer cet utilisateur ?')) {
                              deleteMutation.mutate(user.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isCreateOpen && (
        <UserFormModal
          title="Créer un compte"
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) =>
            createMutation.mutate(
              data as { email: string; password: string; role: 'admin' | 'technician' },
            )
          }
          isSubmitting={createMutation.isPending}
        />
      )}

      {editingUser && (
        <UserFormModal
          title="Modifier l'utilisateur"
          initialEmail={editingUser.email}
          initialRole={editingUser.role}
          onClose={() => setEditingUser(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingUser.id, data })}
          isSubmitting={updateMutation.isPending}
          isEdit
        />
      )}
    </PageShell>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-purple-900/50 text-purple-300 border-purple-800">
        <Shield className="w-3 h-3" />
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-blue-900/50 text-blue-300 border-blue-800">
      <Wrench className="w-3 h-3" />
      Technicien
    </span>
  );
}

interface UserFormModalProps {
  title: string;
  initialEmail?: string;
  initialRole?: 'admin' | 'technician';
  onClose: () => void;
  onSubmit: (data: { email: string; password?: string; role: 'admin' | 'technician' }) => void;
  isSubmitting: boolean;
  isEdit?: boolean;
}

function UserFormModal({
  title,
  initialEmail = '',
  initialRole = 'technician',
  onClose,
  onSubmit,
  isSubmitting,
  isEdit,
}: UserFormModalProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'technician'>(initialRole);

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ email, password: password || undefined, role });
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">
            Mot de passe {isEdit && '(laisser vide pour ne pas changer)'}
          </Label>
          <Input
            id="password"
            type="password"
            required={!isEdit}
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="role">Rôle</Label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'technician')}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-orange"
          >
            <option value="technician">Technicien</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
