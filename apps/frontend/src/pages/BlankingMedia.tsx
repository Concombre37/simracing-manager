import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stationsApi } from '../services/stations';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { MediaItem } from '../components/BlankingMediaModal';
import {
  Upload,
  Monitor,
  CheckSquare,
  Square,
  AlertCircle,
  CheckCircle,
  Rocket,
  Award,
} from 'lucide-react';

export function BlankingMedia() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    failed: { stationId: string; reason: string }[];
  } | null>(null);

  const { data: stations, isLoading } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ stationIds, file }: { stationIds: string[]; file: File }) =>
      stationsApi.uploadBlankingMediaBulk(stationIds, file),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });

  const toggleStation = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === simulatorStations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(simulatorStations.map((s) => s.id)));
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    uploadMutation.mutate({ stationIds: Array.from(selectedIds), file });
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    handleFile(files[0]);
  };

  // Admin (hosting-only) stations never run the AC client and never show
  // blanking at all (BlankingManager.setEnabled(role !== ADMIN) on the
  // agent) — listing them here as a send target is misleading, nothing
  // would ever actually display the media.
  const simulatorStations = stations?.filter((s) => s.role !== 'admin') ?? [];
  const onlineStations = simulatorStations.filter((s) => s.status !== 'offline');
  const offlineStations = simulatorStations.filter((s) => s.status === 'offline');

  return (
    <PageShell
      title="Écrans"
      accent="de blanking"
      subtitle="Lancement et résultats sont communs à tous les postes ; l'écran d'attente se configure poste par poste ci-dessous"
    >
      <GlobalMediaSection
        category="launching"
        icon={Rocket}
        title="Images de lancement"
        description="Communes à tous les postes — une image est choisie au hasard à chaque lancement de session. Sans image, l'écran garde son fond par défaut."
        imagesOnly
      />

      <GlobalMediaSection
        category="results"
        icon={Award}
        title="Logo écran de fin"
        description="Commun à tous les postes — un seul logo, affiché en incrustation sur l'écran de résultats. Un nouvel envoi remplace l'ancien."
        imagesOnly
        maxItems={1}
      />

      {isLoading && <p className="text-gray-500">Chargement des postes...</p>}

      {!isLoading && stations && (
        <>
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Monitor className="w-5 h-5 text-accent-orange" />
                Sélection des postes ({selectedIds.size}/{simulatorStations.length})
              </h3>
              <Button variant="secondary" size="sm" onClick={toggleAll}>
                {selectedIds.size === simulatorStations.length ? (
                  <>
                    <Square className="w-4 h-4" />
                    Tout désélectionner
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-4 h-4" />
                    Tout sélectionner
                  </>
                )}
              </Button>
            </div>

            {simulatorStations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-10 text-center">
                <AlertCircle className="mx-auto mb-2 h-10 w-10 text-gray-600" />
                <p className="text-gray-400">Aucun poste simulateur.</p>
                <p className="mt-1 text-sm text-gray-600">
                  Seuls les postes de type "Simulateur" affichent un écran d'attente — les postes
                  admin (hébergement) n'en ont pas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...onlineStations, ...offlineStations].map((station) => (
                  <label
                    key={station.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.has(station.id)
                        ? 'bg-accent-orange/10 border-accent-orange'
                        : 'bg-dark-900 border-dark-600 hover:border-dark-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-dark-500 text-accent-orange focus:ring-accent-orange bg-dark-800"
                      checked={selectedIds.has(station.id)}
                      onChange={() => toggleStation(station.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{station.name}</p>
                      <p className="text-xs text-gray-500 font-mono truncate">
                        {station.stationId}
                      </p>
                    </div>
                    <StatusBadge status={station.status} />
                  </label>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-accent-orange" />
              Fichier à envoyer
            </h3>

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
              } ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-300">
                Glisse-dépose une image ou vidéo ici, ou clique pour sélectionner
              </p>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG, WEBP, MP4, WEBM — max 100 Mo</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            <Button
              variant="primary"
              className="w-full"
              isLoading={uploadMutation.isPending}
              disabled={selectedIds.size === 0 || uploadMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              Envoyer vers {selectedIds.size} poste{selectedIds.size > 1 ? 's' : ''}
            </Button>

            {result && (
              <div
                className={`p-4 rounded-lg border ${
                  result.failed.length === 0
                    ? 'bg-green-900/20 border-green-800 text-green-300'
                    : 'bg-yellow-900/20 border-yellow-800 text-yellow-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  {result.failed.length === 0 ? (
                    <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">
                      {result.success} envoi{result.success > 1 ? 's' : ''} réussi
                      {result.success > 1 ? 's' : ''}
                      {result.failed.length > 0 &&
                        `, ${result.failed.length} échec${result.failed.length > 1 ? 's' : ''}`}
                    </p>
                    {result.failed.length > 0 && (
                      <ul className="mt-2 text-sm space-y-1">
                        {result.failed.map((f) => (
                          <li key={f.stationId}>
                            • {f.stationId} : {f.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}

function GlobalMediaSection({
  category,
  icon: Icon,
  title,
  description,
  imagesOnly,
  maxItems,
}: {
  category: 'launching' | 'results';
  icon: typeof Rocket;
  title: string;
  description: string;
  imagesOnly?: boolean;
  maxItems?: number;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const queryKey = ['blanking-media', 'global', category];

  const { data: media, isLoading } = useQuery({
    queryKey,
    queryFn: () => stationsApi.getGlobalBlankingMedia(category),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => stationsApi.uploadGlobalBlankingMedia(file, category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => stationsApi.deleteGlobalBlankingMedia(mediaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const reorderMutation = useMutation({
    mutationFn: (mediaIds: string[]) => stationsApi.reorderGlobalBlankingMedia(mediaIds, category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const toUpload = maxItems === 1 ? Array.from(files).slice(-1) : Array.from(files);
    toUpload.forEach((file) => uploadMutation.mutate(file));
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

  const atCapacity = maxItems !== undefined && (media?.length ?? 0) >= maxItems;

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Icon className="w-5 h-5 text-accent-orange" />
          {title}
        </h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>

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
          {atCapacity
            ? 'Glisse-dépose une image ici pour remplacer celle en place'
            : 'Glisse-dépose des images ici, ou clique pour sélectionner'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {imagesOnly ? 'PNG, JPG, WEBP' : 'PNG, JPG, WEBP, MP4, WEBM'} — max 100 Mo
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple={maxItems !== 1}
          accept={
            imagesOnly
              ? 'image/png,image/jpeg,image/jpg,image/webp'
              : 'image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm'
          }
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {isLoading && <p className="text-gray-500">Chargement...</p>}

      {media && media.length === 0 && !isLoading && (
        <p className="text-center text-gray-500 text-sm">Aucun média pour l'instant.</p>
      )}

      {media && media.length > 0 && (
        <div className="space-y-2">
          {media.map((m, index) => (
            <MediaItem
              key={m.id}
              media={m}
              index={index}
              total={media.length}
              onMove={maxItems === 1 ? undefined : moveItem}
              onDelete={() => deleteMutation.mutate(m.id)}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === m.id}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'online':
      return <Badge variant="green">En ligne</Badge>;
    case 'in_game':
      return <Badge variant="blue">En jeu</Badge>;
    case 'updating':
      return <Badge variant="purple">Mise à jour</Badge>;
    case 'offline':
    default:
      return <Badge variant="gray">Hors ligne</Badge>;
  }
}
