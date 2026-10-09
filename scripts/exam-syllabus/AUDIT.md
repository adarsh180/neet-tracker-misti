# NEET PG / NEET SS syllabus — audit and build notes (9 Oct 2026)

The syllabus now lives in the database (`exam_nodes`): subject → chapter → topic → subtopic,
every level editable in the app (rename, notes, add, reorder, remove/restore).
`nodes.json` is the verified seed; `node scripts/seed-exam-syllabus.mjs` inserts only missing keys,
so it never overwrites edits.

## What was checked, and against what

### Official structure (verified)
- **NBEMS NEET-SS 2025 Information Bulletin**, §4.4 (pp. 64–65) and Tables 1–2 (pp. 67–69):
  - 15 question-paper groups, 49 DM/MCh/DrNB courses, 150 MCQs / 150 min, three timed sections of 50, +4/−1.
  - 13 groups ask **only** from the PG-exit curriculum of the primary feeder broad specialty (general + every sub-specialty component).
  - **Critical Care Medicine** and **Medical Oncology** groups ask only from the topics of that super specialty.
  - The supplied JSON's group → course mapping matches Tables 1–2 exactly.
- **NEET PG**: 2026 cycle is 180 MCQs, 720 marks, five timed sections (news reports of the NBEMS bulletin); 19 NMC subjects.

### Previous app data that was wrong (fixed)
- SS paper modelled as "≈40% feeder / ≈60% super-specialty" — the pre-2022 scheme. Now 100% feeder (13 groups) or 100% specialty topics (2 groups).
- 13 groups instead of 15; Critical Care Medicine and Medical Oncology were placed under the Medical group.
- Courses that are not offered through NEET-SS 2025 (Maternal & Fetal Medicine, Spine Surgery, Onco-anaesthesia, Addiction Psychiatry, Haematopathology, Neuropathology, Neuro-otology, Infectious Diseases (Microbiology)) — their content was folded into the relevant paper subject; missing courses (Paediatric Cardiothoracic Vascular Surgery, Organ Transplant Anaesthesia & Critical Care, Onco-Pathology, Paediatric Hepatology/Gastroenterology/Oncology as separate courses, …) were added.

### Content of the supplied files (both editorial, ChatGPT-generated — they say so themselves)
- Parsed exactly: PG PDF 19 subjects / 286 chapters / 1,063 topics / 4,484 subtopics; SS JSON 15 groups / 625 chapters / 2,177 topics / 10,976 subtopics.
- No duplicates, no garbled text, sensible clinical content — but:
  - one "Evidence-based medicine and research" chapter pasted into every feeder subject and all 49 course maps (kept once per SS paper, dropped from course maps and from PG clinical subjects);
  - a "Clinical methods" template pasted into 12 subjects;
  - **misplaced chapters** in the PG PDF: Psychiatry had a paediatric growth chapter, Radiology a cardiology-tests chapter, ENT an anaesthesia airway chapter, Orthopaedics three general-surgery chapters, OBG anaesthesia + genetics chapters, Pathology/Pharmacology/Microbiology were thin PG-exit adaptations (the app's systemic chapters were kept as the backbone there).
- **Verified against the 15 official curricula** (NBEMS DNB General Medicine, General Surgery, Orthopaedics, Paediatrics, OBG, Anaesthesiology, Radiodiagnosis, Respiratory Medicine, Microbiology, Pathology, Psychiatry, Pharmacology, ENT; DrNB Critical Care Medicine, Medical Oncology). The JSON is directionally right but coarse: many named examinable items in the official syllabi were missing (e.g. myocarditis, endocarditis, cor pulmonale, brain abscess, Wernicke-Korsakoff, thyroid storm, mesothelioma, Arnold-Chiari, nuclear medicine, adolescent health, environmental illness, clinical pharmacology, foot & ankle, family welfare, ICD-11 groups, ICU quality/transport/organ donation …). These were added from the official texts, each new chapter carrying a note naming its official section.

## How the merge works (`pipeline/build.cjs`; inputs: the two supplied files + the app's previous data)
1. PG: the app's existing chapters stay (as asked: "leave what is already added"); PDF chapters are placed by an explicit chapter map, topics merge by name (IDF-weighted, abbreviation-aware), so nothing already present is duplicated and existing topics gain the PDF's subtopics.
2. SS: official groups/courses; feeder papers = JSON feeder + the app's previous feeder content (explicit chapter map) + official-curriculum additions; courses = JSON course maps (templates removed) + the app's previous course depth.
3. Hand-written high-yield subtopics for every PG topic and every SS paper topic that had none.

## Result
| | Subjects | Chapters | Topics | Subtopics |
|---|---|---|---|---|
| NEET PG | 19 | 173 | 1,698 | 6,517 (every topic has subtopics) |
| NEET SS papers (15) | 15 | 232 | 1,318 | 6,028 (every topic has subtopics) |
| NEET SS course references (47) | 47 | 443 | 1,930 | 6,139 |

Caveat: NBEMS publishes no topic list for either exam; topics and subtopics remain an editorial
study map aligned to the official scope above, not an official syllabus. Everything is editable in the app.
