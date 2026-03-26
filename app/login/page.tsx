'use client';

import { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { LogIn, Loader2 } from 'lucide-react';
import DotGrid from '../components/DotGrid';

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!authLoading && user) {
    router.replace('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const err = await login(email, password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      router.replace('/');
    }
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite transition-colors relative flex items-center justify-center">
      <DotGrid />
      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <img src="/gruzly-bear.png" alt="Gruzly" className="w-16 h-16 rounded-2xl mx-auto mb-3 object-cover" />
          <h1 className="text-xl font-black tracking-tight">Gruzly</h1>
          <p className="text-xs text-muted mt-1">AI Brand Graphics</p>
        </div>

        <form onSubmit={handleSubmit} className="panel rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs text-muted mb-1.5 block font-semibold uppercase tracking-wide">Email</label>
            <input
              type="email"
              className="w-full rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors panel-inset"
              placeholder="twoj@email.pl"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1.5 block font-semibold uppercase tracking-wide">Hasło</label>
            <input
              type="password"
              className="w-full rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors panel-inset"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full h-11 rounded-full holo-gradient text-teal-deep text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  );
}
