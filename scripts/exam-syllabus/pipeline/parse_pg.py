import sys, fitz, json, re
doc = fitz.open(sys.argv[1])
subjects, cur_s, cur_c, cur_t = [], None, None, None
sub_buf = []
def flush():
    global sub_buf
    if cur_t is not None and sub_buf:
        txt = " ".join(sub_buf)
        cur_t["subtopics"] += [x.strip() for x in txt.split(";") if x.strip()]
    sub_buf = []
stop = False
for pi, p in enumerate(doc):
    if pi < 2 or stop: continue
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip(); f = s["font"]; z = round(s["size"], 1)
                if not t or z == 7.5: continue
                m = re.match(r"^PG\.S(\d\d) (.+)$", t)
                if m and "Bold" in f and z > 11:
                    flush(); cur_s = {"code": m.group(1), "name": m.group(2), "chapters": []}; subjects.append(cur_s); cur_c = cur_t = None; continue
                if re.match(r"^(MD|MS|Postgraduate|Editorial postgraduate|PG degree)", t) and "Bold" in f and z > 11 and len(subjects) == 19:
                    flush(); stop = True; break
                if cur_s is None: continue
                if "Source mode" in t: continue
                m = re.match(r"^C(\d{3}) (.+)$", t)
                if m and "Bold" in f and z >= 10:
                    flush(); cur_c = {"code": m.group(1), "name": m.group(2), "topics": []}; cur_s["chapters"].append(cur_c); cur_t = None; continue
                if "Bold" in f and z == 9.0 and cur_c is not None:
                    flush(); cur_t = {"name": t, "subtopics": []}; cur_c["topics"].append(cur_t); continue
                if z == 8.0 and cur_t is not None:
                    sub_buf.append(t); continue
                print("UNHANDLED", pi+1, f, z, t[:80], file=sys.stderr)
            if stop: break
        if stop: break
flush()
json.dump(subjects, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for s in subjects:
    print(s["code"], s["name"], "ch", len(s["chapters"]), "topics", sum(len(c["topics"]) for c in s["chapters"]), "subs", sum(len(t["subtopics"]) for c in s["chapters"] for t in c["topics"]))
print("TOTAL ch", sum(len(s["chapters"]) for s in subjects), "topics", sum(len(c["topics"]) for s in subjects for c in s["chapters"]), "subs", sum(len(t["subtopics"]) for s in subjects for c in s["chapters"] for t in c["topics"]))
