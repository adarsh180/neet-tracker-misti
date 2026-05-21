"use client";

import { useEffect, useState } from "react";

export default function LaunchSplash() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), 1550);
    const hideTimer = window.setTimeout(() => setVisible(false), 2000);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`launch-splash ${leaving ? "leaving" : ""}`} aria-hidden="true">
      <div className="launch-backdrop-name">Misti</div>
      <div className="launch-orbit" />
      <div className="launch-card">
        <div className="launch-mark">
          <img src="/doctor-logo-mark.png" alt="" />
        </div>
        <div className="launch-copy">
          <span>NEET Desk</span>
          <strong>Misti</strong>
        </div>
      </div>

      <style jsx>{`
        .launch-splash {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          overflow: hidden;
          color: #f3fff7;
          background:
            radial-gradient(ellipse 56% 40% at 50% 44%, rgba(74, 222, 128, 0.13), transparent 62%),
            radial-gradient(ellipse 42% 34% at 70% 28%, rgba(212, 168, 83, 0.1), transparent 68%),
            linear-gradient(180deg, #020504 0%, #07100b 54%, #050508 100%);
          opacity: 1;
          transition: opacity 420ms ease, transform 420ms ease;
        }

        .launch-splash.leaving {
          opacity: 0;
          transform: scale(1.015);
          pointer-events: none;
        }

        .launch-backdrop-name {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min-content;
          transform: translate(-50%, -50%);
          font-family: var(--font-display), serif;
          font-size: clamp(5.2rem, 19vw, 13rem);
          font-weight: 800;
          line-height: 0.8;
          letter-spacing: 0;
          color: rgba(220, 255, 230, 0.038);
          text-shadow: 0 0 52px rgba(74, 222, 128, 0.15);
          user-select: none;
          animation: launchName 1500ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .launch-orbit {
          position: absolute;
          width: min(520px, 86vw);
          aspect-ratio: 1;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.055);
          background:
            conic-gradient(from 210deg, transparent, rgba(255, 255, 255, 0.14), transparent 34%),
            radial-gradient(circle, transparent 61%, rgba(255, 255, 255, 0.035) 62%, transparent 64%);
          mask-image: radial-gradient(circle, transparent 47%, #000 48%);
          opacity: 0.72;
          animation: launchOrbit 3600ms linear infinite;
        }

        .launch-card {
          position: relative;
          z-index: 2;
          display: grid;
          justify-items: center;
          gap: 16px;
          width: min(300px, calc(100vw - 54px));
          padding: 28px 30px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background:
            linear-gradient(145deg, rgba(255, 255, 255, 0.145), rgba(255, 255, 255, 0.045) 58%, rgba(255, 255, 255, 0.075)),
            rgba(6, 14, 10, 0.58);
          box-shadow:
            0 26px 76px rgba(0, 0, 0, 0.52),
            inset 0 1px 0 rgba(255, 255, 255, 0.24),
            inset 0 -1px 0 rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(28px) saturate(175%);
          -webkit-backdrop-filter: blur(28px) saturate(175%);
          animation: launchCard 620ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .launch-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.38), transparent);
        }

        .launch-mark {
          width: 86px;
          height: 86px;
          display: grid;
          place-items: center;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background:
            linear-gradient(145deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.055)),
            rgba(255, 255, 255, 0.04);
          box-shadow: 0 18px 42px rgba(74, 222, 128, 0.14);
        }

        .launch-mark img {
          width: 62px;
          height: 62px;
          object-fit: contain;
          filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.32));
        }

        .launch-copy {
          display: grid;
          justify-items: center;
          gap: 4px;
          text-align: center;
        }

        .launch-copy span {
          color: rgba(198, 255, 215, 0.72);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .launch-copy strong {
          font-family: var(--font-display), serif;
          font-size: clamp(2.1rem, 9vw, 3rem);
          line-height: 1;
          letter-spacing: 0;
          color: #f4fff8;
        }

        @keyframes launchCard {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.975);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes launchName {
          from {
            opacity: 0;
            transform: translate(-50%, -49%) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes launchOrbit {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .launch-backdrop-name,
          .launch-orbit,
          .launch-card {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
