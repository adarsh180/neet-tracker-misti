// Visual system for the CBT Practice Arena.
// Principles: one surface level (no nested boxed chips), one accent (gold),
// semantic NTA colors confined to the palette, weights 600-700, generous whitespace.

export const listStyles = `
  .cbt-list-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 22px; padding-right: 52px; }
  .cbt-brand-mark { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: var(--gold); background: var(--gold-dim); border: 1px solid var(--gold-glow); }
  .cbt-list-head div:nth-child(2) { flex: 1; min-width: 240px; }
  .cbt-list-head h1 { font-family: var(--font-display), 'Playfair Display', serif; font-size: 23px; font-weight: 600; margin: 0; color: var(--text-primary); }
  .cbt-list-head p { margin: 3px 0 0; color: var(--text-secondary); font-size: 12.5px; }
  .cbt-list-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cbt-bookmark-entry { color: var(--gold); border-color: var(--gold-glow); background: color-mix(in srgb, var(--gold) 5%, transparent); }
  .cbt-bookmark-entry:hover:not(:disabled) { color: var(--gold-bright); background: var(--gold-dim); border-color: color-mix(in srgb, var(--gold) 48%, transparent); }
  .cbt-test-list { display: grid; gap: 8px; }
  .test-folders { margin: 0 0 22px; padding: 18px; border: 1px solid var(--glass-border); border-radius: 16px; background: var(--bg-surface); box-shadow: 0 14px 36px rgba(0,0,0,.045); }
  .folder-section-head { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 0 1px 13px; }
  .folder-section-head strong { display: block; color: var(--text-primary); font-size: 13px; font-weight: 650; }
  .folder-section-head span { display: block; margin-top: 2px; color: var(--text-muted); font-size: 10.5px; }
  .folder-rail { display: grid; grid-template-columns: repeat(auto-fill, minmax(146px, 1fr)); gap: 12px; }
  .test-folder { position: relative; min-height: 118px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-content: end; gap: 3px 8px; padding: 15px; overflow: hidden; border-radius: 13px; border: 1px solid color-mix(in srgb, var(--text-muted) 19%, transparent); background: color-mix(in srgb, var(--bg-elevated) 96%, #c6ae7b 4%); color: var(--text-primary); text-align: left; cursor: pointer; box-shadow: 0 5px 14px rgba(0,0,0,.045); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .test-folder::before { content: ""; position: absolute; left: -1px; top: -1px; width: 58px; height: 13px; border: inherit; border-bottom: 0; border-radius: 9px 9px 0 0; background: inherit; }
  .test-folder:hover, .test-folder.active, .test-folder.drop-ready { transform: translateY(-1px); border-color: color-mix(in srgb, var(--gold) 26%, var(--glass-border)); box-shadow: 0 8px 18px rgba(0,0,0,.065); }
  .test-folder.drop-ready { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--gold) 52%, transparent), 0 8px 18px rgba(0,0,0,.065); }
  .test-folder.permanent { border-color: color-mix(in srgb, var(--gold) 20%, var(--glass-border)); background: color-mix(in srgb, var(--bg-elevated) 95%, var(--gold) 5%); }
  .folder-art { position: absolute; left: 13px; top: 20px; color: color-mix(in srgb, var(--gold) 68%, var(--text-secondary)); }
  .folder-art svg { fill: color-mix(in srgb, currentColor 13%, transparent); stroke-width: 1.5; }
  .test-folder strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; font-weight: 650; }
  .test-folder small { color: var(--text-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .folder-create { display: grid; grid-template-columns: auto minmax(130px, 1fr) auto; align-items: center; gap: 9px; max-width: 430px; margin-top: 12px; padding: 8px 9px 8px 12px; border: 1px solid var(--glass-border); border-radius: 12px; color: var(--gold); background: var(--bg-elevated); }
  .folder-create input { min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 12.5px; }
  .folder-create button { border: 0; border-radius: 9px; padding: 7px 11px; background: var(--gold-dim); color: var(--gold); font-size: 11.5px; font-weight: 750; cursor: pointer; }
  .folder-create button:disabled { opacity: .4; cursor: default; }
  .folder-help { display: flex; align-items: center; gap: 5px; margin: 9px 0 0; color: var(--text-muted); font-size: 10.5px; }
  .arena-inbox-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin: 0 2px 11px; }
  .arena-inbox-head strong { color: var(--text-primary); font-size: 13px; font-weight: 650; }
  .arena-inbox-head span { margin-left: 8px; color: var(--text-muted); font-size: 10.5px; }
  .arena-inbox-head small { color: var(--text-muted); font-size: 10.5px; text-align: right; }
  .folder-workspace-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: end; margin-bottom: 22px; padding: 2px 2px 18px; border-bottom: 1px solid var(--glass-border); }
  .folder-workspace-back { grid-column: 1 / -1; width: fit-content; display: inline-flex; align-items: center; gap: 4px; border: 0; padding: 0; background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; }
  .folder-workspace-back:hover { color: var(--text-primary); }
  .folder-workspace-title { display: flex; align-items: center; gap: 13px; min-width: 0; }
  .folder-workspace-icon { width: 52px; height: 44px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; color: color-mix(in srgb, var(--gold) 68%, var(--text-secondary)); background: color-mix(in srgb, var(--bg-elevated) 92%, #c6ae7b 8%); border: 1px solid var(--glass-border); }
  .folder-workspace-icon svg { fill: color-mix(in srgb, currentColor 12%, transparent); stroke-width: 1.5; }
  .folder-workspace-title span:not(.folder-workspace-icon) { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .11em; }
  .folder-workspace-title h1 { margin: 2px 0 0; color: var(--text-primary); font: 600 24px/1.15 var(--font-display), 'Playfair Display', serif; }
  .folder-workspace-title p { margin: 4px 0 0; color: var(--text-secondary); font-size: 11.5px; }
  .cbt-test-row { display: flex; align-items: center; gap: 12px; padding: 15px 18px; border-radius: 14px; background: var(--bg-surface); border: 1px solid var(--glass-border); transition: var(--t-fast); }
  .cbt-test-row:hover { border-color: var(--glass-border-mid); }
  .cbt-test-row.dragging { opacity: .55; border-color: var(--gold-glow); }
  .test-drag-handle { flex: 0 0 auto; color: var(--text-muted); cursor: grab; }
  .test-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
  .test-folder-select { max-width: 118px; border: 1px solid var(--glass-border); border-radius: 9px; padding: 7px 8px; background: var(--bg-elevated); color: var(--text-secondary); font-size: 10.5px; }
  .folder-test-grid { grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; align-items: stretch; }
  .folder-test-grid .cbt-test-row { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: minmax(54px, auto) auto; align-items: start; gap: 8px 10px; padding: 16px; }
  .folder-test-grid .cbt-test-main { grid-column: 2; align-self: center; }
  .folder-test-grid .test-row-actions { grid-column: 2; justify-content: flex-start; flex-wrap: wrap; padding-top: 9px; border-top: 1px solid var(--glass-border); }
  .folder-test-grid .test-folder-select { margin-left: auto; max-width: 142px; }
  .folder-empty { min-height: 170px; }
  .cbt-test-main { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; color: var(--text-primary); cursor: pointer; padding: 0; }
  .cbt-test-main strong { display: block; font-size: 13.5px; font-weight: 600; }
  .cbt-test-main span { display: block; color: var(--text-muted); font-size: 11.5px; margin-top: 3px; }
  .cbt-test-chip { flex-shrink: 0; font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.02em; }
  .cbt-test-chip-completed { color: var(--gold); }
  .cbt-test-chip-ready, .cbt-test-chip-running, .cbt-test-chip-paused { color: var(--success); }
  .cbt-test-chip-generating { color: var(--gold); }
  .cbt-gen-chip { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
  @media (max-width: 680px) {
    .folder-rail { display: flex; overflow-x: auto; scroll-snap-type: x proximity; padding-bottom: 4px; }
    .test-folder { min-width: 142px; scroll-snap-align: start; }
    .folder-workspace-head { grid-template-columns: 1fr; align-items: start; }
    .folder-workspace-head .cbt-list-actions { width: 100%; }
    .folder-workspace-head .cbt-list-actions button { flex: 1; }
    .cbt-test-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; padding: 13px; gap: 8px; }
    .cbt-test-main { grid-column: 2 / -1; }
    .test-row-actions { grid-column: 2 / -1; justify-content: flex-start; flex-wrap: wrap; }
    .test-folder-select { max-width: none; min-height: 36px; margin-left: auto; }
    .test-drag-handle { display: none; }
    .folder-test-grid { grid-template-columns: 1fr; }
    .folder-test-grid .cbt-test-row { grid-template-columns: minmax(0, 1fr); }
    .folder-test-grid .cbt-test-main, .folder-test-grid .test-row-actions { grid-column: 1; }
    .arena-inbox-head { align-items: start; flex-direction: column; gap: 3px; }
    .arena-inbox-head small { text-align: left; }
  }
`;

