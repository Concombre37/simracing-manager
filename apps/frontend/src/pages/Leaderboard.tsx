import { Card } from '../components/ui/Card';
import { Trophy } from 'lucide-react';

export function Leaderboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Classement</h2>
        <p className="text-gray-400">Meilleurs temps par circuit et voiture</p>
      </div>

      <Card className="flex flex-col items-center justify-center py-16">
        <Trophy className="w-16 h-16 text-accent-orange/50 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Bientôt disponible</h3>
        <p className="text-gray-400 text-center max-w-md">
          Le classement sera alimenté automatiquement dès que les sessions enregistreront les temps
          au tour.
        </p>
      </Card>
    </div>
  );
}
