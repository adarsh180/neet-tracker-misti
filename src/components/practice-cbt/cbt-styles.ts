// Visual system for the CBT Practice Arena.
// Principles: one surface level (no nested boxed chips), one accent (gold),
// semantic NTA colors confined to the palette, weights 600-700, generous whitespace.

export const listStyles = `
  .cbt-list-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 22px; padding-right: 52px; }
  .cbt-brand-mark { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: var(--gold); background: var(--gold-dim); border: 1px solid var(--gold-glow); }
  .cbt-list-head div:nth-child(2) { flex: 1; min-width: 240px; }
  .cbt-list-head h1 { font-family: var(--font-display), 'Playfair Display', serif; font-size: 23px; font-weight: 600; margin: 0; color: var(--text-primary); }
  .cbt-list-head p { margin: 3px 0 0; color: var(--text-secondary); font-size: 12.5px; }
  .cbt-test-list { display: grid; gap: 8px; }
  .cbt-test-row { display: flex; align-items: center; gap: 12px; padding: 15px 18px; border-radius: 14px; background: var(--bg-surface); border: 1px solid var(--glass-border); transition: var(--t-fast); }
  .cbt-test-row:hover { border-color: var(--glass-border-mid); }
  .cbt-test-main { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; color: var(--text-primary); cursor: pointer; padding: 0; }
  .cbt-test-main strong { display: block; font-size: 13.5px; font-weight: 600; }
  .cbt-test-main span { display: block; color: var(--text-muted); font-size: 11.5px; margin-top: 3px; }
  .cbt-test-chip { flex-shrink: 0; font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.02em; }
  .cbt-test-chip-completed { color: var(--gold); }
  .cbt-test-chip-ready, .cbt-test-chip-running, .cbt-test-chip-paused { color: var(--success); }
  .cbt-test-chip-generating { color: var(--text-secondary); }
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
`;

export const arenaStyles = `
  body.cbt-exam-active .notify-dock,
  body.cbt-exam-active .notify-toast,
  body.cbt-exam-active .fab-toggle,
  body.cbt-exam-active .nav-shell,
  body.cbt-exam-active .nav-backdrop,
  body.cbt-exam-active .theme-toggle { display: none !important; }
  .arena-shell { position: fixed; inset: 0; z-index: 80; background: var(--bg-base); color: var(--text-primary); display: flex; flex-direction: column; }
  .arena-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 296px; }
  .arena-workspace { min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; padding: 16px 18px 14px; gap: 12px; overflow: hidden; }
  @media (max-width: 980px) {
    .arena-main { grid-template-columns: 1fr; }
    .arena-workspace { padding: 12px 12px 84px; }
  }
`;

export const topBarStyles = `
  .arena-top {
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
    height: 58px; padding: 0 18px;
    background: var(--bg-surface); border-bottom: 1px solid var(--glass-border);
  }
  .arena-ident { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .arena-ident > svg { color: var(--gold); flex-shrink: 0; }
  .arena-ident strong { display: block; font-size: 13px; font-weight: 650; color: var(--text-primary); white-space: nowrap; }
  .arena-ident span { display: flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: 10.5px; margin-top: 1px; white-space: nowrap; }
  .save-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
  .save-dot.saving { background: var(--gold); animation: cbt-soft-pulse 0.9s ease infinite; }
  .save-dot.saved { background: var(--success); }
  @keyframes cbt-soft-pulse { 50% { opacity: 0.35; } }
  .arena-timer {
    font-size: 21px; font-weight: 700; letter-spacing: 0.03em;
    color: var(--text-primary); font-variant-numeric: tabular-nums;
  }
  .arena-timer.low { color: var(--danger); animation: cbt-soft-pulse 1s ease infinite; }
  .arena-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .top-icon {
    width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
    border: 1px solid var(--glass-border); background: transparent; color: var(--text-secondary); cursor: pointer; transition: var(--t-fast);
  }
  .top-icon:hover { color: var(--text-primary); border-color: var(--glass-border-mid); }
  .top-ghost {
    display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px;
    border-radius: 10px; border: 1px solid var(--glass-border); background: transparent;
    color: var(--text-secondary); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: var(--t-fast);
  }
  .top-ghost:hover { color: var(--text-primary); border-color: var(--glass-border-mid); }
  .top-submit {
    display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 16px;
    border-radius: 10px; border: 1px solid var(--gold-glow); background: var(--gold-dim);
    color: var(--gold); font-size: 12.5px; font-weight: 700; cursor: pointer; transition: var(--t-fast);
  }
  .top-submit:hover { background: hsla(38, 72%, 58%, 0.18); }
  @media (max-width: 700px) {
    .arena-top { grid-template-columns: auto 1fr auto; height: auto; min-height: 52px; padding: 6px 10px; gap: 8px; }
    .arena-ident strong { display: none; }
    .arena-ident span { display: none; }
    .arena-timer { justify-self: center; font-size: 18px; }
    .top-icon { display: none; }
    .top-ghost { min-height: 34px; padding: 0 10px; font-size: 12px; }
    .top-submit { min-height: 34px; padding: 0 12px; font-size: 12px; }
  }
`;