export const globalCBTStyles = `
  .cbt-primary, .cbt-ghost, .danger-btn, .cbt-icon-btn {
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 42px;
    padding: 10px 18px;
    border: 1px solid var(--glass-border);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    transition: var(--t-fast);
  }
  .cbt-primary {
    color: var(--gold);
    background: var(--gold-dim);
    border-color: var(--gold-glow);
  }
  .cbt-primary:hover:not(:disabled) { background: hsla(38, 72%, 58%, 0.18); }
  .cbt-primary:disabled, .cbt-ghost:disabled, .danger-btn:disabled { opacity: .45; cursor: not-allowed; }
  .cbt-ghost { color: var(--text-secondary); background: transparent; }
  .cbt-ghost:hover:not(:disabled) { color: var(--text-primary); border-color: var(--glass-border-mid); }
  .danger-btn { color: var(--danger); background: transparent; border-color: hsla(0,72%,62%,.25); }
  .danger-btn:hover:not(:disabled) { background: hsla(0,72%,62%,.08); }
  .small { min-height: 34px; padding: 7px 12px; font-size: 12px; }
  .cbt-icon-btn { width: 38px; height: 38px; padding: 0; color: var(--text-muted); background: transparent; border-color: transparent; }
  .cbt-icon-btn:hover { color: var(--danger); }
  .cbt-reattempt-btn:hover:not(:disabled) { color: var(--gold); border-color: var(--gold-glow); background: var(--gold-dim); }
  .cbt-back { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 14px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 13px; padding: 0; }
  .cbt-back:hover { color: var(--text-primary); }
  .cbt-label { display: block; margin: 20px 0 9px; color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; }
  .cbt-label:first-child { margin-top: 0; }
  .cbt-error { color: var(--danger); font-size: 12.5px; margin: 10px 0 0; }
  .cbt-empty {
    min-height: 280px; display: grid; place-items: center; align-content: center; gap: 14px;
    text-align: center; padding: 28px; border-radius: 16px; color: var(--text-secondary);
    background: var(--bg-surface); border: 1px solid var(--glass-border); font-size: 13.5px;
  }
  .cbt-spin { animation: cbt-spin 1s linear infinite; }
  body.cbt-preflight-active .notify-dock,
  body.cbt-preflight-active .notify-toast,
  body.cbt-preflight-active .fab-toggle,
  body.cbt-preflight-active .nav-shell,
  body.cbt-preflight-active .nav-backdrop,
  body.cbt-preflight-active .theme-toggle { display: none !important; }
  body.cbt-result-active .notify-dock,
  body.cbt-result-active .notify-toast,
  body.cbt-result-active .fab-toggle,
  body.cbt-result-active .nav-shell,
  body.cbt-result-active .nav-backdrop,
  body.cbt-result-active .theme-toggle { display: none !important; }
  @keyframes cbt-spin { to { transform: rotate(360deg); } }
`;

