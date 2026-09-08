import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Flag, Radio, Server, Users, Wifi } from 'lucide-react';
import { spectatorApi } from '../services/spectator';

export function SpectatorScreen() {
  const { data, isError } = useQuery({
    queryKey: ['spectator-screen-state'],
    queryFn: spectatorApi.getPublicScreenState,
    refetchInterval: 3000,
  });

  useEffect(() => {
    document.title = 'SimRacing · Spectateur';
    return () => {
      document.title = 'SimRacing Manager';
    };
  }, []);

  const servers = data?.servers ?? [];
  const sessions = data?.sessions ?? [];
  const serverOccupancy = (serverId: string) =>
    sessions.filter((session) => session.serverId === serverId).length;

  return (
    <main className="min-h-screen overflow-auto bg-[#05070d] px-6 py-7 text-white sm:px-10 lg:px-14">
      <div className="mx-auto max-w-[1800px]">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              <Radio className="h-4 w-4" /> Diffusion en direct
            </div>
            <h1 className="font-hud text-[clamp(40px,6vw,82px)] font-black uppercase leading-none tracking-tight">
              Mode <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">spectateur</span>
            </h1>
            <p className="mt-3 font-mono text-sm text-slate-400">Suivi automatique de la flotte et des serveurs Assetto Corsa</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 font-mono text-xs text-emerald-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> LIVE · actualisation 3s
          </div>
        </header>

        {isError ? (
          <div className="mt-8 rounded-xl border border-red-400/30 bg-red-400/10 p-8 text-center font-mono text-sm text-red-200">
            Serveur momentanément indisponible — nouvelle tentative automatique…
          </div>
        ) : servers.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-16 text-center">
            <Activity className="mx-auto h-12 w-12 text-slate-600" />
            <h2 className="mt-4 font-hud text-2xl font-bold text-slate-200">En attente d’une course</h2>
            <p className="mt-2 font-mono text-sm text-slate-500">Les serveurs actifs apparaîtront automatiquement ici.</p>
          </div>
        ) : (
          <div className="mt-7 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
            {servers.map((server) => {
              const occupied = serverOccupancy(server.id);
              return (
                <article key={server.id} className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-blue-500/[0.12] to-slate-950/80 p-5 shadow-[0_0_35px_rgba(0,120,255,.08)]">
                  <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-400 to-cyan-300" />
                  <div className="flex items-start justify-between gap-3 pl-2">
                    <div><h2 className="font-hud text-2xl font-bold tracking-wide">{server.name}</h2><p className="mt-1 font-mono text-xs text-cyan-100/60">{server.stationName}{server.stationIp ? ` · ${server.stationIp}` : ''}</p></div>
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{server.status === 'running' ? 'EN COURS' : 'DÉMARRAGE'}</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2 pl-2 font-mono text-xs">
                    <Info icon={Flag} label="Circuit" value={`${server.track}${server.trackLayout ? ` · ${server.trackLayout}` : ''}`} />
                    <Info icon={Users} label="Pilotes" value={`${occupied} / ${server.maxClients}`} />
                  </div>
                  {server.raceFormatName && <p className="mt-4 pl-2 font-mono text-xs text-slate-400">Format · <span className="text-slate-200">{server.raceFormatName}</span></p>}
                  {sessions.filter((session) => session.serverId === server.id).length > 0 && <div className="mt-5 space-y-1.5 border-t border-white/10 pt-4">{sessions.filter((session) => session.serverId === server.id).map((session) => <div key={session.id} className="flex items-center justify-between gap-3 rounded bg-black/20 px-3 py-2 font-mono text-xs"><span className="truncate text-slate-200">{session.clientName || session.stationName}</span><span className="shrink-0 text-cyan-200">{session.carAcId || '—'}</span></div>)}</div>}
                </article>
              );
            })}
          </div>
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-white/10 pt-4 font-mono text-[11px] uppercase tracking-wider text-slate-600"><span className="flex items-center gap-2"><Server className="h-3.5 w-3.5" /> SimRacing Manager</span><span className="flex items-center gap-2"><Wifi className="h-3.5 w-3.5" /> Flux public lecture seule</span></footer>
      </div>
    </main>
  );
}

function Info({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="rounded border border-white/10 bg-black/20 p-2.5"><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500"><Icon className="h-3 w-3 text-cyan-300" />{label}</div><p className="mt-1 truncate text-slate-200">{value}</p></div>;
}
