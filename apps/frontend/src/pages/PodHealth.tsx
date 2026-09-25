import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Download,
  Package,
  RefreshCw,
  ScanLine,
} from 'lucide-react';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { stationsApi, type Station, type StationDiagnostics } from '../services/stations';
import { sortStations } from '../utils/stations';

type ScanResult = { report?: StationDiagnostics; error?: string };

function errorMessage(error: unknown): string {
  const response = error as { response?: { data?: { message?: string } }; message?: string };
  return response.response?.data?.message ?? response.message ?? 'Diagnostic indisponible';
}

function statusColor(status: string): string {
  if (status === 'ok') return 'text-emerald-400';
  if (status === 'missing') return 'text-red-400';
  if (status === 'warning') return 'text-amber-400';
  return 'text-gray-400';
}

export function PodHealth() {
  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 10000,
  });
  const pods = useMemo(
    () => sortStations(stations.filter((station) => station.role === 'simulator')),
    [stations],
  );
  const [results, setResults] = useState<Record<string, ScanResult>>({});
  const [scanning, setScanning] = useState<string[]>([]);
  const [action, setAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function scan(station: Station): Promise<void> {
    if (station.status === 'offline') return;
    setScanning((current) => [...current, station.id]);
    try {
      const report = await stationsApi.diagnostics(station.id);
      setResults((current) => ({ ...current, [station.id]: { report } }));
    } catch (error) {
      setResults((current) => ({ ...current, [station.id]: { error: errorMessage(error) } }));
    } finally {
      setScanning((current) => current.filter((id) => id !== station.id));
    }
  }

  async function scanAll(): Promise<void> {
    await Promise.allSettled(pods.filter((pod) => pod.status !== 'offline').map(scan));
  }

  async function repair(station: Station, kind: 'agent' | 'content'): Promise<void> {
    setAction(`${kind}:${station.id}`);
    setNotice(null);
    try {
      if (kind === 'agent') await stationsApi.updateAgent(station.id);
      else await stationsApi.syncContent(station.id);
      setNotice(
        `${station.name} : ${kind === 'agent' ? 'mise à jour de l’agent' : 'synchronisation des mods'} demandée. Relancez le diagnostic après l’opération.`,
      );
    } catch (error) {
      setNotice(`${station.name} : ${errorMessage(error)}`);
    } finally {
      setAction(null);
    }
  }

  const online = pods.filter((pod) => pod.status !== 'offline').length;
  const issues = Object.values(results).reduce(
    (count, result) =>
      count +
      (result.report?.checks.filter(
        (check) => check.status === 'missing' || check.status === 'warning',
      ).length ?? 0),
    0,
  );
  const referencePod = [...pods]
    .filter((pod) => (results[pod.id]?.report?.drivers.length ?? 0) > 0)
    .sort((a, b) =>
      (results[a.id].report?.scannedAt ?? '').localeCompare(results[b.id].report?.scannedAt ?? ''),
    )[0];
  const referenceReport = referencePod && results[referencePod.id]?.report;

  function driverDifferences(report: StationDiagnostics): string[] {
    if (!referenceReport || report.stationId === referenceReport.stationId) return [];
    const installed = new Map(
      report.drivers.map((driver) => [driver.name.toLowerCase(), driver.version]),
    );
    const missingOrDifferent = referenceReport.drivers.flatMap((driver) => {
      const version = installed.get(driver.name.toLowerCase());
      if (!version) return [`${driver.name} absent`];
      if (version !== driver.version)
        return [`${driver.name} : ${version} (référence ${driver.version})`];
      return [];
    });
    const expected = new Set(referenceReport.drivers.map((driver) => driver.name.toLowerCase()));
    return [
      ...missingOrDifferent,
      ...report.drivers
        .filter((driver) => !expected.has(driver.name.toLowerCase()))
        .map((driver) => `${driver.name} présent uniquement ici`),
    ];
  }

  return (
    <PageShell
      title="Santé"
      accent="des PODs"
      subtitle="Diagnostic local des prérequis, pilotes installés et composants Assetto Corsa."
      actions={
        <Button
          variant="primary"
          onClick={() => void scanAll()}
          disabled={scanning.length > 0 || online === 0}
        >
          <ScanLine className="h-4 w-4" /> Diagnostiquer les PODs en ligne
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card padding="sm">
          <p className="text-xs uppercase tracking-wider text-gray-400">PODs en ligne</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {online} / {pods.length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs uppercase tracking-wider text-gray-400">Diagnostics reçus</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {Object.values(results).filter((result) => result.report).length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs uppercase tracking-wider text-gray-400">Points à vérifier</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{issues}</p>
        </Card>
      </div>
      <Card padding="sm" className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
        <CircleHelp className="h-5 w-5 shrink-0 text-sky-400" />
        <span>
          Les versions de pilotes affichées sont celles installées. Une mise à jour éventuelle se
          vérifie auprès du fabricant du volant ou de la carte graphique. La synchronisation des
          mods utilise le catalogue existant.
        </span>
        <Link
          to="/mods"
          className="inline-flex items-center gap-1 font-semibold text-accent-orange hover:underline"
        >
          <Package className="h-4 w-4" /> Voir les mods
        </Link>
      </Card>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
        >
          {notice}
        </p>
      )}
      {isLoading && <p className="text-gray-400">Chargement des PODs…</p>}
      <div className="space-y-4">
        {pods.map((pod) => {
          const result = results[pod.id];
          const report = result?.report;
          const differences = report ? driverDifferences(report) : [];
          const busy = scanning.includes(pod.id);
          return (
            <Card key={pod.id} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {pod.name}{' '}
                    <span className="text-xs font-normal text-gray-500">{pod.stationId}</span>
                  </h2>
                  <p className="text-xs text-gray-400">
                    {pod.status === 'offline'
                      ? 'Hors ligne'
                      : `En ligne · agent ${pod.version ?? 'version inconnue'}`}
                    {report && ` · scan ${new Date(report.scannedAt).toLocaleString('fr-FR')}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => void scan(pod)}
                    disabled={pod.status === 'offline' || busy}
                    isLoading={busy}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Scanner
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void repair(pod, 'agent')}
                    disabled={pod.status === 'offline' || !!action}
                    isLoading={action === `agent:${pod.id}`}
                  >
                    <Download className="h-3.5 w-3.5" /> Mettre à jour l’agent
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void repair(pod, 'content')}
                    disabled={pod.status === 'offline' || !!action}
                    isLoading={action === `content:${pod.id}`}
                  >
                    <Package className="h-3.5 w-3.5" /> Synchroniser les mods
                  </Button>
                </div>
              </div>
              {result?.error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
                >
                  {result.error}
                </p>
              )}
              {report && (
                <>
                  {referencePod && report.stationId === referenceReport?.stationId && (
                    <p className="text-xs text-sky-300">
                      POD de référence pour comparer les versions des pilotes.
                    </p>
                  )}
                  {differences.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                      <p className="font-semibold">Écarts de pilotes avec {referencePod?.name}</p>
                      <ul className="mt-1 list-inside list-disc">
                        {differences.map((difference) => (
                          <li key={difference}>{difference}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {report.checks.map((check) => (
                      <div
                        key={check.id}
                        className="rounded-lg border border-dark-600 bg-dark-900/60 p-3"
                      >
                        <div
                          className={`flex items-center gap-2 text-sm font-semibold ${statusColor(check.status)}`}
                        >
                          {check.status === 'ok' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : check.status === 'unknown' ? (
                            <CircleHelp className="h-4 w-4" />
                          ) : (
                            <AlertTriangle className="h-4 w-4" />
                          )}
                          {check.label}
                        </div>
                        <p className="mt-1 break-all text-xs text-gray-400">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                  <details className="rounded-lg border border-dark-600 bg-dark-900/40 p-3 text-sm">
                    <summary className="cursor-pointer font-semibold text-gray-200">
                      Pilotes détectés ({report.drivers.length})
                    </summary>
                    {report.drivers.length === 0 ? (
                      <p className="mt-2 text-gray-400">Aucun pilote ciblé détecté.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {report.drivers.map((driver, index) => (
                          <li
                            key={`${driver.name}:${index}`}
                            className="flex flex-wrap justify-between gap-2 border-b border-dark-700 pb-2 text-gray-300"
                          >
                            <span>{driver.name}</span>
                            <span className="text-gray-400">
                              {driver.provider} · {driver.version}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