export const questionStyles = `
  .question-panel {
    min-height: 0; overflow: auto;
    border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--glass-border);
    padding: 26px 30px 30px; scrollbar-width: thin;
  }
  .question-meta { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
  .q-no { font-size: 14px; font-weight: 700; color: var(--text-primary); }
  .q-no i { font-style: normal; color: var(--text-muted); font-weight: 500; font-size: 12.5px; }
  .q-tag { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.07em; }
  .q-diff { font-size: 11.5px; font-weight: 600; letter-spacing: 0.03em; display: inline-flex; align-items: center; gap: 5px; }
  .q-diff::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .q-diff-easy { color: var(--success); }
  .q-diff-moderate { color: var(--gold); }
  .q-diff-tough { color: var(--danger); }
  .question-text { font-size: 16px; line-height: 1.8; color: var(--text-primary); margin-bottom: 24px; }
  .option-list { display: grid; gap: 9px; max-width: 860px; }
  .option-btn {
    display: flex; align-items: flex-start; gap: 13px; width: 100%; padding: 14px 16px;
    border-radius: 13px; cursor: pointer; background: transparent;
    border: 1px solid var(--glass-border); color: var(--text-secondary); text-align: left; transition: var(--t-fast);
  }
  .option-btn:hover:not(:disabled) { border-color: var(--glass-border-mid); color: var(--text-primary); }
  .option-btn.selected { background: var(--gold-dim); border-color: var(--gold); color: var(--text-primary); }
  .option-btn:disabled { cursor: not-allowed; opacity: .55; }
  .option-letter {
    width: 27px; height: 27px; border-radius: 50%; flex: 0 0 auto; display: grid; place-items: center;
    border: 1px solid var(--glass-border-mid); color: var(--text-secondary);
    font-weight: 700; font-size: 12px; transition: var(--t-fast); margin-top: 1px;
  }
  .option-btn.selected .option-letter { background: var(--gold); border-color: var(--gold); color: hsl(25, 32%, 11%); }
  .option-copy { min-width: 0; font-size: 14px; line-height: 1.6; padding-top: 3px; }
  @media (max-width: 700px) {
    .question-panel { padding: 18px 16px 22px; border-radius: 14px; }
    .question-text { font-size: 15px; }
  }
`;

