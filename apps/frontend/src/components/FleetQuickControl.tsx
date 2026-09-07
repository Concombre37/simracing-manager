import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Eye, EyeOff, Power, PowerOff, RotateCw, Wifi, WifiOff } from 'lucide-react';
import { bulkActionsApi, type BulkActionResult } from '../services/bulkActions';
import type { Station } from '../services/stations';

type ActionName = 'wake' | 'restart' | 'shutdown' | 'blanking-hide' | 'blanking-show';
type Feedback = { type: 'success' | 'error'; message: string } | null;

function isReachable(station: Station) {
  return station.status !== 'offline';
}

export function FleetQuickControl({ stations }: { stations: Station[] }) {
  const queryClient = useQueryClient();
  const pods = useMemo(
    () =>
      stations
        .filter((station) => station.role === 'simulator')
        .sort(
          (a, b) =>
            Number(isReachable(b)) - Number(isReachable(a)) ||
            a.name.localeCompare(b.name, 'fr', { numeric: true }),
        ),
    [stations],
  );
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [pending, setPending] = useState<ActionName | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    const podIds = new Set(pods.map((pod) => pod.id));
    setSelected((current) => {
      if (current === null) return pods.length > 0 ? new Set(podIds) : current;
      const sanitized = new Set(Array.from(current).filter((id) => podIds.has(id)));
      return sanitized.size === current.size ? current : sanitized;
    });
  }, [pods]);

  const selectedPods = pods.filter((pod) => selected?.has(pod.id));
  const onlineTargets = selectedPods.filter(isReachable);
  const offlineTargets = selectedPods.filter((pod) => !isReachable(pod));

  function select(filter: 'all' | 'online' | 'offline' | 'none') {
    setSelected(
      new Set(
        pods
          .filter((pod) => {
            if (filter === 'all') return true;
            if (filter === 'online') return isReachable(pod);
            if (filter === 'offline') return !isReachable(pod);
            return false;
          })
          .map((pod) => pod.id),
      ),
    );
    setFeedback(null);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFeedback(null);
  }

  async function runAction(
    action: ActionName,
    label: string,
    targets: Station[],
    call: (ids: string[]) => Promise<BulkActionResult>,
    confirmMessage?: string,
  ) {
    if (targets.length === 0 || pending) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setPending(action);
    setFeedback(null);
    try {
      const result = await call(targets.map((pod) => pod.id));
      const names = new Map(pods.map((pod) => [pod.id, pod.name]));
      if (result.failed.length === 0) {
        setFeedback({
          type: 'success',
          message: `${label} envoyé à ${result.succeeded.length} POD${result.succeeded.length > 1 ? 's' : ''}.`,
        });
      } else {
        const details = result.failed
          .map(({ stationId, error }) => `${names.get(stationId) ?? stationId} : ${error}`)
          .join(' · ');
        setFeedback({
          type: 'error',
          message: `${label} : ${result.succeeded.length} réussi(s), ${result.failed.length} échec(s). ${details}`,
        });
      }

      if (action === 'blanking-hide' || action === 'blanking-show') {
        const succeeded = new Set(result.succeeded);
        queryClient.setQueryData<Station[]>(['stations'], (current) =>
          current?.map((station) =>
            succeeded.has(station.id)
              ? { ...station, blankingActive: action === 'blanking-show' }
              : station,
          ),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
    } catch (error) {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      setFeedback({
        type: 'error',
        message:
          apiError.response?.data?.message ?? apiError.message ?? `Échec de l'action ${label}`,
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-racing-cyan/30 bg-gradient-to-br from-racing-blue/[0.14] via-dark-900/80 to-dark-950 p-4 shadow-[0_0_40px_rgba(0,120,255,0.12)] sm:p-6">
      <span className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-racing-cyan/70 to-transparent" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Power className="h-4 w-4 text-racing-cyan" />
            <h2 className="font-hud text-xl font-bold tracking-wide text-white">Contrôle rapide</h2>
          </div>
          <p className="mt-1 font-hud-mono text-[11px] text-gray-500">
            {selectedPods.length}/{pods.length} POD sélectionné{selectedPods.length > 1 ? 's' : ''}{' '}
            · les administrateurs sont exclus
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterButton
            active={selectedPods.length === pods.length && pods.length > 0}
            onClick={() => select('all')}
          >
            Tous
          </FilterButton>
          <FilterButton
            active={selectedPods.length > 0 && selectedPods.every(isReachable)}
            onClick={() => select('online')}
          >
            <Wifi className="h-3 w-3" /> En ligne
          </FilterButton>
          <FilterButton
            active={selectedPods.length > 0 && selectedPods.every((pod) => !isReachable(pod))}
            onClick={() => select('offline')}
          >
            <WifiOff className="h-3 w-3" /> Hors ligne
          </FilterButton>
          <FilterButton active={selectedPods.length === 0} onClick={() => select('none')}>
            Aucun
          </FilterButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {pods.map((pod) => {
          const checked = selected?.has(pod.id) ?? false;
          const online = isReachable(pod);
          return (
            <button
              key={pod.id}
              type="button"
              onClick={() => toggle(pod.id)}
              aria-pressed={checked}
              className={`group relative min-w-0 rounded-lg border px-3 py-2.5 text-left transition-all ${
                checked
                  ? 'border-racing-cyan/55 bg-racing-cyan/10 shadow-[inset_0_0_18px_rgba(0,194,255,0.06)]'
                  : 'border-white/[0.07] bg-dark-900/55 opacity-60 hover:border-white/20 hover:opacity-90'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 flex-none rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_8px_#24d17e]' : 'bg-orange-400'}`}
                />
                <span className="min-w-0 flex-1 truncate font-hud text-sm font-bold text-white">
                  {pod.name}
                </span>
                <span
                  className={`grid h-4 w-4 flex-none place-items-center rounded border ${checked ? 'border-racing-cyan bg-racing-cyan text-dark-950' : 'border-gray-600'}`}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 font-hud-mono text-[10px]">
                <span className={online ? 'text-emerald-400' : 'text-orange-400'}>
                  {pod.status === 'in_game'
                    ? 'En jeu'
                    : pod.status === 'updating'
                      ? 'Mise à jour'
                      : online
                        ? 'En ligne'
                        : 'Hors ligne'}
                </span>
                {online && (
                  <span className={pod.blankingActive ? 'text-purple-300' : 'text-gray-600'}>
                    {pod.blankingActive ? 'Blanking affiché' : 'Blanking masqué'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {pods.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-white/10 py-7 text-center text-sm text-gray-500">
          Aucun POD enregistré.
        </div>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid grid-cols-3 gap-2">
          <ActionButton
            icon={Power}
            label="Allumer"
            count={offlineTargets.length}
            tone="success"
            loading={pending === 'wake'}
            disabled={pending !== null || offlineTargets.length === 0}
            onClick={() => runAction('wake', 'Allumage', offlineTargets, bulkActionsApi.wake)}
          />
          <ActionButton
            icon={RotateCw}
            label="Redémarrer"
            count={onlineTargets.length}
            loading={pending === 'restart'}
            disabled={pending !== null || onlineTargets.length === 0}
            onClick={() =>
              runAction(
                'restart',
                'Redémarrage',
                onlineTargets,
                bulkActionsApi.restart,
                `Redémarrer ${onlineTargets.length} POD${onlineTargets.length > 1 ? 's' : ''} ? Les sessions en cours seront interrompues.`,
              )
            }
          />
          <ActionButton
            icon={PowerOff}
            label="Éteindre"
            count={onlineTargets.length}
            tone="danger"
            loading={pending === 'shutdown'}
            disabled={pending !== null || onlineTargets.length === 0}
            onClick={() =>
              runAction(
                'shutdown',
                'Extinction',
                onlineTargets,
                bulkActionsApi.shutdown,
                `Éteindre ${onlineTargets.length} POD${onlineTargets.length > 1 ? 's' : ''} ? Les sessions en cours seront interrompues.`,
              )
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <ActionButton
            icon={EyeOff}
            label="Masquer blanking"
            count={onlineTargets.length}
            loading={pending === 'blanking-hide'}
            disabled={pending !== null || onlineTargets.length === 0}
            onClick={() =>
              runAction('blanking-hide', 'Masquage', onlineTargets, bulkActionsApi.blankingHide)
            }
          />
          <ActionButton
            icon={Eye}
            label="Afficher blanking"
            count={onlineTargets.length}
            loading={pending === 'blanking-show'}
            disabled={pending !== null || onlineTargets.length === 0}
            onClick={() =>
              runAction('blanking-show', 'Affichage', onlineTargets, bulkActionsApi.blankingShow)
            }
          />
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${feedback.type === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}
        >
          {feedback.message}
        </div>
      )}
    </section>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-hud text-xs font-bold transition-colors ${active ? 'border-racing-cyan/50 bg-racing-cyan/15 text-sky-200' : 'border-white/10 bg-dark-900/50 text-gray-400 hover:border-white/20 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  count,
  tone = 'neutral',
  loading,
  disabled,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  tone?: 'neutral' | 'success' | 'danger';
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tones = {
    neutral:
      'border-racing-cyan/25 bg-racing-cyan/[0.07] text-sky-100 hover:border-racing-cyan/50 hover:bg-racing-cyan/15',
    success:
      'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200 hover:border-emerald-400/50 hover:bg-emerald-500/15',
    danger:
      'border-red-500/25 bg-red-500/[0.08] text-red-200 hover:border-red-400/50 hover:bg-red-500/15',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-16 min-w-0 items-center justify-center gap-2 rounded-lg border px-2 font-hud font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 ${tones[tone]}`}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon className="h-4 w-4 flex-none" />
      )}
      <span className="truncate text-xs sm:text-sm">{label}</span>
      <span className="rounded bg-black/20 px-1.5 py-0.5 font-hud-mono text-[10px]">{count}</span>
    </button>
  );
}
