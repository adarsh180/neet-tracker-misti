// Builds the verified, merged NEET PG + NEET SS syllabus seed and an audit log.
// Inputs: pg-parsed.json (PG taxonomy PDF), the SS JSON, old app data, enrich.txt
// (additions taken from the official NBEMS DNB/DrNB curricula).
const fs = require("fs");
const path = require("path");
const { PG_CHMAP, SS_FEEDER_CHMAP, SS_PAPER_DROP } = require("./chmaps.cjs");
const D = __dirname;
const pdfPg = JSON.parse(fs.readFileSync(path.join(D, "pg-parsed.json"), "utf8"));
const ssJson = JSON.parse(fs.readFileSync("C:/Users/Adarsh/Downloads/NEET_SS_Database_Ready_Syllabus.json", "utf8"));
const oldPg = JSON.parse(fs.readFileSync(path.join(D, "old/old-pg.json"), "utf8"));
const oldSs = JSON.parse(fs.readFileSync(path.join(D, "old/old-ss.json"), "utf8"));
const enrichSrc = fs.readdirSync(D).filter((f) => /^enrich.*\.txt$/.test(f)).sort().map((f) => fs.readFileSync(path.join(D, f), "utf8")).join("\n");

/* ── text helpers ─────────────────────────────────────────────────────── */
const STOP = new Set("a an the of and or in on to for with by from as at its vs versus including other others related basic basics general principles approach management clinical disease diseases disorder disorders syndrome syndromes".split(" "));
const stem = (w) => w.replace(/(ies)$/, "y").replace(/(sses)$/, "ss").replace(/([^s])s$/, "$1").replace(/(ing)$/, "").replace(/aemia/g, "emia").replace(/oe/g, "e").replace(/ae/g, "e");
const ABBR = { acs: "acute coronary syndrome", ibd: "inflammatory bowel", ckd: "chronic kidney", aki: "acute kidney injury", copd: "chronic obstructive pulmonary", ild: "interstitial lung", tb: "tuberculosis", dvt: "deep vein thrombosis", gi: "gastrointestinal", cns: "central nervous system", ecg: "electrocardiogram", ekg: "electrocardiogram", bph: "benign prostatic hyperplasia", luts: "lower urinary tract", uti: "urinary tract infection", sle: "systemic lupus", ards: "acute respiratory distress", mi: "myocardial infarction", cad: "coronary artery", aml: "acute myeloid leukemia", cml: "chronic myeloid leukemia", cll: "chronic lymphocytic leukemia", itp: "immune thrombocytopenia", ttp: "thrombotic thrombocytopenic", dic: "disseminated intravascular coagulation", gerd: "gastroesophageal reflux", hcc: "hepatocellular carcinoma", pcos: "polycystic ovary", gdm: "gestational diabetes", pph: "postpartum haemorrhage", cvs: "cardiovascular", ans: "autonomic", ctev: "clubfoot talipes", ddh: "developmental dysplasia hip", acl: "anterior cruciate", mnd: "motor neuron", gbs: "guillain barre", sah: "subarachnoid haemorrhage", icp: "intracranial pressure", ncd: "non-communicable" };
const toks = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).flatMap((w) => (ABBR[w] ? ABBR[w].split(" ") : [w])).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
const tset = (s) => new Set(toks(s));
const jac = (a, b) => { const A = tset(a), B = tset(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const contains = (big, small) => { const B = big instanceof Set ? big : tset(big); const S = tset(small); if (!S.size) return false; for (const x of S) if (!B.has(x)) return false; return true; };
const cap = (s) => { s = String(s).trim().replace(/\s+/g, " "); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const subName = (s) => String(s).trim().replace(/\s+/g, " ");

/* ── canonical shapes ─────────────────────────────────────────────────── */
// chapter: { name, detail?, src, topics: [{ name, detail?, src, subtopics: [{ name, src }] }] }
const T = (name, subs = [], src = "") => ({ name: cap(name), src, subtopics: subs.map((s) => ({ name: subName(s), src })) });
const C = (name, topics = [], src = "") => ({ name: cap(name), src, topics });

const audit = [];
const log = (scope, what, n = 1, sample = "") => audit.push({ scope, what, n, sample });

/** Fold `other` chapters into `base` chapters (mutates base). IDF-weighted matching:
 * specific words (e.g. "tamponade") count far more than generic ones ("disease"). */
function mergeInto(scope, base, other, srcLabel, chmap = null) {
  const st = { covered: 0, mergedTopics: 0, addedSubs: 0, addedTopics: 0, addedChapters: 0, samples: { covered: [], added: [], chapters: [], weak: [] } };
  // Document frequencies over every name in both sides.
  const names = [...base, ...other].flatMap((c) => [c.name, ...c.topics.flatMap((t) => [t.name, ...t.subtopics.map((x) => x.name)])]);
  const df = new Map(); for (const n of names) for (const w of tset(n)) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) => Math.log(1 + names.length / (df.get(w) || 1));
  const wj = (x, y) => { const A = x instanceof Set ? x : tset(x), B = y instanceof Set ? y : tset(y); if (!A.size || !B.size) return 0; let i = 0, u = 0; for (const w of new Set([...A, ...B])) { const v = idf(w); u += v; if (A.has(w) && B.has(w)) i += v; } return u ? i / u : 0; };
  const blob = (c) => tset(`${c.name} ${c.topics.map((t) => t.name).join(" ")}`);
  const cover = (small, big) => { let i = 0, u = 0; for (const w of small) { const v = idf(w); u += v; if (big.has(w)) i += v; } return u ? i / u : 0; };
  const affinity = (oc, bc) => { const bb = new Set([...blob(bc), ...bc.topics.flatMap((t) => t.subtopics.flatMap((x) => [...tset(x.name)]))]); return 0.55 * cover(tset(oc.name), bb) + 0.25 * cover(blob(oc), bb) + 0.2 * wj(oc.name, bc.name); };
  const addSubs = (t, subs) => { for (const sb of subs) if (!t.subtopics.some((x) => jac(x.name, sb.name) >= 0.7 || contains(x.name, sb.name))) { t.subtopics.push({ name: sb.name, src: srcLabel }); st.addedSubs++; } };
  const findCh = (name) => base.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const sameOrCovered = (ot, target = null) => {
    const pool = base.flatMap((c) => c.topics.map((t) => ({ c, t })));
    let match = null, best = 0;
    for (const p of pool) { const sc = wj(ot.name, p.t.name); if (sc > best) { best = sc; match = p; } }
    if (match && (best >= 0.62 || (tset(ot.name).size >= 2 && contains(match.t.name, ot.name)))) { st.mergedTopics++; addSubs(match.t, ot.subtopics); return true; }
    // A near-twin that has no subtopics yet (an app topic) takes this topic's subtopics instead of gaining a sibling.
    if (match && target && match.c === target && (best >= 0.45 || contains(match.t.name, ot.name)) && !match.t.subtopics.length && ot.subtopics.length) { st.mergedTopics++; addSubs(match.t, ot.subtopics); if (st.samples.weak.length < 12) st.samples.weak.push(`${ot.name} ⇢ ${match.t.name} (${best.toFixed(2)})`); return true; }
    const cov = pool.find((p) => contains(p.t.name, ot.name) || (!ot.subtopics.length && p.t.subtopics.some((x) => contains(x.name, ot.name))));
    if (cov) { st.covered++; if (st.samples.covered.length < 6) st.samples.covered.push(`${ot.name} ⊂ ${cov.t.name}`); addSubs(cov.t, ot.subtopics); return true; }
    return false;
  };
  for (const oc of other) {
    // Explicit placement wins over heuristics.
    const mapped = chmap && Object.prototype.hasOwnProperty.call(chmap, oc.name) ? chmap[oc.name] : undefined;
    if (mapped !== undefined) {
      const free = mapped.startsWith("*");
      const tname = mapped.replace(/^\*/, "") || oc.name;
      let target = findCh(tname);
      if (!target) { target = { name: cap(tname), topics: [], src: srcLabel }; base.push(target); st.addedChapters++; if (st.samples.chapters.length < 10) st.samples.chapters.push(tname); }
      for (const ot of oc.topics) {
        if (sameOrCovered(ot, free ? null : target)) continue;
        let home = target;
        if (free) {
          let hs = 0, h = null;
          for (const bc of base) { const sc = Math.max(wj(ot.name, bc.name), ...bc.topics.map((t) => wj(ot.name, t.name))); if (sc > hs) { hs = sc; h = bc; } }
          if (h && hs >= 0.5) home = h;
        }
        home.topics.push({ ...ot, src: srcLabel }); st.addedTopics++;
        if (st.samples.added.length < 10) st.samples.added.push(`${ot.name} → ${home.name}`);
      }
      continue;
    }
    const ocb = blob(oc);
    let aff = null, affScore = 0;
    for (const bc of base) { const sc = affinity(oc, bc); if (sc > affScore) { affScore = sc; aff = bc; } }
    let fallback = null;
    for (const ot of oc.topics) {
      const pool = base.flatMap((c) => c.topics.map((t) => ({ c, t })));
      // 1) the same topic → merge its subtopics
      let match = null, best = 0;
      for (const p of pool) { const sc = wj(ot.name, p.t.name); if (sc > best) { best = sc; match = p; } }
      if (match && (best >= 0.62 || (tset(ot.name).size >= 2 && contains(match.t.name, ot.name)))) { st.mergedTopics++; addSubs(match.t, ot.subtopics); continue; }
      // 2) covered: one topic or subtopic name already contains it
      const cov = pool.find((p) => contains(p.t.name, ot.name) || (!ot.subtopics.length && p.t.subtopics.some((x) => contains(x.name, ot.name))));
      if (cov) { st.covered++; if (st.samples.covered.length < 6) st.samples.covered.push(`${ot.name} ⊂ ${cov.t.name}`); addSubs(cov.t, ot.subtopics); continue; }
      // 3) best home chapter for this topic
      let home = null, hs = 0;
      for (const bc of base) {
        const sc = Math.max(wj(ot.name, bc.name), ...bc.topics.map((t) => wj(ot.name, t.name)), ...bc.topics.flatMap((t) => t.subtopics.map((x) => 0.8 * wj(ot.name, x.name)))) + (bc === aff ? 0.25 * affScore : 0);
        if (sc > hs) { hs = sc; home = bc; }
      }
      if (home && hs >= 0.55) { home.topics.push({ ...ot, src: srcLabel }); st.addedTopics++; if (st.samples.added.length < 10) st.samples.added.push(`${ot.name} → ${home.name} (${hs.toFixed(2)})`); continue; }
      if (!fallback) {
        if (aff && affScore >= 0.42) fallback = aff;
        else { fallback = { ...oc, topics: [], src: srcLabel }; base.push(fallback); st.addedChapters++; if (st.samples.chapters.length < 10) st.samples.chapters.push(oc.name); }
      }
      fallback.topics.push({ ...ot, src: srcLabel }); st.addedTopics++;
      if (fallback !== aff || true) if (st.samples.weak.length < 6) st.samples.weak.push(`${ot.name} ⇒ ${fallback.name}`);
    }
  }
  log(scope, `merge ${srcLabel}`, 1, JSON.stringify(st));
  return st;
}

/* ═══════════════════════════ NEET PG ═══════════════════════════ */
const PG_MAP = { "Anatomy": "anatomy", "Physiology": "physiology", "Biochemistry": "biochemistry", "Pathology": "pathology", "Pharmacology": "pharmacology", "Microbiology": "microbiology", "Forensic Medicine and Toxicology": "forensic", "Community Medicine": "community", "General Medicine": "medicine", "General Surgery": "surgery", "Obstetrics and Gynaecology": "obg", "Paediatrics": "paediatrics", "Ophthalmology": "ophthalmology", "Otorhinolaryngology": "ent", "Orthopaedics": "orthopaedics", "Anaesthesiology": "anaesthesia", "Radiodiagnosis": "radiology", "Psychiatry": "psychiatry", "Dermatology, Venereology and Leprosy": "dermatology" };
const EBM = "Evidence-based medicine and research", CLIN = "Clinical methods and diagnostic reasoning";
// Chapters in the PDF that belong to another subject or are pasted templates.
const PG_DROP = {
  pathology: [EBM, "General oncology principles", "Advanced oncopathology and integrated molecular reporting"],
  pharmacology: [EBM, "Cellular, molecular and systemic mechanisms", "Medical genetics and genomics"],
  microbiology: [EBM, "Cellular, molecular and systemic mechanisms", "Medical genetics and genomics"],
  medicine: [EBM, "Cellular, molecular and systemic mechanisms"],
  surgery: [EBM],
  obg: [EBM, CLIN, "General oncology principles", "Anesthesia physiology, pharmacology and preassessment", "Medical genetics and genomics"],
  paediatrics: [EBM],
  ent: [EBM, CLIN, "General oncology principles", "Airway management and ventilation"],
  orthopaedics: [EBM, CLIN, "Operative principles and perioperative care", "Trauma, shock and acute surgical care", "Plastic reconstructive and burn surgery"],
  anaesthesia: [EBM, CLIN],
  radiology: [EBM, CLIN, "Cardiovascular investigations"],
  psychiatry: [EBM, CLIN, "Growth, development and preventive pediatrics"],
};
// Where the app's own chapter set is the better backbone (the PDF's are thin PG-exit adaptations).
const PG_APP_BACKBONE = new Set(["pathology", "pharmacology", "microbiology"]);

const pdfChapters = (s) => s.chapters.map((c) => C(c.name, c.topics.map((t) => T(t.name, t.subtopics, "pdf")), "pdf"));
const oldChapters = (s) => s.chapters.map((c) => C(c.name, (c.topics.length ? c.topics : [c.name]).map((t) => T(t, [], "app")), "app"));

const PG = [];
for (const os of oldPg) {
  const ps = pdfPg.find((p) => PG_MAP[p.name] === os.key);
  let pdf = pdfChapters(ps);
  const drops = PG_DROP[os.key] || [];
  const dropped = pdf.filter((c) => drops.includes(c.name));
  if (dropped.length) log(`pg/${os.key}`, "dropped PDF chapters (misplaced or pasted template)", dropped.length, dropped.map((c) => c.name).join("; "));
  pdf = pdf.filter((c) => !drops.includes(c.name));
  const app = oldChapters(os);
  let chapters;
  chapters = app; mergeInto(`pg/${os.key}`, chapters, pdf, "pdf", PG_CHMAP[os.key] || {});
  PG.push({ key: os.key, name: os.name, group: os.group, hue: os.hue, weight: os.weight, role: "subject", chapters });
}

/* ═══════════════════════════ NEET SS ═══════════════════════════ */
// Official NBEMS NEET-SS 2025 bulletin, Tables 1–2 (pp. 67–69): 15 question-paper groups.
const GROUP_KEYS = { G01: "medical", G02: "surgical", G03: "orthopaedics", G04: "paediatric", G05: "obg", G06: "anaesthesia", G07: "radiodiagnosis", G08: "respiratory", G09: "microbiology", G10: "pathology", G11: "psychiatry", G12: "pharmacology", G13: "ent", G14: "critical-care", G15: "medical-oncology" };
const FEEDER = { G01: "MD/DNB General Medicine", G02: "MS/DNB General Surgery", G03: "MS/DNB Orthopaedics", G04: "MD/DNB Paediatrics", G05: "MD/MS/DNB Obstetrics & Gynaecology", G06: "MD/DNB Anaesthesiology", G07: "MD/DNB Radiodiagnosis", G08: "MD/DNB Respiratory Medicine", G09: "MD/DNB Microbiology", G10: "MD/DNB Pathology", G11: "MD/DNB Psychiatry", G12: "MD/DNB Pharmacology", G13: "MS/DNB ENT", G14: "Topics of Critical Care Medicine", G15: "Topics of Medical Oncology" };
const HUES = { G01: 200, G02: 0, G03: 28, G04: 300, G05: 330, G06: 180, G07: 230, G08: 160, G09: 130, G10: 270, G11: 260, G12: 50, G13: 60, G14: 190, G15: 340 };
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const jsonCh = (chs) => chs.map((c) => C(c.title, c.topics.map((t) => T(t.title, t.subtopics.map((s) => s.title), "json")), "json"));
const MAP_DROP = [EBM, CLIN];

// Old app SS data → where it goes now.
const OLD_COURSE = {
  cardiology: "G01:cardiology", neurology: "G01:neurology", nephrology: "G01:nephrology", "medical-gastroenterology": "G01:medical-gastroenterology", hepatology: "G01:hepatology", endocrinology: "G01:endocrinology", "clinical-haematology": "G01:clinical-haematology", "clinical-immunology-and-rheumatology": "G01:clinical-immunology-and-rheumatology", "infectious-diseases": "G01:infectious-diseases", "medical-genetics": "G01:medical-genetics",
  "medical-oncology": "G15:paper", "critical-care-medicine": "G14:paper",
  neurosurgery: "G02:neurosurgery", urology: "G02:urology", "surgical-gastroenterology": "G02:surgical-gastroenterology", "cardiovascular-and-thoracic-surgery": "G02:cardiovascular-and-thoracic-surgery", "paediatric-surgery": "G02:paediatric-surgery", "plastic-and-reconstructive-surgery": "G02:plastic-and-reconstructive-surgery", "surgical-oncology": "G02:surgical-oncology", "vascular-surgery": "G02:vascular-surgery", "endocrine-surgery": "G02:endocrine-surgery", "hepato-pancreato-biliary-surgery": "G02:hepato-pancreato-biliary-surgery", "thoracic-surgery": "G02:thoracic-surgery",
  neonatology: "G04:neonatology", "paediatric-cardiology": "G04:paediatric-cardiology", "paediatric-neurology": "G04:paediatric-neurology", "paediatric-nephrology": "G04:paediatric-nephrology", "paediatric-gastroenterology-and-hepatology": "G04:paediatric-gastroenterology+G04:paediatric-hepatology", "paediatric-haemato-oncology": "G04:paediatric-oncology", "paediatric-critical-care": "G04:paediatric-critical-care",
  "gynaecological-oncology": "G05:gynaecological-oncology", "reproductive-medicine-and-surgery": "G05:reproductive-medicine-and-surgery", "maternal-and-fetal-medicine": "G05:paper",
  "hand-surgery": "G03:hand-surgery", "paediatric-orthopaedics": "G03:paediatric-orthopaedics", "spine-surgery": "G03:paper",
  "cardiac-anaesthesia": "G06:cardiac-anaesthesia", "neuro-anaesthesia": "G06:neuroanesthesia", "paediatric-anaesthesia": "G06:paediatric-and-neonatal-anaesthesia", "onco-anaesthesia-and-palliative-medicine": "G06:paper",
  neuroradiology: "G07:neuro-radiology", "interventional-radiology": "G07:interventional-radiology",
  "child-and-adolescent-psychiatry": "G11:child-and-adolescent-psychiatry", "geriatric-mental-health": "G11:geriatric-mental-health", "addiction-psychiatry": "G11:paper",
  "pulmonary-medicine-and-critical-care": "G08:pulmonary-medicine",
  haematopathology: "G10:paper", neuropathology: "G10:paper",
  virology: "G09:virology", "infectious-diseases-microbiology": "G09:paper",
  "clinical-pharmacology": "G12:clinical-pharmacology",
  "head-and-neck-surgery": "G13:head-and-neck-surgery", "neuro-otology": "G13:paper",
};
// Explicit homes for old course chapters folded into a paper.
const OLD_COURSE_CHMAP = { neuropathology: { "CNS infections": "CNS infections" }, "onco-anaesthesia-and-palliative-medicine": { "Symptom management": "Palliative care", "Palliative care": "Palliative care" } };
const OLD_FEEDER = { medicine: "G01", surgery: "G02", paediatrics: "G04", obg: "G05", orthopaedics: "G03", anaesthesia: "G06", radiology: "G07", psychiatry: "G11", respiratory: "G08", pathology: "G10", microbiology: "G09", pharmacology: "G12", ent: "G13" };

const SS_GROUPS = [];
const SS_SUBJECTS = [];
const subjByRef = new Map(); // "G01:paper" | "G01:cardiology" → subject
for (const g of ssJson.groups) {
  const gk = GROUP_KEYS[g.id];
  const exception = g.scope === "specialty_only";
  const pdrop = SS_PAPER_DROP[gk] || [];
  if (pdrop.length) log(`ss/${gk}/paper`, "dropped pasted cross-subject chapters", pdrop.length, pdrop.join("; "));
  const paper = { key: `${gk}.paper`, name: exception ? g.primary_tested_subject : `${g.primary_tested_subject} (PG exit)`, group: exception ? "Question paper — super-specialty topics" : "Question paper — feeder PG-exit curriculum", hue: HUES[g.id], weight: 1, role: "paper", ssGroup: gk, chapters: jsonCh(g.tested_subject_chapters).filter((c) => !pdrop.includes(c.name)) };
  subjByRef.set(`${g.id}:paper`, paper);
  SS_SUBJECTS.push(paper);
  const courses = [];
  for (const m of g.super_specialty_reference_maps) {
    let chs = jsonCh(m.chapters);
    const dropped = chs.filter((c) => MAP_DROP.includes(c.name));
    if (dropped.length) log(`ss/${gk}/${slug(m.name)}`, "dropped pasted template chapters", dropped.length, dropped.map((c) => c.name).join("; "));
    chs = chs.filter((c) => !MAP_DROP.includes(c.name));
    if (exception) { mergeInto(`ss/${gk}/paper`, paper.chapters, chs, "json-map"); courses.push({ key: slug(m.name), name: m.name, degree: "DM", subject: null }); continue; }
    const course = { key: `${gk}.${slug(m.name)}`, name: m.name, group: "Your course — beyond the paper", hue: (HUES[g.id] + 30 + courses.length * 37) % 360, weight: 0, role: "course", ssGroup: gk, chapters: chs };
    subjByRef.set(`${g.id}:${slug(m.name)}`, course);
    SS_SUBJECTS.push(course);
    courses.push({ key: slug(m.name), name: m.name, subject: course.key });
  }
  SS_GROUPS.push({ id: g.id, key: gk, name: g.name, feeder: FEEDER[g.id], paperSubject: paper.key, exception, hue: HUES[g.id], courses: g.official_admission_targets.map((n) => ({ key: slug(n), name: n, subject: exception ? null : `${gk}.${slug(n)}` })) });
}
// Fold the old app SS content in.
for (const og of oldSs) {
  const gid = OLD_FEEDER[og.key];
  const paper = subjByRef.get(`${gid}:paper`);
  mergeInto(`ss/${GROUP_KEYS[gid]}/paper`, paper.chapters, oldChapters({ chapters: og.feeder.chapters }), "app", SS_FEEDER_CHMAP[og.key] || {});
  for (const sp of og.specialties) {
    const dest = OLD_COURSE[sp.key];
    if (!dest) { log("ss/unmapped", "old course without a home", 1, sp.key); continue; }
    for (const ref of dest.split("+")) {
      const subj = subjByRef.get(ref);
      if (!subj) { log("ss/unmapped", "missing destination", 1, ref); continue; }
      mergeInto(`${subj.key}`, subj.chapters, oldChapters(sp), "app", OLD_COURSE_CHMAP[sp.key] || null);
    }
  }
}

/* ═════════════ Official-curriculum enrichment (enrich.txt) ═════════════
   Format:  "== <subject key>" then "@ <chapter>" then "+ <topic>: sub; sub; sub"
   Optional "! <detail text>" right after a chapter or topic line.            */
const bySubject = new Map([...PG, ...SS_SUBJECTS].map((s) => [s.key, s]));
let cur = null, ch = null, tp = null, enrichAdded = { chapters: 0, topics: 0, subs: 0 };
for (const raw of enrichSrc.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  if (line.startsWith("== ")) { cur = bySubject.get(line.slice(3).trim()); if (!cur) throw new Error("enrich: unknown subject " + line); ch = tp = null; continue; }
  if (line.startsWith("@ ")) {
    const name = cap(line.slice(2));
    ch = cur.chapters.find((c) => c.name.toLowerCase() === name.toLowerCase()) || cur.chapters.find((c) => jac(c.name, name) >= 0.75);
    if (!ch) { ch = C(name, [], "official"); cur.chapters.push(ch); enrichAdded.chapters++; }
    tp = null; continue;
  }
  if (line.startsWith("! ")) { (tp || ch).detail = line.slice(2).trim(); continue; }
  if (line.startsWith("+ ")) {
    const body = line.slice(2);
    // Prefer an existing topic whose name (which may itself contain a colon) prefixes the line.
    const known = ch.topics.map((t) => t.name).filter((n) => body.toLowerCase().startsWith(`${n.toLowerCase()}:`)).sort((a, b) => b.length - a.length)[0];
    const [tn, rest = ""] = known ? [known, body.slice(known.length + 1)] : body.split(/:(.*)/s);
    const subs = rest.split(";").map((s) => s.trim()).filter(Boolean);
    tp = ch.topics.find((t) => t.name.toLowerCase() === cap(tn).toLowerCase());
    if (!tp) { tp = T(tn, [], "official"); ch.topics.push(tp); enrichAdded.topics++; }
    for (const s of subs) if (!tp.subtopics.some((x) => x.name.toLowerCase() === s.toLowerCase())) { tp.subtopics.push({ name: s, src: "official" }); enrichAdded.subs++; }
    continue;
  }
  throw new Error("enrich: bad line " + line);
}
log("enrich", "official-curriculum additions", 1, JSON.stringify(enrichAdded));

/* ── final clean-up: dedupe, trim, counts ─────────────────────────────── */
const count = (subs) => subs.reduce((a, s) => ({ ch: a.ch + s.chapters.length, t: a.t + s.chapters.reduce((b, c) => b + c.topics.length, 0), st: a.st + s.chapters.reduce((b, c) => b + c.topics.reduce((d, t) => d + t.subtopics.length, 0), 0) }), { ch: 0, t: 0, st: 0 });
for (const s of [...PG, ...SS_SUBJECTS]) for (const c of s.chapters) for (const t of c.topics) {
  const seen = new Set(); t.subtopics = t.subtopics.filter((x) => { const k = x.name.toLowerCase(); if (seen.has(k) || k === t.name.toLowerCase()) return false; seen.add(k); return true; });
}
const out = { generatedAt: new Date().toISOString(), pg: PG, ss: { groups: SS_GROUPS, subjects: SS_SUBJECTS }, audit };
fs.writeFileSync(path.join(D, "seed.json"), JSON.stringify(out));
console.log("PG", JSON.stringify(count(PG)), "| SS", JSON.stringify(count(SS_SUBJECTS)), "| SS papers", JSON.stringify(count(SS_SUBJECTS.filter((s) => s.role === "paper"))));
for (const a of audit.filter((x) => x.what.startsWith("merge"))) {
  const s = JSON.parse(a.sample); console.log(a.scope.padEnd(46), a.what.padEnd(16), `covered ${s.covered} merged ${s.mergedTopics} +subs ${s.addedSubs} +topics ${s.addedTopics} +chapters ${s.addedChapters}`);
}
