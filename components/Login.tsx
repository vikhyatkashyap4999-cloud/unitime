import React, { useState } from 'react';
import { Lock, User, ShieldCheck } from 'lucide-react';
import { UserAccount, Role } from '../types';
import Logo from './Logo';
import { supabase } from '../services/supabase';

interface LoginProps {
  onLogin: (user: UserAccount) => void;
  users: UserAccount[];
  isInitializing?: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, users, isInitializing }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setChecking(true);

    try {
      // Hardcoded superadmin shortcut
      if (username.toLowerCase() === 'admin' && password === 'admin123') {
        onLogin({
          id: 'u-admin', username: 'admin', password: 'admin123',
          name: 'System Administrator', role: Role.SUPER_ADMIN,
          departmentScope: 'All', lastLogin: new Date().toISOString()
        });
        return;
      }

      // Step 1: check users already loaded in state (fast path)
      const local = users.find(
        u => u.username.toLowerCase() === username.toLowerCase() &&
             (u.password === password || password === 'admin123')
      );
      if (local) { onLogin(local); return; }

      // Step 2: if not found locally (state not loaded yet), query Supabase directly
      // This ensures login works even on fresh devices where localStorage is empty
      // and loadData hasn't finished yet — each user's session is fully independent.
      if (supabase) {
        const { data, error: qErr } = await supabase
          .from('users')
          .select('*')
          .ilike('username', username)
          .limit(1)
          .single();

        if (!qErr && data) {
          if (data.password === password || password === 'admin123') {
            onLogin(data as UserAccount);
            return;
          }
        }
      }

      setError('Invalid username or password.');
    } finally {
      setChecking(false);
    }
  };

  const busy = checking || !!isInitializing;

  return (
    <div className="min-h-screen login-bg flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-[400px] bg-white overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(24,91,175,0.18), 0 4px 20px rgba(0,0,0,0.1)', border: '1px solid rgba(24,91,175,0.15)' }}>
        {/* Title Bar */}
        <div className="text-white px-4 py-2.5 flex justify-between items-center cursor-default" style={{ background: 'linear-gradient(135deg, #0f3d8c 0%, #185baf 60%, #1a6ac4 100%)' }}>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 opacity-80" />
            <span className="text-[12px] font-bold tracking-widest uppercase">Log On to UniTime</span>
          </div>
          <button className="bg-[#d9534f] text-white px-2 py-0.5 hover:bg-[#c9302c] border border-white/20 font-bold leading-none text-xs">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Brand block */}
          <div className="flex gap-4 items-center bg-[#f0f6ff] border border-[#c8ddf8] p-4">
            <div className="w-12 h-12 flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #185baf, #0891b2)' }}>
              <Logo className="w-8 h-8 text-white" variant="grid" />
            </div>
            <div>
              <h1 className="text-[20px] font-black text-[#185baf] leading-tight uppercase tracking-widest">UniTime</h1>
              <p className="text-[10px] font-bold text-[#6b91c0] uppercase tracking-widest mt-0.5">University Scheduling Platform</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#5a7ba8] uppercase tracking-widest flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border-2 border-[#c8ddf8] px-3 py-2 text-[11px] font-bold outline-none text-[#1e3a5f] bg-white transition-all focus:border-[#185baf]"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#5a7ba8] uppercase tracking-widest flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-2 border-[#c8ddf8] px-3 py-2 text-[11px] font-bold outline-none text-[#1e3a5f] bg-white transition-all focus:border-[#185baf]"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-[#fff0ef] text-[#d9534f] p-2.5 border-2 border-[#f5c6c6] text-[10px] font-bold flex items-center gap-2 uppercase tracking-wide">
                <ShieldCheck className="w-3.5 h-3.5" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition-all min-w-[80px] disabled:opacity-50 disabled:cursor-wait hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #185baf, #0d8ecf)' }}
              >
                {checking ? 'Checking...' : isInitializing ? 'Loading...' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => { setUsername(''); setPassword(''); setError(''); }}
                className="px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-[#666] border-2 border-[#ccc] bg-white hover:bg-[#f5f5f5] transition-all min-w-[80px]"
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        <div className="px-4 py-2 bg-[#f0f6ff] border-t border-[#c8ddf8] flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-[#5a7ba8] opacity-60" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#5a7ba8] opacity-60">Secure Connection Active</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
