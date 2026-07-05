import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Trophy } from 'lucide-react';

export function Leaderboard() {
  return (
    <PageShell title="Classement" subtitle="Meilleurs temps par circuit et voiture">
      <Card className="flex flex-col items-center justify-center py-16">
        <Trophy className="mb-4 h-14 w-14 text-accent-orange/50" />
        <h3 className="mb-2 text-lg font-semibold text-white">Bientôt disponible</h3>
        <p className="max-w-md text-center text-sm text-gray-400">
          Le classement sera alimenté automatiquement dès que les sessions enregistreront les temps
          au tour.
        </p>
      </Card>
    </PageShell>
  );
}
