'use client';

import { useEffect, useState } from 'react';

// Plays once per browser session, right after signing in: the logo's pulse
// arcs sweep in, the wordmark fades up, then the whole splash dissolves to
// reveal the app.
export default function SplashScreen() {
  const [phase, setPhase] = useState<'hidden' | 'playing' | 'leaving'>('hidden');

  useEffect(() => {
    try {
      if (sessionStorage.getItem('ri-splash-shown')) return;
      sessionStorage.setItem('ri-splash-shown', '1');
    } catch {
      return; // storage unavailable — skip the splash
    }
    setPhase('playing');
    const leave = setTimeout(() => setPhase('leaving'), 1500);
    const gone = setTimeout(() => setPhase('hidden'), 2050);
    return () => {
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div className={`splash${phase === 'leaving' ? ' leaving' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="splash-logo">
        <defs>
          <linearGradient id="splashBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1c2230" />
            <stop offset="1" stopColor="#12151c" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="15" fill="url(#splashBg)" />
        <g fill="none" stroke="#5b9dd9" strokeWidth="5" strokeLinecap="round">
          <path className="splash-arc s1" pathLength="1" d="M20 32 A12 12 0 0 1 32 44" />
          <path className="splash-arc s2" pathLength="1" d="M20 23 A21 21 0 0 1 41 44" />
          <path className="splash-arc s3" pathLength="1" d="M20 14 A30 30 0 0 1 50 44" />
        </g>
        <circle className="splash-dot" cx="20" cy="44" r="6" fill="#e8ecf3" />
        <circle className="splash-signal" cx="41.2" cy="22.8" r="4.5" fill="#4cb782" />
      </svg>
      <div className="splash-word">
        Renewal <span>Intelligence</span>
      </div>
    </div>
  );
}
