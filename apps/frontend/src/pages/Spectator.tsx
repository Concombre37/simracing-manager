import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageTransition } from '../components/PageTransition';
import { dedicatedServersApi } from '../services/dedicatedServers';
import { sessionsApi } from '../services/sessions';
import { spectatorApi, type ScreenRecording } from '../services/spectator';
import { stationsApi } from '../services/stations';
import { useSocket } from '../hooks/useSocket';
import {
  Camera,
  CircleStop,
  Download,
  ExternalLink,
  Film,
  HardDrive,
  MonitorPlay,
  Play,
  Radio,
  Server,
  Trash2,
  Users,
  Wifi,
} from 'lucide-react';

const formatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function Spectator() {
  const queryClient = useQueryClient();
  const socket = useSocket('/');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [title, setTitle] = useState('Capture spectator');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);

  const servers = useQuery({
    queryKey: ['dedicated-servers'],
    queryFn: dedicatedServersApi.getAll,
    refetchInterval: 5000,
  });
  const sessions = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: sessionsApi.getActive,
    refetchInterval: 5000,
  });
  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 10000,
  });
  const recordings = useQuery({
    queryKey: ['spectator-recordings'],
    queryFn: spectatorApi.listRecordings,
  });

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    };
    socket.on('station:updated', refresh);
    socket.on('session:updated', refresh);
    return () => {
      socket.off('station:updated', refresh);
      socket.off('session:updated', refresh);
    };
  }, [socket, queryClient]);

  const uploadMutation = useMutation({
    mutationFn: ({ blob, duration }: { blob: Blob; duration: number }) =>
      spectatorApi.uploadRecording(blob, `spectator-${Date.now()}.webm`, title, duration),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['spectator-recordings'] }),
  });
  const deleteMutation = useMutation({
    mutationFn: spectatorApi.removeRecording,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['spectator-recordings'] }),
  });

  const activeServers = useMemo(
    () => (servers.data ?? []).filter((server) => server.status === 'running'),
    [servers.data],
  );
  const spectatorStations = useMemo(
    () => (stations.data ?? []).filter((station) => station.role === 'spectator'),
    [stations.data],
  );

  function startRecording() {
    setRecordingError(null);
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      setRecordingError('La capture écran n’est pas disponible dans ce navigateur. Utilise Chrome ou Edge.');
      return;
    }
    void navigator.mediaDevices
      .getDisplayMedia({ video: { frameRate: 30 }, audio: true })
      .then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onerror = () => setRecordingError('La capture écran a rencontré une erreur.');
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const duration = Math.max(0, (Date.now() - (startedAtRef.current ?? Date.now())) / 1000);
          const blob = new Blob(chunksRef.current, { type: mimeType });
          setIsRecording(false);
          setRecordingSeconds(0);
          if (blob.size === 0) {
            setRecordingError('La capture est vide.');
            return;
          }
          uploadMutation.mutate({ blob, duration });
        };
        recorderRef.current = recorder;
        startedAtRef.current = Date.now();
        setRecordingSeconds(0);
        setIsRecording(true);
        recorder.start(1000);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'NotAllowedError') {
          setRecordingError('Impossible de démarrer la capture écran.');
        }
      });
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  useEffect(() => {
    if (!isRecording) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-5">
          <div className="min-w-[260px] flex-1">
            <div className="mb-2 flex items-center gap-2 font-hud text-xs font-semibold uppercase tracking-[0.16em] text-racing-cyan">
              <Radio className="h-3.5 w-3.5" /> Centre de diffusion
            </div>
            <h1 className="font-hud text-[clamp(34px,4.4vw,48px)] font-bold leading-none text-white">
              Mode <span className="bg-gradient-to-r from-racing-blue to-racing-cyan bg-clip-text text-transparent">spectateur</span>
            </h1>
            <p className="mt-2 font-hud-mono text-xs text-gray-500">
              Suivre les courses, capturer l’écran et relire les moments importants depuis le Web.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-racing-cyan/20 bg-racing-cyan/5 px-3 py-2 text-xs text-sky-200">
            <Wifi className="h-4 w-4 text-racing-cyan" /> {spectatorStations.length} poste{spectatorStations.length > 1 ? 's' : ''} spectateur
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Server} label="Serveurs actifs" value={activeServers.length} />
          <Stat icon={Users} label="Pilotes en piste" value={sessions.data?.length ?? 0} />
          <Stat icon={Film} label="Rediffusions" value={recordings.data?.length ?? 0} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-xl border border-white/10 bg-dark-900/60 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-hud text-xl font-bold text-white">Serveurs et sessions</h2>
                <p className="mt-1 text-xs text-gray-500">Les cartes se mettent à jour automatiquement.</p>
              </div>
              <Link to="/en-cours/kiosk" className="flex items-center gap-1.5 rounded border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-racing-cyan/40 hover:text-white">
                <ExternalLink className="h-3.5 w-3.5" /> Vue TV
              </Link>
            </div>
            <div className="space-y-2">
              {activeServers.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-gray-500">Aucun serveur en cours.</p>}
              {activeServers.map((server) => {
                const occupants = sessions.data?.filter((session) => session.serverId === server.id).length ?? 0;
                return (
                  <div key={server.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                    <div className="grid h-9 w-9 place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><Server className="h-4 w-4" /></div>
                    <div className="min-w-[160px] flex-1"><p className="font-hud font-bold text-white">{server.name}</p><p className="font-hud-mono text-[11px] text-gray-500">{server.station.name} · {server.track}</p></div>
                    <span className="font-hud-mono text-xs text-emerald-300">{occupants}/{server.maxClients} pilotes</span>
                    <Link to={`/dedicated-servers/${server.id}/join`} className="rounded border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 hover:border-racing-cyan/40 hover:text-white">Détails</Link>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-racing-cyan/20 bg-gradient-to-br from-racing-blue/[0.12] to-dark-900/70 p-5">
            <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg border border-racing-cyan/30 bg-racing-cyan/10 text-racing-cyan"><MonitorPlay className="h-5 w-5" /></div><div><h2 className="font-hud text-xl font-bold text-white">Capture écran</h2><p className="mt-1 text-xs leading-5 text-gray-400">Sélectionne une fenêtre ou un écran. La vidéo est envoyée au serveur à l’arrêt pour être relue sur le Web.</p></div></div>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-5 h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-racing-cyan/50" placeholder="Titre de la rediffusion" />
            <button type="button" onClick={isRecording ? stopRecording : startRecording} disabled={uploadMutation.isPending} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 font-hud text-sm font-bold ${isRecording ? 'border border-red-400/40 bg-red-500/10 text-red-200' : 'bg-gradient-to-r from-racing-blue to-racing-cyan text-dark-950'}`}>
              {isRecording ? <><CircleStop className="h-4 w-4" /> Arrêter · {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}</> : <><Camera className="h-4 w-4" /> Choisir l’écran et enregistrer</>}
            </button>
            {uploadMutation.isPending && <p className="mt-2 text-center text-xs text-racing-cyan">Envoi de la vidéo…</p>}
            {recordingError && <p className="mt-2 text-xs text-red-300">{recordingError}</p>}
          </section>
        </div>

        <section className="rounded-xl border border-white/10 bg-dark-900/60 p-5">
          <div className="mb-4 flex items-center gap-2"><HardDrive className="h-4 w-4 text-racing-cyan" /><h2 className="font-hud text-xl font-bold text-white">Bibliothèque Web</h2></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(recordings.data ?? []).map((recording) => <RecordingCard key={recording.id} recording={recording} onDelete={() => deleteMutation.mutate(recording.id)} />)}
            {recordings.data?.length === 0 && <p className="col-span-full rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-gray-500">Aucune rediffusion enregistrée.</p>}
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return <div className="rounded-lg border border-white/10 bg-dark-900/60 px-4 py-3"><div className="flex items-center gap-2 text-xs text-gray-500"><Icon className="h-4 w-4 text-racing-cyan" />{label}</div><p className="mt-1 font-hud text-3xl font-bold text-white">{value}</p></div>;
}

function RecordingCard({ recording, onDelete }: { recording: ScreenRecording; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void spectatorApi.getRecordingBlob(recording.id).then((blob) => {
      if (active) {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recording.id]);

  async function download() {
    const blob = await spectatorApi.getRecordingBlob(recording.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = recording.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <article className="overflow-hidden rounded-lg border border-white/10 bg-black/20">{loading ? <div className="flex aspect-video items-center justify-center bg-black text-xs text-gray-500">Chargement de la vidéo…</div> : src ? <video controls preload="metadata" className="aspect-video w-full bg-black" src={src} /> : <div className="flex aspect-video items-center justify-center bg-black text-xs text-red-300">Vidéo indisponible</div>}<div className="p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-hud font-bold text-white">{recording.title}</h3><p className="mt-1 text-xs text-gray-500">{formatter.format(new Date(recording.createdAt))} · {(recording.sizeBytes / 1024 / 1024).toFixed(1)} MB</p></div><span className="shrink-0 font-hud-mono text-xs text-gray-500">{recording.durationSeconds ? `${Math.round(recording.durationSeconds)}s` : '—'}</span></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void download()} className="flex items-center gap-1.5 rounded border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 hover:border-racing-cyan/40 hover:text-white"><Download className="h-3.5 w-3.5" /> Télécharger</button><button type="button" onClick={onDelete} className="flex items-center gap-1.5 rounded border border-red-500/20 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button><span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-300"><Play className="h-3 w-3" /> Web</span></div></div></article>;
}
