import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { PageBackground } from '../components/PageBackground';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { AlertCircle, Flag, Loader2, ShieldCheck } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setSuccess(true);
      setTimeout(() => navigate('/'), 500);
    } catch {
      setError('Identifiants invalides');
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <PageBackground />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-orange to-accent-red shadow-glow-orange">
            <Flag className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-accent-orange">SIM</span>
            <span className="text-white">RACING</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">Manager technique</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-dark-700 bg-dark-900/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-md">
          <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent-orange to-transparent" />

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 overflow-hidden rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-300"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hytlabs.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading || success}
              className="mt-2 w-full"
            >
              <AnimatePresence mode="wait" initial={false}>
                {success ? (
                  <motion.span
                    key="success"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Accès autorisé
                  </motion.span>
                ) : loading ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authentification...
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    Connexion
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center font-mono text-xs text-gray-600">
          © {new Date().getFullYear()} HytLabs — Infrastructure SimRacing
        </p>
      </motion.div>
    </div>
  );
}
