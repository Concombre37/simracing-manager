import { useState, FormEvent } from 'react';
import { stationsApi } from '../services/stations';
import { downloadEnvFile } from '../utils/downloadEnv';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Label } from './ui/Input';
import { Copy, Check, Download } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStationModal({ onClose, onCreated }: Props) {
  const [stationId, setStationId] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdStation, setCreatedStation] = useState<{
    stationId: string;
    name: string;
    apiKey: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await stationsApi.create({ stationId, name });
      setCreatedStation({ stationId: data.stationId, name: data.name, apiKey: data.apiKey });
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (!createdStation) return;
    void navigator.clipboard.writeText(createdStation.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadEnv() {
    if (!createdStation) return;
    downloadEnvFile(createdStation);
  }

  return (
    <Modal title="Créer une station" onClose={onClose}>
      {createdStation ? (
        <div className="space-y-4">
          <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg">
            <p className="text-sm text-green-300">
              Station <strong>{createdStation.name}</strong> créée.
            </p>
            <p className="text-sm text-green-300 mt-1">
              Télécharge le fichier de configuration ci-dessous et place-le à côté de{' '}
              <code>sim-center-agent-win.exe</code>, puis renomme-le en <code>.env</code>.
            </p>
          </div>

          <div className="relative">
            <Label>Clé API</Label>
            <code className="block p-4 bg-dark-900 border border-dark-600 text-accent-blue rounded-lg text-sm break-all font-mono">
              API_KEY={createdStation.apiKey}
            </code>
            <button
              onClick={copyToClipboard}
              className="absolute top-7 right-2 p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              title="Copier"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <Button variant="primary" onClick={handleDownloadEnv} className="w-full">
            <Download className="w-4 h-4" />
            Télécharger la config (.env)
          </Button>

          <Button variant="secondary" onClick={onClose} className="w-full">
            Fermer
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="stationId">Station ID</Label>
            <Input
              id="stationId"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="poste-1"
              required
              pattern="[a-z0-9-]+"
            />
            <p className="text-xs text-gray-500 mt-1">Uniquement minuscules, chiffres et tirets</p>
          </div>
          <div>
            <Label htmlFor="name">Nom affiché</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Poste 1"
              required
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" variant="primary" isLoading={loading} className="flex-1">
              Créer
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