export const setupStyles = `
  .setup-head { margin-bottom: 18px; }
  .setup-head h1 { font-family: var(--font-display), 'Playfair Display', serif; font-weight: 600; margin: 0; font-size: 23px; color: var(--text-primary); }
  .setup-head p { margin: 4px 0 0; color: var(--text-secondary); font-size: 12.5px; }
  .setup-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); gap: 14px; align-items: start; }
  .setup-panel { padding: 22px; border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--glass-border); }
  .seg-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
  .seg-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .seg-row, .subject-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
  .seg-btn, .subject-btn, .chapter-btn {
    border-radius: 11px; border: 1px solid var(--glass-border); background: transparent;
    color: var(--text-secondary); cursor: pointer; padding: 11px 13px;
    font-weight: 600; font-size: 12.5px; text-align: left; transition: var(--t-fast);
  }
  .seg-btn:hover, .subject-btn:hover, .chapter-btn:hover { border-color: var(--glass-border-mid); color: var(--text-primary); }
  .seg-btn { text-align: center; }
  .seg-btn.on { background: var(--gold-dim); color: var(--gold); border-color: var(--gold-glow); }
  .subject-btn { display: flex; align-items: center; gap: 9px; }
  .subject-btn span { width: 36px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .subject-btn.on { border-color: color-mix(in srgb, var(--accent) 55%, transparent); color: var(--text-primary); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .chapter-list { max-height: 280px; overflow: auto; display: grid; gap: 5px; padding-right: 4px; scrollbar-width: thin; }
  .chapter-btn { display: flex; align-items: center; gap: 9px; border-color: transparent; }
  .chapter-btn svg { opacity: 0.25; flex-shrink: 0; }
  .chapter-btn.on { color: var(--gold); background: var(--gold-dim); }
  .chapter-btn.on svg { opacity: 1; }
  .cbt-input { width: 100%; border-radius: 11px; border: 1px solid var(--glass-border); background: transparent; color: var(--text-primary); padding: 12px 13px; font-size: 13px; }
  .cbt-input:focus { outline: none; border-color: var(--gold-glow); }
  .cbt-range { width: 100%; accent-color: var(--gold); }
  .range-row { display: flex; justify-content: space-between; color: var(--text-muted); font-size: 10.5px; margin-top: 4px; }
  .setup-note { display: flex; align-items: center; gap: 7px; color: var(--text-muted); font-size: 11.5px; line-height: 1.5; margin: 8px 0 0; }
  .setup-summary {
    display: grid; grid-template-columns: 1fr; gap: 5px; padding: 14px 16px; margin-top: 22px;
    border-radius: 12px; border-left: 2px solid var(--gold);
    background: var(--gold-dim); color: var(--text-secondary); font-size: 12px; line-height: 1.55;
  }
  .setup-summary span { display: block; }
  .setup-summary strong { color: var(--gold); font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; }
  .setup-create { width: 100%; margin-top: 18px; font-size: 14px; }
  @media (max-width: 900px) { .setup-grid { grid-template-columns: 1fr; } }
  @media (max-width: 520px) { .seg-grid, .seg-grid.four { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const generationStyles = `
  .gen-card {
    min-height: 420px; display: flex; flex-direction: column; justify-content: center; align-items: center;
    gap: 14px; text-align: center; padding: 32px 24px; border-radius: 16px;
    background: var(--bg-surface); border: 1px solid var(--glass-border);
  }
  .gen-card svg { color: var(--gold); }
  .gen-card h1 { font-family: var(--font-display), 'Playfair Display', serif; font-weight: 600; margin: 0; font-size: 22px; color: var(--text-primary); }
  .gen-card p { max-width: 520px; margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.65; }
  .gen-bar { width: min(440px, 100%); height: 8px; border-radius: 999px; background: var(--bg-elevated); overflow: hidden; }
  .gen-bar span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--gold), var(--gold-bright)); transition: width .4s ease; }
  .gen-card strong { color: var(--gold); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .gen-hint { font-size: 11.5px; color: var(--text-muted); max-width: 420px; margin: 2px 0 0; }
`;

export const arenaStyles = `
  .proctor-camera-feed { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  body.cbt-exam-active .notify-dock,
  body.cbt-exam-active .notify-toast,
  body.cbt-exam-active .fab-toggle,
  body.cbt-exam-active .nav-shell,
  body.cbt-exam-active .nav-backdrop,
  body.cbt-exam-active .theme-toggle { display: none !important; }
  .arena-shell { position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 80; background: #eef3f8; color: #1f2937; display: flex; flex-direction: column; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }
  .arena-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 318px; }
  .arena-workspace { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; padding: 10px 12px 10px; gap: 8px; overflow: hidden; }
  @media (max-width: 980px) {
    .arena-main { grid-template-columns: 1fr; }
    .arena-workspace { padding: 10px 10px 84px; }
  }
  @media (max-width: 700px) and (orientation: landscape) {
    .arena-workspace { padding-bottom: 66px; }
  }
`;

export const topBarStyles = `
  .arena-top {
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
    height: 58px; padding: 0 18px;
    background: #1f5f99; border-bottom: 1px solid #17486f; color: #fff;
  }
  .arena-ident { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .arena-ident > svg { color: #dff3ff; flex-shrink: 0; }
  .arena-ident strong { display: block; font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; }
  .arena-ident span { display: flex; align-items: center; gap: 5px; color: #d7eafd; font-size: 10.5px; margin-top: 1px; white-space: nowrap; }
  .save-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
  .save-dot.saving { background: var(--gold); animation: cbt-soft-pulse 0.9s ease infinite; }
  .save-dot.saved { background: var(--success); }
  @keyframes cbt-soft-pulse { 50% { opacity: 0.35; } }
  .nta-clock { display: grid; justify-items: center; line-height: 1.1; }
  .nta-clock span { font-size: 11px; font-weight: 700; color: #d7eafd; text-transform: uppercase; letter-spacing: .08em; }
  .arena-timer { font-size: 23px; font-weight: 800; letter-spacing: 0.03em; color: #fff; font-variant-numeric: tabular-nums; }
  .arena-timer.low { color: #ffe066; animation: cbt-soft-pulse 1s ease infinite; }
  .arena-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .top-icon {
    width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
    border: 1px solid rgba(255,255,255,.45); background: rgba(255,255,255,.08); color: #fff; cursor: pointer; transition: var(--t-fast);
  }
  .top-icon:hover { background: rgba(255,255,255,.16); }
  .top-ghost {
    display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px;
    border-radius: 2px; border: 1px solid rgba(255,255,255,.45); background: rgba(255,255,255,.08);
    color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: var(--t-fast);
  }
  .top-ghost:hover { background: rgba(255,255,255,.16); }
  .top-submit {
    display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 16px;
    border-radius: 2px; border: 1px solid #b33a2c; background: #d9543f;
    color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: var(--t-fast);
  }
  .top-submit:hover { background: #c64230; }
  @media (max-width: 700px) {
    .arena-top { grid-template-columns: auto 1fr auto; height: auto; min-height: 52px; padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 6px max(10px, env(safe-area-inset-left)); gap: 8px; }
    .arena-ident strong { display: none; }
    .arena-ident span { display: none; }
    .arena-timer { justify-self: center; font-size: 18px; }
    .top-icon { display: none; }
    .top-ghost { min-height: 34px; padding: 0 10px; font-size: 12px; }
    .top-submit { min-height: 34px; padding: 0 12px; font-size: 12px; }
  }
`;

export const questionStyles = `
  .nta-subject-strip {
    display: flex; align-items: stretch; gap: 0; background: #d9e8f5; border: 1px solid #a9c2d8; min-height: 38px; overflow-x: auto;
  }
  .nta-subject-strip button {
    min-width: 130px; border: 0; border-right: 1px solid #a9c2d8; background: #eef6fd; color: #24435c;
    display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 700;
  }
  .nta-subject-strip button.active { background: #2f7dbd; color: #fff; }
  .nta-subject-strip b { min-width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,.1); font-size: 11px; }
  .question-panel {
    min-height: 0; overflow: auto;
    border-radius: 0; background: #fff; border: 1px solid #c7d6e2;
    padding: 0; scrollbar-width: thin;
  }
  .question-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 11px 16px; border-bottom: 1px solid #d7e2ec; background: #f5f9fd; margin: 0; }
  .q-no { font-size: 14px; font-weight: 800; color: #1f2937; }
  .q-total { margin-left: auto; color: #526476; font-size: 12px; font-weight: 700; }
  .q-type { flex-basis: 100%; color: #34495f; font-size: 12px; font-weight: 700; }
  .q-instruction { padding: 10px 16px; background: #fff8e7; border-bottom: 1px solid #ead7a8; color: #674d16; font-size: 12px; line-height: 1.45; }
  .question-text { font-size: 16px; line-height: 1.75; color: #111827; margin: 0; padding: 22px 24px 18px; max-width: 980px; }
  .question-text, .option-copy { overflow-wrap: anywhere; word-break: normal; }
  .question-text .katex-display, .option-copy .katex-display { max-width: 100%; overflow-x: auto; overflow-y: hidden; padding: 3px 0; }
  .question-visual { margin: 0 24px 18px; max-width: 860px; }
  .question-visual img { max-width: 100%; height: auto; border-radius: 0; background: #fff; padding: 8px; border: 1px solid #cbd5e1; display: block; }
  .option-list { display: grid; gap: 0; max-width: 980px; padding: 0 24px 24px; }
  .option-btn {
    display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 12px 10px;
    border-radius: 0; cursor: pointer; background: #fff;
    border: 0; border-bottom: 1px solid #e5edf4; color: #1f2937; text-align: left; transition: var(--t-fast);
  }
  .option-btn:hover:not(:disabled) { background: #f3f8fd; }
  .option-btn.selected { background: #e9f4ff; color: #111827; }
  .option-btn:disabled { cursor: not-allowed; opacity: .55; }
  .option-letter {
    width: 24px; height: 24px; border-radius: 50%; flex: 0 0 auto; display: grid; place-items: center;
    border: 1px solid #9aa8b5; color: #334155;
    font-weight: 700; font-size: 12px; transition: var(--t-fast); margin-top: 1px;
  }
  .option-btn.selected .option-letter { background: #2f7dbd; border-color: #2f7dbd; color: #fff; }
  .option-copy { min-width: 0; font-size: 14px; line-height: 1.6; padding-top: 2px; }
  @media (max-width: 700px) {
    .question-text { padding: 16px; }
    .option-list { padding: 0 16px 18px; }
    .question-text { font-size: 15px; }
  }
`;

export const paletteStyles = `
  .palette-panel { min-height: 0; border-left: 1px solid #9eb8ce; background: #e7f1fa; overflow: auto; scrollbar-width: thin; color: #1f2937; }
  .palette-body { padding: 12px 13px 16px; }
  .palette-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 10px; padding: 9px 10px; background: #2f7dbd; color: #fff; }
  .palette-head h2 { margin: 0; font-size: 13px; font-weight: 800; color: #fff; }
  .palette-head span { font-size: 11.5px; font-weight: 700; color: #eaf6ff; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .palette-grid {
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px;
    padding: 12px; background: #fff; border: 1px solid #bdd0df; max-height: min(52vh, 560px); overflow: auto;
  }
  .palette-cell {
    width: 42px; height: 34px; justify-self: center; border-radius: 3px; border: 1px solid #aab4bf;
    font-weight: 800; font-size: 12px; cursor: pointer; position: relative;
    background: #f5f5f5; color: #111827; transition: var(--t-fast);
  }
  .palette-cell:hover { filter: brightness(.97); }
  .palette-cell.current { outline: 3px solid #f2c94c; outline-offset: 1px; color: #111827; }
  .palette-cell.not-answered { background: #d83b31; border-color: #b92921; color: #fff; border-radius: 45% 45% 8px 8px; }
  .palette-cell.answered { background: #198754; border-color: #12683f; color: #fff; border-radius: 8px 8px 45% 45%; }
  .palette-cell.marked { background: #7b3fb2; border-color: #66308e; color: #fff; border-radius: 50%; }
  .palette-cell.answered-marked { background: #198754; border-color: #12683f; color: #fff; border-radius: 8px 8px 45% 45%; }
  .palette-cell.answered-marked::after {
    content: ''; position: absolute; right: -2px; top: -3px; width: 12px; height: 12px;
    border-radius: 50%; background: #7b3fb2; border: 2px solid #fff;
  }
  .palette-legend { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 12px; padding: 12px; background: #fff; border: 1px solid #bdd0df; }
  .palette-legend span { display: flex; align-items: center; gap: 9px; color: #1f2937; font-size: 11.5px; line-height: 1.25; }
  .palette-legend i { width: 22px; height: 18px; border-radius: 3px; background: #f5f5f5; border: 1px solid #aab4bf; flex-shrink: 0; }
  .palette-legend i.not-answered { background: #d83b31; border-color: #b92921; border-radius: 45% 45% 4px 4px; }
  .palette-legend i.answered { background: #198754; border-color: #12683f; border-radius: 4px 4px 45% 45%; }
  .palette-legend i.marked { background: #7b3fb2; border-color: #66308e; border-radius: 50%; }
  .palette-legend i.answered-marked { background: linear-gradient(135deg, #198754 62%, #7b3fb2 62%); border-color: #12683f; }
  .palette-legend b { margin-left: auto; color: #111827; font-variant-numeric: tabular-nums; font-size: 12px; }
  .palette-note { margin: 10px 0 0; padding: 9px 10px; background: #fff8e7; border: 1px solid #ead7a8; color: #674d16; font-size: 11.5px; line-height: 1.45; }
  .palette-mobile-toggle { display: none; }
  @media (max-width: 980px) {
    .palette-panel {
      position: fixed; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); width: min(330px, calc(100vw - 24px));
      max-height: 68vh; border: 1px solid #8aa9c3; border-radius: 0;
      transform: translateY(calc(100% - 50px)); transition: transform .25s var(--ease-in-out);
      z-index: 85; box-shadow: 0 14px 34px rgba(15,23,42,0.22); overflow: hidden;
    }
    .palette-panel.open { transform: translateY(0); overflow: auto; }
    .palette-mobile-toggle {
      display: block; width: 100%; height: 50px; background: #2f7dbd; border: 0;
      color: #fff; font-weight: 800; font-size: 12.5px; cursor: pointer;
    }
    .palette-grid { max-height: 38vh; }
  }
`;

export const controlStyles = `
  .controls-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    min-height: 58px; padding: 8px 10px; background: #fff; border: 1px solid #c7d6e2;
  }
  .controls-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ctl {
    min-height: 36px; padding: 0 14px; border-radius: 2px;
    border: 1px solid #9aa8b5; background: #f7fafc; color: #1f2937;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    cursor: pointer; font-weight: 700; font-size: 12.5px; transition: var(--t-fast);
  }
  .ctl:hover:not(:disabled) { background: #e9f4ff; border-color: #5d93c4; }
  .ctl:disabled { opacity: .38; cursor: not-allowed; }
  .ctl.mark { background: #7b3fb2; border-color: #66308e; color: #fff; }
  .ctl.mark:hover:not(:disabled) { background: #6d349f; border-color: #5a287f; color: #fff; }
  .ctl.primary { background: #2f7dbd; border-color: #246797; color: #fff; font-weight: 800; padding: 0 20px; }
  .ctl.primary:hover:not(:disabled) { background: #236da9; color: #fff; }
  @media (max-width: 700px) {
    .controls-bar { gap: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
    .controls-group { flex: 1; }
    .controls-group:last-child { justify-content: flex-end; }
    .ctl { padding: 0 12px; font-size: 12px; min-height: 40px; }
    .ctl.primary { padding: 0 14px; }
  }
`;

export const pauseStyles = `
  .pause-overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: rgba(2,2,6,.82); backdrop-filter: blur(6px); padding: 20px; }
  .pause-card {
    width: min(440px, 100%); text-align: center; display: grid; gap: 12px; justify-items: center;
    border-radius: 18px; padding: 34px 28px; background: var(--bg-raised); border: 1px solid var(--glass-border-mid);
  }
  .pause-card svg { color: var(--gold); }
  .pause-card-violation { border-color: hsla(0,72%,62%,.4); }
  .pause-card-violation svg { color: var(--danger); }
  .pause-card-violation p strong { color: var(--danger); }
  .pause-card h2 { margin: 0; font-family: var(--font-display), 'Playfair Display', serif; font-weight: 600; font-size: 21px; color: var(--text-primary); }
  .pause-card p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
  .pause-card span { color: var(--gold); font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
  .pause-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 6px; }
`;

export const submitStyles = `
  .submit-overlay { position: fixed; inset: 0; z-index: 105; display: grid; place-items: center; background: rgba(2,2,6,.78); backdrop-filter: blur(6px); padding: 20px; }
  .submit-card {
    position: relative; width: min(440px, 100%); text-align: center; display: grid; gap: 12px; justify-items: center;
    border-radius: 18px; padding: 32px 26px 26px; background: var(--bg-raised); border: 1px solid var(--glass-border-mid);
  }
  .submit-card svg { color: var(--gold); }
  .submit-card h2 { margin: 0; font-family: var(--font-display), 'Playfair Display', serif; font-weight: 600; font-size: 20px; color: var(--text-primary); }
  .submit-card p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.65; }
  .modal-close { position: absolute; right: 12px; top: 12px; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
  .modal-close:hover { color: var(--text-primary); }
  .submit-actions { display: flex; gap: 10px; width: 100%; margin-top: 8px; }
  .submit-actions > * { flex: 1; }
  .delete-attempt-card > svg { color: var(--danger); }
  .delete-attempt-card > p strong { color: var(--text-primary); }
`;

export const resultStyles = `
  .result-hero {
    text-align: center; padding: 30px 24px 26px; border-radius: 18px;
    background: linear-gradient(135deg, var(--gold-dim), transparent 65%), var(--bg-surface);
    border: 1px solid var(--gold-glow);
  }
  .result-kicker { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }
  .result-score strong { font-size: 52px; font-weight: 700; color: var(--gold-bright); line-height: 1; font-variant-numeric: tabular-nums; }
  .result-score span { font-size: 18px; color: var(--text-muted); margin-left: 4px; }
  .result-sub { margin: 8px 0 18px; color: var(--text-secondary); font-size: 13px; }
  .result-metrics { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 20px; }
  .result-metrics span { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-secondary); }
  .result-metrics .rm-good { color: var(--success); }
  .result-metrics .rm-bad { color: var(--danger); }
  .subject-score-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
  .subject-score { padding: 14px 16px; border-radius: 14px; background: var(--bg-surface); border: 1px solid var(--glass-border); }
  .subject-score strong { display: block; font-size: 12px; font-weight: 650; color: var(--text-primary); }
  .subject-score span { display: block; color: var(--gold); font-weight: 700; font-size: 19px; margin: 3px 0 1px; font-variant-numeric: tabular-nums; }
  .subject-score em { display: block; color: var(--text-muted); font-size: 11px; font-style: normal; }
  .result-fed { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--text-secondary); font-size: 12.5px; margin: 0; }
  .result-fed a { color: var(--gold); font-weight: 700; }
  @media (max-width: 760px) { .subject-score-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

export const reviewStyles = `
  .review-tabs { display: flex; gap: 7px; margin: 18px 0 12px; }
  .review-tabs button {
    border-radius: 999px; border: 1px solid var(--glass-border); background: transparent;
    color: var(--text-secondary); padding: 8px 16px; cursor: pointer;
    font-weight: 600; font-size: 12px; text-transform: capitalize; transition: var(--t-fast);
  }
  .review-tabs button.on { color: var(--gold); background: var(--gold-dim); border-color: var(--gold-glow); }
  .review-headline { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
  .review-headline > div { display: grid; gap: 3px; }
  .review-headline strong { color: var(--text-primary); font-size: 15px; }
  .review-headline span { color: var(--text-muted); font-size: 12px; }
  .review-pdf { display: inline-flex; align-items: center; gap: 7px; padding: 9px 12px; border-radius: 10px; background: var(--gold-dim); border: 1px solid var(--gold-glow); color: var(--gold); font-size: 12px; font-weight: 700; text-decoration: none; }
  .review-save-error { margin: 0 0 10px; color: var(--danger); font-size: 12px; }
  .review-list { display: grid; gap: 12px; }
  .review-card { padding: 20px 22px; border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--glass-border); }
  .review-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; margin-bottom: 14px; color: var(--text-muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .review-meta span { display: inline-flex; align-items: center; }
  .review-meta span:not(:last-child)::after { content: '·'; margin: 0 8px; color: var(--text-muted); opacity: 0.5; }
  .review-meta span:first-child { color: var(--gold); }
  .review-options { display: grid; gap: 7px; margin-top: 14px; }
  .review-option {
    display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 11px; align-items: start;
    padding: 11px 13px; border-radius: 11px; background: transparent;
    border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 13px;
  }
  .review-option b { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--glass-border-mid); color: var(--text-secondary); font-size: 11px; font-weight: 700; }
  .review-option.key { border-color: color-mix(in srgb, var(--success) 40%, transparent); background: hsla(142,60%,48%,.07); color: var(--text-primary); }
  .review-option.key b { background: var(--success); border-color: var(--success); color: hsl(150, 40%, 10%); }
  .review-option.key svg { color: var(--success); margin-top: 3px; }
  .review-option.wrong { border-color: color-mix(in srgb, var(--danger) 40%, transparent); background: hsla(0,72%,62%,.06); }
  .review-option.wrong svg { color: var(--danger); margin-top: 3px; }
  .review-option-copy { min-width: 0; }
  .option-rationale { margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--glass-border); color: var(--text-muted); font-size: 12px; }
  .review-visual { display: block; max-width: min(100%, 760px); max-height: 420px; object-fit: contain; margin: 14px 0; padding: 8px; background: #fff; border: 1px solid var(--glass-border); }
  .review-explanation { margin-top: 14px; padding: 13px 16px; border-radius: 11px; border-left: 2px solid var(--gold); background: var(--gold-dim); color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
  .review-explanation strong { display: block; color: var(--gold); margin-bottom: 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; }
  .mistake-reflection { margin-top: 14px; padding: 14px; border-radius: 12px; background: var(--bg-elevated); border: 1px solid var(--glass-border); }
  .mistake-title { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
  .mistake-title strong { font-size: 12.5px; color: var(--text-primary); }
  .mistake-title span { display: inline-flex; align-items: center; gap: 5px; color: var(--success); font-size: 11px; font-weight: 700; }
  .mistake-buttons { display: flex; flex-wrap: wrap; gap: 7px; }
  .mistake-buttons button { border: 1px solid var(--glass-border); background: transparent; color: var(--text-secondary); border-radius: 999px; padding: 7px 10px; font-size: 11.5px; font-weight: 650; cursor: pointer; }
  .mistake-buttons button.on { border-color: var(--gold); background: var(--gold-dim); color: var(--gold); }
  .custom-mistake-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-top: 10px; align-items: end; }
  .custom-mistake-row textarea { min-height: 76px; resize: vertical; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--bg-surface); color: var(--text-primary); padding: 10px; font: inherit; font-size: 12.5px; }
  .custom-mistake-row button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; border: 1px solid var(--gold-glow); background: var(--gold-dim); color: var(--gold); border-radius: 9px; padding: 0 11px; font-size: 11.5px; font-weight: 700; cursor: pointer; }
  @media (max-width: 700px) { .review-headline, .mistake-title { align-items: flex-start; flex-direction: column; } .custom-mistake-row { grid-template-columns: 1fr; } }
`;

export const allCBTStyles = [
  globalCBTStyles,
  listStyles,
  setupStyles,
  generationStyles,
  arenaStyles,
  topBarStyles,
  questionStyles,
  paletteStyles,
  controlStyles,
  pauseStyles,
  submitStyles,
  resultStyles,
  reviewStyles,
].join("\n");
