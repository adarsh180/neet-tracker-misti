"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";
import { setAuth, getStoredAuth } from "@/lib/auth";
import { validateCredentials } from "@/app/actions/authActions";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [error, setError]     = useState("");
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    router.prefetch("/dashboard");
    if (getStoredAuth()) router.replace("/dashboard");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);

    startTransition(async () => {
      const isValid = await validateCredentials(email, password);
      if (isValid) {
        setAuth();
        router.prefetch("/dashboard");
        router.replace("/dashboard");
      } else {
        setError("Invalid credentials. This platform is exclusively for Misti.");
        setLoading(false);
      }
    });
  };

  return (
    <div className="signin-page">
      {/* Ambient */}
      <div className="signin-orb signin-orb-1" />
      <div className="signin-orb signin-orb-2" />

      {/* Card */}
      <div className="signin-wrap animate-scale-in">
        {/* Logo mark */}
        <div className="signin-logo animate-pulse-glow">
          <span className="devanagari" style={{ fontSize: 22, color: "var(--gold)" }}>ॐ</span>
        </div>

        <div className="signin-brand">
          <h1 className="signin-title gradient-text">Sacred Path</h1>
          <div className="signin-shloka devanagari">सरस्वत्यै नमः</div>
        </div>

        <div className="signin-greeting">
          <h2 className="signin-greeting-title">Welcome back, Misti</h2>
          <p className="signin-greeting-sub">Your AIIMS Delhi journey continues here</p>
        </div>

        <form onSubmit={handleSubmit} className="signin-form">
          {/* Email */}
          <div className="signin-field">
            <label className="signin-label" htmlFor="email">Email</label>
            <div className="input-group">
              <div className="input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <input
                id="email" type="email" className="input" autoComplete="email"
                placeholder="your@email.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
          </div>

          {/* Password */}
          <div className="signin-field">
            <label className="signin-label" htmlFor="password">Password</label>
            <div className="input-group">
              <div className="input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <input
                id="password" type={showPw ? "text" : "password"} className="input"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required
                style={{ paddingRight: 48 }}
              />
              <button type="button" className="signin-eye" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="signin-error animate-fade-in">
              <span>⚠</span> {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" id="signin-submit" className="btn btn-primary btn-lg signin-submit" disabled={loading}>
            {loading ? (
              <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </span>
            ) : (
              <>Enter Sacred Path <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        <p className="signin-footer">
          <Sparkles size={12} style={{ color: "var(--gold)" }} />
          Exclusively for Misti Tiwari&apos;s NEET 2027 preparation
        </p>
      </div>

      <style jsx>{`
        .signin-page {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 24px; background: var(--bg-void); position: relative; overflow: hidden;
        }
        .signin-orb {
          position: fixed; border-radius: 50%; filter: blur(100px); pointer-events: none;
        }
        .signin-orb-1 {
          width: 600px; height: 600px; top: -200px; left: -200px;
          background: radial-gradient(circle, hsla(285,45%,38%,0.20) 0%, transparent 65%);
          animation: float 9s ease-in-out infinite;
        }
        .signin-orb-2 {
          width: 500px; height: 500px; bottom: -150px; right: -100px;
          background: radial-gradient(circle, hsla(38,70%,48%,0.15) 0%, transparent 65%);
          animation: float 7s ease-in-out infinite 2s;
        }
        .signin-wrap {
          position: relative; z-index: 1;
          width: 100%; max-width: 430px;
          background: linear-gradient(
            145deg,
            rgba(255,255,255,0.075) 0%,
            rgba(255,255,255,0.033) 60%,
            rgba(255,255,255,0.048) 100%
          );
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border: 1px solid var(--glass-border-mid);
          border-radius: var(--r-2xl);
          padding: 44px 40px;
          box-shadow: var(--shadow-xl), 0 0 60px hsla(285,40%,40%,0.10);
          display: flex; flex-direction: column; gap: 24px;
        }

        /* Top highlight */
        .signin-wrap::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
          border-radius: var(--r-2xl) var(--r-2xl) 0 0;
          pointer-events: none;
        }

        .signin-logo {
          width: 60px; height: 60px; margin: 0 auto;
          background: linear-gradient(135deg, hsla(38,72%,58%,0.18), hsla(285,38%,54%,0.12));
          border: 1px solid hsla(38,72%,58%,0.30);
          border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
        }
        .signin-brand { text-align: center; }
        .signin-title { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
        .signin-shloka { font-size: 14px; color: var(--gold); letter-spacing: 0.04em; margin-top: 3px; }
        .signin-greeting { text-align: center; }
        .signin-greeting-title { font-size: 19px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
        .signin-greeting-sub { font-size: 14px; color: var(--text-secondary); }
        .signin-form { display: flex; flex-direction: column; gap: 15px; }
        .signin-field { display: flex; flex-direction: column; gap: 7px; }
        .signin-label { font-size: 12.5px; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.02em; }
        .signin-eye {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: var(--text-muted);
          transition: color 0.15s; display: flex;
        }
        .signin-eye:hover { color: var(--text-primary); }
        .signin-error {
          display: flex; align-items: center; gap: 8px;
          padding: 11px 14px; border-radius: var(--r-md);
          background: hsla(0,64%,58%,0.08);
          border: 1px solid hsla(0,64%,58%,0.22);
          font-size: 13px; color: var(--danger);
        }
        .signin-submit { width: 100%; border-radius: var(--r-lg); font-size: 15px; }
        .signin-footer {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 12px; color: var(--text-muted); text-align: center;
        }
      `}</style>
    </div>
  );
}