export const paletteStyles = `
  .palette-panel { min-height: 0; border-left: 1px solid var(--glass-border); background: var(--bg-surface); overflow: auto; scrollbar-width: thin; }
  .palette-body { padding: 18px 16px; }
  .palette-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
  .palette-head h2 { margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--text-muted); }
  .palette-head span { font-size: 11.5px; font-weight: 700; color: var(--gold); font-variant-numeric: tabular-nums; }
  .palette-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .palette-cell {
    aspect-ratio: 1; border-radius: 9px; border: 1px solid transparent;
    font-weight: 600; font-size: 12px; cursor: pointer; position: relative;
    background: var(--bg-elevated); color: var(--text-muted); transition: var(--t-fast);
  }
  .palette-cell.current { box-shadow: 0 0 0 2px var(--gold); color: var(--text-primary); }
  .palette-cell.not-answered { background: hsla(0,72%,62%,.13); color: hsl(0, 70%, 74%); }
  .palette-cell.answered { background: hsla(142,60%,48%,.16); color: hsl(142, 55%, 68%); }
  .palette-cell.marked { background: hsla(285,38%,54%,.18); color: hsl(285, 50%, 76%); }
  .palette-cell.answered-marked { background: hsla(142,60%,48%,.16); color: hsl(142, 55%, 68%); }
  .palette-cell.answered-marked::after {
    content: ''; position: absolute; right: 4px; top: 4px; width: 6px; height: 6px;
    border-radius: 50%; background: hsl(285, 50%, 66%);
  }
  .palette-legend { display: grid; grid-template-columns: 1fr; gap: 7px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--glass-border); }
  .palette-legend span { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 11px; }
  .palette-legend i { width: 13px; height: 13px; border-radius: 4px; background: var(--bg-elevated); flex-shrink: 0; }
  .palette-legend i.not-answered { background: hsla(0,72%,62%,.3); }
  .palette-legend i.answered { background: hsla(142,60%,48%,.35); }
  .palette-legend i.marked { background: hsla(285,38%,54%,.4); }
  .palette-legend i.answered-marked { background: linear-gradient(135deg, hsla(142,60%,48%,.4) 55%, hsla(285,38%,54%,.55) 55%); }
  .palette-legend b { margin-left: auto; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .palette-mobile-toggle { display: none; }
  @media (max-width: 980px) {
    .palette-panel {
      position: fixed; right: 12px; bottom: 12px; width: min(330px, calc(100vw - 24px));
      max-height: 68vh; border: 1px solid var(--glass-border-mid); border-radius: 16px;
      transform: translateY(calc(100% - 50px)); transition: transform .25s var(--ease-in-out);
      z-index: 85; box-shadow: 0 18px 50px rgba(0,0,0,0.45); overflow: hidden;
    }
    .palette-panel.open { transform: translateY(0); overflow: auto; }
    .palette-mobile-toggle {
      display: block; width: 100%; height: 50px; background: transparent; border: 0;
      color: var(--gold); font-weight: 700; font-size: 12.5px; cursor: pointer;
    }
  }
`;

export const controlStyles = `
  .controls-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .controls-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ctl {
    min-height: 42px; padding: 0 16px; border-radius: 11px;
    border: 1px solid var(--glass-border); background: transparent; color: var(--text-secondary);
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    cursor: pointer; font-weight: 600; font-size: 12.5px; transition: var(--t-fast);
  }
  .ctl:hover:not(:disabled) { color: var(--text-primary); border-color: var(--glass-border-mid); }
  .ctl:disabled { opacity: .38; cursor: not-allowed; }
  .ctl.mark { color: hsl(285, 50%, 74%); }
  .ctl.mark:hover { color: hsl(285, 55%, 82%); border-color: hsla(285,38%,54%,.4); }
  .ctl.primary { background: var(--gold-dim); border-color: var(--gold-glow); color: var(--gold); font-weight: 700; padding: 0 20px; }
  .ctl.primary:hover { background: hsla(38, 72%, 58%, 0.18); }
  @media (max-width: 700px) {
    .controls-bar { gap: 8px; }
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
  .review-explanation { margin-top: 14px; padding: 13px 16px; border-radius: 11px; border-left: 2px solid var(--gold); background: var(--gold-dim); color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
  .review-explanation strong { display: block; color: var(--gold); margin-bottom: 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; }
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
