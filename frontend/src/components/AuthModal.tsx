import React, { useState } from "react";
import { api, setAuthToken, User } from "../api";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, currentUser, onUserChange }) => {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isHumanChecked, setIsHumanChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isHumanChecked) {
      setError("Please check 'I am not a robot' to verify security.");
      return;
    }

    setLoading(true);
    try {
      if (tab === "login") {
        const res = await api.auth.login(email, password);
        setAuthToken(res.token);
        onUserChange(res.user);
        onClose();
      } else {
        const res = await api.auth.register(email, password, fullName);
        setAuthToken(res.token);
        onUserChange(res.user);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    setAuthToken(null);
    onUserChange(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg p-1 transition-colors"
          title="Close modal"
        >
          ✕
        </button>

        {currentUser ? (
          // Logged in user profile view
          <div className="space-y-6 pt-2">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-500/20">
                {(currentUser.full_name || currentUser.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {currentUser.full_name || "ClipTrim Creator"}
                </h3>
                <p className="text-sm text-slate-400">{currentUser.email}</p>
                <div className="inline-flex items-center gap-1.5 mt-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Verified Account
                </div>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-xs text-slate-300 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">User ID</span>
                <span className="font-mono text-slate-200">{currentUser.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Account Type</span>
                <span className="text-amber-400 font-medium">Pro Creator Cloud</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Storage Sync</span>
                <span className="text-emerald-400">Active</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600/30 text-rose-300 py-2.5 rounded-xl font-medium text-sm transition-all"
              >
                Log Out
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-medium text-sm transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          // Login / Signup forms
          <div className="space-y-5 pt-1">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🛡️</span> ClipTrim HD Account
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Save projects to your cloud database and secure your workspace
              </p>
            </div>

            {/* Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => { setTab("login"); setError(null); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  tab === "login" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setTab("register"); setError(null); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  tab === "register" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-xl flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === "register" && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Bot Verification / Captcha Security Box */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isHumanChecked}
                    onChange={(e) => setIsHumanChecked(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-200">I am not a robot</span>
                </label>
                <div className="flex items-center gap-1.5 opacity-60">
                  <div className="w-5 h-5 rounded border border-slate-600 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                    🛡️
                  </div>
                  <span className="text-[10px] text-slate-400">Secure Shield</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-sm shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
              >
                {loading ? "Verifying..." : tab === "login" ? "Sign In & Unlock" : "Create Account & Sync"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
