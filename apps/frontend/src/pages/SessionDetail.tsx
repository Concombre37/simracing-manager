import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatCarName, formatTrackAcId, formatTrackName } from '@simracing/shared';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useContentLabelMap } from '../services/contentLabels';
import { sessionsApi, type SessionLap } from '../services/sessions';
import { formatDuration } from '../utils/time';
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  Clock,
  Disc,
  Flag,
  Gauge,
  ListOrdered,
  MapPin,
  User,
  XCircle,
} from 'lucide-react';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_VARIANT: Record<string, 'green' | 'red' | 'yellow' | 'gray'> = {
  finished: 'green',
  running: 'yellow',
  cancelled: 'red',
  pending: 'gray',
};

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const labelMap = useContentLabelMap();
  const [showRaw, setShowRaw] = useState(false);
  const { data: session, isLoading } = useQuery({
    queryKey: ['session-detail', id],
    queryFn: () => sessionsApi.getDetail(id!),
    enabled: !!id,
  });

  if (isLoading || !session) {
    return (
      <PageShell title="Session" subtitle="Détail complet">
        <Card className="flex items-center justify-center py-16 text-gray-500">
          {isLoading ? 'Chargement…' : 'Session introuvable.'}
        </Card>
      </PageShell>
    );
  }

  const trackName = session.track ? formatTrackName(undefined, session.track, labelMap) : '—';
  const carName = session.carAcId ? formatCarName(undefined, session.carAcId, labelMap) : '—';
  const driverName = session.driver.name?.trim() || 'Pilote inconnu';

  return (
    <PageShell
      title="Détail de session"
      subtitle={`${driverName} · ${carName}`}
      actions={
        <Link
          to="/sessions/history"
          className="flex items-center gap-2 rounded-lg border border-dark-600 px-3 py-2 text-sm text-gray-300 hover:border-racing-cyan/40 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Historique
        </Link>
      }
    >
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dark-700">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{driverName}</p>
                <p className="text-xs text-gray-500">
                  {session.station.name} · {formatDateTime(session.endedAt ?? session.createdAt)}
                </p>
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[session.status] ?? 'gray'}>{session.status}</Badge>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-dark-700 pt-5 sm:grid-cols-4">
            <InfoStat
              icon={MapPin}
              label="Circuit"
              value={trackName}
              sub={session.trackLayout ? formatTrackAcId(session.trackLayout) : undefined}
            />
            <InfoStat
              icon={Car}
              label="Voiture"
              value={carName}
              sub={session.carAcId ?? undefined}
            />
            <InfoStat
              icon={Clock}
              label="Durée"
              value={session.durationMinutes ? `${session.durationMinutes} min` : 'Illimité'}
            />
            <InfoStat
              icon={Gauge}
              label="Difficulté / boîte"
              value={[session.difficulty, session.gearbox].filter(Boolean).join(' · ') || '—'}
            />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Meilleur tour propre"
            value={formatDuration(session.summary.bestCleanLapMs)}
            highlight
          />
          <StatTile label="Tours totaux" value={String(session.summary.totalLaps)} />
          <StatTile label="Tours propres" value={String(session.summary.cleanLaps)} />
          <StatTile label="Tours coupés" value={String(session.summary.cutLaps)} />
        </div>

        <Card padding="none">
          <div className="flex items-center gap-2 border-b border-dark-700 px-5 py-4">
            <ListOrdered className="h-4 w-4 text-racing-cyan" />
            <h3 className="font-semibold text-white">Tous les tours</h3>
            <span className="text-xs text-gray-500">({session.laps.length})</span>
          </div>
          {session.laps.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">
              Aucun tour enregistré pour cette session.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-2.5 font-medium">Session</th>
                    <th className="px-3 py-2.5 font-medium">Tour</th>
                    <th className="px-3 py-2.5 font-medium">Temps</th>
                    <th className="px-3 py-2.5 font-medium">Secteurs</th>
                    <th className="px-3 py-2.5 font-medium">Pneu</th>
                    <th className="px-3 py-2.5 font-medium">Coupures</th>
                    <th className="px-5 py-2.5 font-medium">Valide</th>
                  </tr>
                </thead>
                <tbody>
                  {session.laps.map((lap: SessionLap, i: number) => (
                    <tr key={i} className="border-b border-dark-700/60 last:border-0">
                      <td className="px-5 py-2.5 text-gray-300">{lap.sessionType ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-400">
                        {lap.lapNumber !== null ? lap.lapNumber + 1 : '—'}
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono ${lap.valid ? 'text-white' : 'text-gray-600 line-through'}`}
                      >
                        {formatDuration(lap.timeMs)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">
                        {lap.sectors?.map((s) => formatDuration(s)).join(' · ') ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <Disc className="h-3 w-3" /> {lap.tyre ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400">{lap.cuts}</td>
                      <td className="px-5 py-2.5">
                        {lap.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding="none">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex w-full items-center gap-2 px-5 py-4 text-left"
          >
            <Flag className="h-4 w-4 text-gray-500" />
            <h3 className="font-semibold text-gray-300">JSON brut (race_out.json)</h3>
            <span className="ml-auto text-xs text-gray-600">
              {showRaw ? 'Masquer' : 'Afficher'}
            </span>
          </button>
          {showRaw && (
            <pre className="max-h-[420px] overflow-auto border-t border-dark-700 bg-dark-950/60 p-5 text-xs text-gray-400">
              {JSON.stringify(session.raw, null, 2)}
            </pre>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function InfoStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
      {sub && <p className="truncate text-[11px] text-gray-600">{sub}</p>}
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card padding="sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-bold ${highlight ? 'text-racing-cyan' : 'text-white'}`}
      >
        {value}
      </p>
    </Card>
  );
}
