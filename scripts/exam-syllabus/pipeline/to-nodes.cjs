// seed.json (built tree) → compact node list for scripts/exam-syllabus/nodes.json
const fs = require("fs");
const path = require("path");
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "seed.json"), "utf8"));
const slug = (s, n) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, n).replace(/-$/, "") || "x";
const out = [];
const uniq = (parent, base, used) => { let k = `${parent}.${base}`, i = 2; while (used.has(k)) k = `${parent}.${base}-${i++}`; used.add(k); return k; };
function emit(exam, subj, ord, meta) {
  out.push({ e: exam, k: subj.key, l: 1, n: subj.name, o: ord, m: meta, ...(subj.detail ? { d: subj.detail } : {}) });
  const usedC = new Set();
  subj.chapters.forEach((c, ci) => {
    const ck = uniq(subj.key, slug(c.name, 40), usedC);
    out.push({ e: exam, k: ck, p: subj.key, l: 2, n: c.name, o: ci + 1, m: { src: c.src || "" }, ...(c.detail ? { d: c.detail } : {}) });
    const usedT = new Set();
    c.topics.forEach((t, ti) => {
      const tk = uniq(ck, slug(t.name, 40), usedT);
      out.push({ e: exam, k: tk, p: ck, l: 3, n: t.name, o: ti + 1, m: { src: t.src || "" }, ...(t.detail ? { d: t.detail } : {}) });
      const usedS = new Set();
      t.subtopics.forEach((s, si) => {
        const sk = uniq(tk, slug(s.name, 32), usedS);
        out.push({ e: exam, k: sk, p: tk, l: 4, n: s.name.slice(0, 200), o: si + 1, ...(s.src && s.src !== t.src ? { m: { src: s.src } } : {}) });
      });
    });
  });
}
seed.pg.forEach((s, i) => emit("pg", s, i + 1, { role: "subject", weight: s.weight, hue: s.hue, group: s.group }));
seed.ss.subjects.forEach((s, i) => emit("ss", s, i + 1, { role: s.role, ss: s.ssGroup, hue: s.hue, weight: s.weight }));
const maxKey = out.reduce((a, n) => Math.max(a, n.k.length), 0);
const dir = "E:/projects/neet-tracker-sutra/scripts/exam-syllabus";
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "nodes.json"), JSON.stringify({ generatedAt: seed.generatedAt, source: "NEET PG/SS syllabus — see AUDIT.md", nodes: out }));
console.log("nodes", out.length, "max key", maxKey, "size", fs.statSync(path.join(dir, "nodes.json")).size);
