"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, Loader2, ShieldCheck, Volume2, Waves } from "lucide-react";

type PreflightTest = { id: string; title: string; questionCount: number; durationMinutes?: number };

function startNatureSound() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const length = context.sampleRate * 3;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = brown * 2.6;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 720;
  const gain = context.createGain();
  gain.gain.value = 0.045;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  return () => { source.stop(); void context.close(); };
}

export default function TestPreflight({ test, onCancel, onComplete }: {
  test: PreflightTest;
  onCancel: () => void;
  onComplete: (stream: MediaStream) => void;
}) {
  const [stage, setStage] = useState<"consent" | "calm">("consent");
  const [agreed, setAgreed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(60);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopSoundRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    document.body.classList.add("cbt-preflight-active");
    return () => {
      document.body.classList.remove("cbt-preflight-active");
      stopSoundRef.current?.();
    };
  }, []);
  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraReady]);

  useEffect(() => {
    if (stage !== "calm") return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "calm" || seconds > 0 || !streamRef.current) return;
    stopSoundRef.current?.();
    stopSoundRef.current = null;
    onComplete(streamRef.current);
  }, [onComplete, seconds, stage]);

  const requestCamera = async () => {
    setRequesting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraReady(true);
    } catch {
      setError("Camera access is required for this test. Allow camera access in the browser and operating-system settings, then try again.");
    } finally {
      setRequesting(false);
    }
  };

  const beginCalm = async () => {
    if (!agreed || !cameraReady) return;
    const response = await fetch(`/api/practice/${test.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "proctor-consent" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Could not record consent"); return; }
    stopSoundRef.current = startNatureSound();
    setStage("calm");
  };

  const cancel = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopSoundRef.current?.();
    onCancel();
  };

  if (stage === "calm") {
    const progress = ((60 - seconds) / 60) * 100;
    return (
      <section className="preflight calm-screen">
        <div className="calm-orbit"><Waves size={38} /><span /></div>
        <p className="preflight-kicker">One quiet minute · एक शांत मिनट</p>
        <h1>Close your eyes. Breathe slowly.</h1>
        <p>Inhale for four counts, hold gently, then exhale for six. Let the previous hour go.</p>
        <p className="hindi">आँखें बंद करें। चार गिनती तक साँस लें, थोड़ी देर रोकें और छह गिनती में धीरे-धीरे छोड़ें।</p>
        <div className="calm-time">{seconds}<small>seconds</small></div>
        <div className="calm-progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="sound-on"><Volume2 size={14} /> Gentle nature sound is playing</div>
        <style jsx>{styles}</style>
      </section>
    );
  }

  return (
    <section className="preflight">
      <button className="preflight-back" type="button" onClick={cancel}><ArrowLeft size={15} /> Attempts</button>
      <header className="preflight-head">
        <div className="preflight-shield"><ShieldCheck size={25} /></div>
        <div><p className="preflight-kicker">Candidate declaration · अभ्यर्थी घोषणा</p><h1>{test.title}</h1><p>{test.questionCount} questions · {test.durationMinutes ?? 180} minutes</p></div>
      </header>
      <div className="declaration-grid">
        <article>
          <h2>English instructions</h2>
          <ol>
            <li>The timer begins only after the one-minute calm screen.</li>
            <li>Do not switch tabs, minimise the browser, leave fullscreen, or open another app.</li>
            <li>Each interruption pauses the test and records an integrity event. The third interruption automatically submits the test.</li>
            <li>Integrity interruptions are saved with the attempt. Proctor email and camera-frame capture are currently paused; no camera image is stored in the app database.</li>
            <li>Keep your face visible and remain alone in a well-lit place throughout the test.</li>
          </ol>
        </article>
        <article lang="hi">
          <h2>हिंदी निर्देश</h2>
          <ol>
            <li>एक मिनट की शांत प्रक्रिया पूरी होने के बाद ही परीक्षा का समय शुरू होगा।</li>
            <li>टैब न बदलें, ब्राउज़र को छोटा न करें, फुलस्क्रीन से बाहर न जाएँ और कोई दूसरा ऐप न खोलें।</li>
            <li>हर व्यवधान पर परीक्षा रुकेगी। तीसरे व्यवधान पर परीक्षा स्वतः जमा हो जाएगी।</li>
            <li>परीक्षा के व्यवधान प्रयास के साथ सुरक्षित रहेंगे। प्रॉक्टर ईमेल और कैमरा-चित्र कैप्चर अभी स्थगित हैं; कोई कैमरा चित्र ऐप डेटाबेस में संग्रहीत नहीं होगा।</li>
            <li>पूरी परीक्षा में चेहरा स्पष्ट रखें और रोशनी वाले स्थान पर अकेले बैठें।</li>
          </ol>
        </article>
      </div>
      <div className="camera-consent">
        <div className={`camera-preview ${cameraReady ? "ready" : ""}`}>
          {cameraReady ? <video ref={videoRef} autoPlay playsInline muted /> : <Camera size={26} />}
          {cameraReady && <span><CheckCircle2 size={13} /> Camera ready</span>}
        </div>
        <div className="consent-copy">
          <h2>Camera and integrity consent</h2>
          <p>The camera is required to begin. Your browser may remember the operating-system permission, but this app checks camera access before every new attempt.</p>
          <button type="button" className="camera-button" disabled={requesting} onClick={() => void requestCamera()}>{requesting ? <Loader2 className="spin" size={15} /> : <Camera size={15} />}{cameraReady ? "Re-check camera" : "Allow and test camera"}</button>
        </div>
      </div>
      <label className="consent-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>I have read both declarations and voluntarily consent to camera-based integrity checks for this attempt. / मैंने दोनों घोषणाएँ पढ़ ली हैं और इस प्रयास के लिए कैमरा-आधारित सत्यापन की सहमति देती हूँ।</span></label>
      {error && <p className="preflight-error">{error}</p>}
      <button className="begin-calm" type="button" disabled={!agreed || !cameraReady} onClick={() => void beginCalm()}>Agree and begin calm minute</button>
      <style jsx>{styles}</style>
    </section>
  );
}

const styles = `
  .preflight { width: min(1040px, 100%); min-width: 0; margin: 0 auto; color: var(--text-primary); }
  .preflight-back { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 15px; border: 0; background: none; color: var(--text-secondary); cursor: pointer; }
  .preflight-head { display: flex; align-items: center; gap: 14px; padding: 20px; border: 1px solid var(--gold-glow); border-radius: 18px; background: linear-gradient(130deg, var(--gold-dim), transparent 62%), var(--bg-surface); }
  .preflight-shield { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 15px; color: var(--gold); background: var(--gold-dim); border: 1px solid var(--gold-glow); }
  .preflight-kicker { margin: 0 0 4px; color: var(--gold); font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; }
  .preflight h1 { margin: 0; font-family: var(--font-display), serif; font-size: clamp(21px, 3vw, 30px); font-weight: 600; }
  .preflight-head p:last-child { margin: 5px 0 0; color: var(--text-secondary); font-size: 12px; }
  .declaration-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 13px 0; }
  .declaration-grid article, .camera-consent { padding: 18px; border-radius: 16px; border: 1px solid var(--glass-border); background: var(--bg-surface); text-align: left; }
  .declaration-grid h2, .camera-consent h2 { margin: 0 0 10px; font-size: 13px; color: var(--gold); }
  .declaration-grid ol { margin: 0; padding-left: 19px; color: var(--text-secondary); font-size: 12.5px; line-height: 1.65; }
  .declaration-grid li + li { margin-top: 7px; }
  .camera-consent { display: grid; grid-template-columns: 220px 1fr; gap: 18px; align-items: center; }
  .camera-preview { min-height: 145px; display: grid; place-items: center; position: relative; overflow: hidden; border-radius: 13px; border: 1px dashed var(--glass-border-mid); color: var(--text-muted); background: #080b10; }
  .camera-preview video { width: 100%; height: 145px; object-fit: cover; transform: scaleX(-1); }
  .camera-preview span { position: absolute; left: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 999px; background: rgba(8,12,16,.78); color: #9be6b5; font-size: 10.5px; }
  .consent-copy p { color: var(--text-secondary); font-size: 12.5px; line-height: 1.6; }
  .camera-button, .begin-calm { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--gold-glow); border-radius: 11px; padding: 10px 14px; background: var(--gold-dim); color: var(--gold); font-weight: 750; cursor: pointer; }
  .consent-check { display: flex; align-items: flex-start; gap: 10px; padding: 15px; border: 1px solid var(--glass-border); border-radius: 14px; background: var(--bg-elevated); color: var(--text-secondary); font-size: 12.5px; line-height: 1.55; }
  .consent-check input { margin-top: 3px; accent-color: var(--gold); }
  .begin-calm { width: 100%; min-height: 48px; margin-top: 12px; font-size: 13px; }
  .begin-calm:disabled { opacity: .38; cursor: not-allowed; }
  .preflight-error { color: var(--danger); font-size: 12px; }
  .calm-screen { min-height: min(740px, 82vh); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 30px; border: 1px solid var(--gold-glow); border-radius: 22px; background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--botany) 14%, transparent), transparent 40%), var(--bg-surface); }
  .calm-screen > p:not(.preflight-kicker) { max-width: 610px; margin: 8px 0 0; color: var(--text-secondary); line-height: 1.7; }
  .calm-screen .hindi { font-size: 13px; }
  .calm-orbit { position: relative; width: 92px; height: 92px; display: grid; place-items: center; margin-bottom: 18px; border-radius: 50%; color: var(--botany); background: color-mix(in srgb, var(--botany) 12%, transparent); animation: breathe 10s ease-in-out infinite; }
  .calm-orbit span { position: absolute; inset: -12px; border: 1px solid color-mix(in srgb, var(--botany) 32%, transparent); border-radius: inherit; }
  .calm-time { margin: 22px 0 10px; font-size: 44px; font-weight: 650; color: var(--gold); font-variant-numeric: tabular-nums; }
  .calm-time small { display: block; margin-top: -5px; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
  .calm-progress { width: min(420px, 100%); height: 5px; overflow: hidden; border-radius: 999px; background: var(--bg-elevated); }
  .calm-progress span { display: block; height: 100%; background: linear-gradient(90deg, var(--botany), var(--gold)); transition: width 1s linear; }
  .sound-on { display: flex; align-items: center; gap: 6px; margin-top: 14px; color: var(--text-muted); font-size: 11px; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes breathe { 0%,100% { transform: scale(.9); } 45% { transform: scale(1.12); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 720px) { .declaration-grid { grid-template-columns: 1fr; } .camera-consent { grid-template-columns: 1fr; } .camera-preview { min-height: 180px; } .camera-preview video { height: 180px; } }
`;
