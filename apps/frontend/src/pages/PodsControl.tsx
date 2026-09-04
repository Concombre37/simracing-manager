import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { stationsApi, type Station } from '../services/stations';
import { bulkActionsApi, type BulkActionResult } from '../services/bulkActions';
import { useSocket } from '../hooks/useSocket';
import { PageShell } from '../components/ui/PageShell';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Monitor,
  Power,
  PowerOff,
  RotateCw,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  CheckSquare,
  Square,
} from 'lucide-react';

type Feedback = { type: 'success' | 'error'; message: string } | null;

/** Page QOL demandée par l'utilisateur ("faciliter le QOL avec tous les
 * PODs") : actions groupées (allumer/éteindre/redémarrer/masquer les écrans
 * d'attente/synchroniser le contenu/mettre à jour l'agent) sur une
 * sélection de postes, plutôt que de répéter l'action un par un depuis
 * Paramètres. Réutilise entièrement le chemin d'action existant côté
 * backend (bulk-actions/), aucune nouvelle logique de commande. */
export function PodsControl() {
  const queryClient = useQueryClient();
  const socket = useSocket('/');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const {
    data: stations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });

  // Sélectionne tout le monde par défaut au premier chargement seulement —
  // ne jamais écraser une (dé)sélection déjà faite par l'utilisateur sur un
  // rafraîchissement suivant (poll 5s).
  useEffect(() => {
    if (stations && selected === null) {
      setSelected(new Set(stations.map((s) => s.id)));
    }
  }, [stations, selected]);

  useEffect(() => {
    if (!socket) return;
    const handler = ({
      stationId,
      status,
      blankingActive,
    }: {
      stationId: string;
      status: Station['status'];
      blankingActive: boolean;
    }) => {
      queryClient.setQueryData<Station[]>(['stations'], (old) =>
        old?.map((s) => (s.stationId === stationId ? { ...s, status, blankingActive } : s)),
      );
    };
    socket.on('station:updated', handler);
    return () => {
      socket.off('station:updated', handler);
    };
  }, [socket, queryClient]);

  const selectedIds = selected ? Array.from(selected) : [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(stations?.map((s) => s.id) ?? []));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function runBulk(
    action: string,
    label: string,
    fn: (ids: string[]) => Promise<BulkActionResult>,
    confirmMessage?: string,
  ) {
    if (selectedIds.length === 0) {
      setFeedback({ type: 'error', message: 'Sélectionnez au moins un poste.' });
      return;
    }
    if (confirmMessage && !confirm(confirmMessage)) return;

    setPendingAction(action);
    setFeedback(null);
    try {
      const result = await fn(selectedIds);
      const names = new Map(stations?.map((s) => [s.id, s.name]));
      if (result.failed.length === 0) {
        setFeedback({
          type: 'success',
          message: `${label} : ${result.succeeded.length} poste(s) traité(s) avec succès.`,
        });
      } else {
        const failedDetail = result.failed
          .map((f) => `${names.get(f.stationId) ?? f.stationId} (${f.error})`)
          .join(', ');
        setFeedback({
          type: 'error',
          message: `${label} : ${result.succeeded.length} ok, ${result.failed.length} échec(s) — ${failedDetail}`,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setFeedback({
        type: 'error',
        message: e.response?.data?.message ?? e.message ?? `Erreur lors de : ${label}`,
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <PageShell
      title="Contrôle"
      accent="de la flotte"
      subtitle="Actions groupées sur tous les postes — sélectionnez qui est concerné avant d'agir."
    >
      {feedback && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            feedback.type === 'success'
              ? 'bg-green-900/30 border-green-800 text-green-300'
              : 'bg-red-900/30 border-red-800 text-red-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {isLoading && <p className="text-gray-500">Chargement des postes...</p>}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
          Erreur lors du chargement des postes
        </div>
      )}

      <Card>
        <CardHeader
          title="Postes concernés"
          subtitle={`${selectedIds.length} / ${stations?.length ?? 0} sélectionné(s)`}
          action={
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                <CheckSquare className="w-4 h-4" />
                Tout sélectionner
              </Button>
              <Button variant="ghost" size="sm" onClick={selectNone}>
                <Square className="w-4 h-4" />
                Tout désélectionner
              </Button>
            </div>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {stations?.map((station) => {
            const isOnline = station.status === 'online' || station.status === 'in_game';
            const isChecked = selected?.has(station.id) ?? false;
            return (
              <label
                key={station.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isChecked
                    ? 'bg-accent-orange/10 border-accent-orange/40'
                    : 'bg-dark-700/50 border-dark-600 hover:border-dark-500'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(station.id)}
                  className="w-4 h-4 accent-accent-orange"
                />
                <div className={`p-1.5 rounded ${isOnline ? 'bg-green-400/10' : 'bg-gray-400/10'}`}>
                  <Monitor className={`w-4 h-4 ${isOnline ? 'text-green-400' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{station.name}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{station.stationId}</p>
                </div>
                <Badge variant={station.role === 'admin' ? 'purple' : 'blue'}>
                  {station.role === 'admin' ? 'Admin' : 'POD'}
                </Badge>
              </label>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="Alimentation"
            subtitle="Nécessite l'adresse MAC / un relais WoL sur le même sous-réseau pour allumer."
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="success"
              onClick={() => runBulk('wake', 'Allumage', bulkActionsApi.wake)}
              isLoading={pendingAction === 'wake'}
              disabled={pendingAction !== null}
            >
              <Power className="w-4 h-4" />
              Allumer tout
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runBulk(
                  'restart',
                  'Redémarrage',
                  bulkActionsApi.restart,
                  `Redémarrer ${selectedIds.length} poste(s) ? Toute session en cours sera interrompue.`,
                )
              }
              isLoading={pendingAction === 'restart'}
              disabled={pendingAction !== null}
            >
              <RotateCw className="w-4 h-4" />
              Redémarrer tout
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                runBulk(
                  'shutdown',
                  'Extinction',
                  bulkActionsApi.shutdown,
                  `Éteindre ${selectedIds.length} poste(s) ? Toute session en cours sera interrompue.`,
                )
              }
              isLoading={pendingAction === 'shutdown'}
              disabled={pendingAction !== null}
            >
              <PowerOff className="w-4 h-4" />
              Éteindre tout
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Écrans d'attente"
            subtitle="Masquer révèle immédiatement le bureau/jeu sous l'écran de blanking."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() =>
                runBulk('blanking-hide', 'Masquage des écrans', bulkActionsApi.blankingHide)
              }
              isLoading={pendingAction === 'blanking-hide'}
              disabled={pendingAction !== null}
            >
              <EyeOff className="w-4 h-4" />
              Masquer tout
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runBulk('blanking-show', 'Réaffichage des écrans', bulkActionsApi.blankingShow)
              }
              isLoading={pendingAction === 'blanking-show'}
              disabled={pendingAction !== null}
            >
              <Eye className="w-4 h-4" />
              Réafficher tout
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Maintenance"
            subtitle="Agent et contenu (voitures/circuits scannés)."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => runBulk('update-agent', 'Mise à jour', bulkActionsApi.updateAgent)}
              isLoading={pendingAction === 'update-agent'}
              disabled={pendingAction !== null}
            >
              <Download className="w-4 h-4" />
              Mettre à jour tout
            </Button>
            <Button
              variant="secondary"
              onClick={() => runBulk('sync-content', 'Synchronisation', bulkActionsApi.syncContent)}
              isLoading={pendingAction === 'sync-content'}
              disabled={pendingAction !== null}
            >
              <RefreshCw className="w-4 h-4" />
              Synchroniser tout
            </Button>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
