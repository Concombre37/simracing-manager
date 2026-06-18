import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { stationsApi, type BlankingMediaFile, type Station } from '../services/stations';
import { Upload, Trash2, ChevronUp, ChevronDown, ImageIcon, Film, X } from 'lucide-react';

interface BlankingMediaModalProps {
  station: Station;
  onClose: () => void;
}

export function BlankingMediaModal({ station, onClose }: BlankingMediaModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: media, isLoading } = useQuery({
    queryKey: ['blanking-media', station.id],
    queryFn: () => stationsApi.getBlankingMedia(station.id),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => stationsApi.uploadBlankingMedia(station.id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blanking-media', station.id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => stationsApi.deleteBlankingMedia(station.id, mediaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blanking-media', station.id] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (mediaIds: string[]) => stationsApi.reorderBlankingMedia(station.id, mediaIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blanking-media', station.id] }),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => uploadMutation.mutate(file));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    if (!media) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= media.length) return;
    const reordered = [...media];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, item);
    reorderMutation.mutate(reordered.map((m) => m.id));
  };

  return (
    <Modal title={`Écran d'attente — ${station.name}`} onClose={onClose} size="lg">
      <div className="space-y-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-accent-orange bg-accent-orange/10'
              : 'border-dark-600 hover:border-dark-500 bg-dark-900'
          }`}
        >
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-300">
            Glisse-dépose des images ou vidéos ici, ou clique pour sélectionner
          </p>
          <p className="text-xs text-gray-500 mt-1">PNG, JPG, WEBP, MP4, WEBM — max 100 Mo</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {isLoading && <p className="text-gray-500">Chargement...</p>}

        {media && media.length === 0 && !isLoading && (
          <p className="text-center text-gray-500 text-sm">
            Aucun média pour l'instant. L'écran d'attente restera noir par défaut.
          </p>
        )}

        {media && media.length > 0 && (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {media.map((m, index) => (
              <MediaItem
                key={m.id}
                media={m}
                index={index}
                total={media.length}
                onMove={moveItem}
                onDelete={() => deleteMutation.mutate(m.id)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === m.id}
              />
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-dark-600">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MediaItem({
  media,
  index,
  total,
  onMove,
  onDelete,
  isDeleting,
}: {
  media: BlankingMediaFile;
  index: number;
  total: number;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const isImage = media.mimeType.startsWith('image/');
  const isVideo = media.mimeType.startsWith('video/');

  return (
    <>
      <div className="flex items-center gap-3 p-3 bg-dark-900 rounded-lg border border-dark-600">
        <div
          className="w-16 h-16 rounded-lg bg-dark-800 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
          onClick={() => setPreviewOpen(true)}
        >
          {isImage ? (
            <img
              src={media.downloadUrl}
              alt={media.filename}
              className="w-full h-full object-cover"
            />
          ) : isVideo ? (
            <Film className="w-6 h-6 text-gray-400" />
          ) : (
            <ImageIcon className="w-6 h-6 text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{media.filename}</p>
          <p className="text-xs text-gray-500">
            {isImage ? 'Image' : isVideo ? 'Vidéo' : media.mimeType} ·{' '}
            {(media.sizeBytes / 1024 / 1024).toFixed(2)} Mo
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg disabled:opacity-30"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg disabled:opacity-30"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg disabled:opacity-30"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <button
            onClick={() => setPreviewOpen(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="w-8 h-8" />
          </button>
          {isImage ? (
            <img
              src={media.downloadUrl}
              alt={media.filename}
              className="max-w-full max-h-full rounded-lg"
            />
          ) : (
            <video
              src={media.downloadUrl}
              className="max-w-full max-h-full rounded-lg"
              controls
              autoPlay
              muted
            />
          )}
        </div>
      )}
    </>
  );
}
