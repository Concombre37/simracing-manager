import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, Plus, Pencil, Trash2, ImageOff, Upload, ImageMinus } from 'lucide-react';
import { arcadeApi, type ArcadeAttraction, type ArcadeAttractionInput } from '../services/arcade';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

const DEFAULT_INPUT: ArcadeAttractionInput = { name: '', players: '', kind: '' };

export function Arcade() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ArcadeAttraction | 'new' | null>(null);

  const { data: attractions = [], isLoading } = useQuery({
    queryKey: ['arcade'],
    queryFn: arcadeApi.list,
  });

  const removeMutation = useMutation({
    mutationFn: arcadeApi.remove,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['arcade'] }),
  });

  return (
    <PageShell
      title="Arcade"
      accent="attractions"
      subtitle="Billard, baby-foot, bornes à jetons... la liste affichée sur l'onglet Arcade de /tablet-menu"
      actions={
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          Nouvelle attraction
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent-orange/30 border-t-accent-orange rounded-full animate-spin" />
        </div>
      ) : attractions.length === 0 ? (
        <Card className="p-12 text-center">
          <Gamepad2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Aucune attraction pour le moment.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {attractions.map((attraction) => (
            <AttractionCard
              key={attraction.id}
              attraction={attraction}
              onEdit={() => setEditing(attraction)}
              onRemove={() => removeMutation.mutate(attraction.id)}
              isRemoving={removeMutation.isPending && removeMutation.variables === attraction.id}
            />
          ))}
        </div>
      )}

      {editing && (
        <AttractionFormModal
          attraction={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </PageShell>
  );
}

function AttractionCard({
  attraction,
  onEdit,
  onRemove,
  isRemoving,
}: {
  attraction: ArcadeAttraction;
  onEdit: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => arcadeApi.uploadPhoto(attraction.id, file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['arcade'] }),
  });
  const removePhotoMutation = useMutation({
    mutationFn: () => arcadeApi.removePhoto(attraction.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['arcade'] }),
  });

  return (
    <Card padding="none" className="overflow-hidden flex flex-col">
      <div className="relative h-40 bg-dark-900 flex items-center justify-center">
        {attraction.photoUrl ? (
          <img
            src={attraction.photoUrl}
            alt={attraction.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageOff className="h-8 w-8 text-gray-600" />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            e.target.value = '';
          }}
        />
        <div className="absolute right-2 top-2 flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            isLoading={uploadMutation.isPending}
            title={attraction.photoUrl ? 'Remplacer la photo' : 'Ajouter une photo'}
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
          {attraction.photoUrl && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => removePhotoMutation.mutate()}
              isLoading={removePhotoMutation.isPending}
              title="Retirer la photo"
            >
              <ImageMinus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-base font-semibold text-white">{attraction.name}</h3>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} title="Modifier">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              isLoading={isRemoving}
              title="Supprimer"
              className="text-accent-red hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {(attraction.players || attraction.kind) && (
          <p className="text-sm text-gray-400">
            {[attraction.players, attraction.kind].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </Card>
  );
}

function AttractionFormModal({
  attraction,
  onClose,
}: {
  attraction: ArcadeAttraction | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState<ArcadeAttractionInput>(
    attraction
      ? { name: attraction.name, players: attraction.players ?? '', kind: attraction.kind ?? '' }
      : DEFAULT_INPUT,
  );

  const mutation = useMutation({
    mutationFn: () => {
      const payload: ArcadeAttractionInput = {
        name: input.name.trim(),
        players: input.players?.trim() || undefined,
        kind: input.kind?.trim() || undefined,
      };
      return attraction ? arcadeApi.update(attraction.id, payload) : arcadeApi.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arcade'] });
      onClose();
    },
  });

  const canSubmit = input.name.trim().length > 0;

  return (
    <Modal title={attraction ? "Modifier l'attraction" : 'Nouvelle attraction'} onClose={onClose}>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div>
          <Label htmlFor="arcade-name">Nom</Label>
          <Input
            id="arcade-name"
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
            placeholder="ex: Baby-foot"
            required
          />
        </div>

        <div>
          <Label htmlFor="arcade-players">Joueurs</Label>
          <Input
            id="arcade-players"
            value={input.players}
            onChange={(e) => setInput({ ...input, players: e.target.value })}
            placeholder="ex: 2 à 4 joueurs"
          />
        </div>

        <div>
          <Label htmlFor="arcade-kind">Type</Label>
          <Input
            id="arcade-kind"
            value={input.kind}
            onChange={(e) => setInput({ ...input, kind: e.target.value })}
            placeholder="ex: Compétition, Borne à jetons..."
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-dark-600 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            isLoading={mutation.isPending}
          >
            {attraction ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
