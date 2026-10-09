/**
 * NEET PG syllabus (NMC competency-based MBBS curriculum, examined by NBEMS).
 * Paper (NBEMS 2026 bulletin as reported): 180 MCQs, 720 marks, +4/−1,
 * five timed sections of 36, 3.5 hours.
 *
 * Subject weights: NBEMS does not publish exact counts. These are the long-
 * used indicative relative weights (pre-clinical 50 · para-clinical 100 ·
 * clinical 180 parts), re-scaled to the 180-question paper — planning priors,
 * not guarantees. Chapters inside a subject share its weight equally.
 */

export type SyllabusChapter = { key: string; name: string; topics: string[] };
export type SyllabusSubject = { key: string; name: string; group: string; weight: number; hue: number; chapters: SyllabusChapter[] };

import { PG_DEPTH } from "./neet-pg-depth";

const ch = (key: string, name: string, topics: string[]): SyllabusChapter => ({ key, name, topics });

const PG_BASE: SyllabusSubject[] = [
  {
    key: "anatomy", name: "Anatomy", group: "Pre-clinical", weight: 17, hue: 12,
    chapters: [
      ch("general", "General anatomy & histology", ["Epithelia & glands", "Connective tissue & cartilage", "Bone & joints", "Muscle tissue", "Lymphoid organs histology"]),
      ch("embryo", "Embryology", ["Gametogenesis & fertilisation", "Germ layers & derivatives", "Pharyngeal arches & pouches", "Heart & great vessels development", "Gut rotation & anomalies", "Urogenital development"]),
      ch("upper", "Upper limb", ["Brachial plexus & injuries", "Shoulder & axilla", "Arm, forearm & hand", "Joints of upper limb", "Blood supply & lymphatics"]),
      ch("lower", "Lower limb", ["Lumbosacral plexus", "Gluteal region & thigh", "Leg & foot", "Hip, knee & ankle joints", "Arches of foot & gait"]),
      ch("thorax", "Thorax", ["Mediastinum", "Heart: chambers & conducting system", "Coronary circulation", "Lungs & pleura", "Thoracic wall & diaphragm"]),
      ch("abdomen", "Abdomen & pelvis", ["Peritoneum & inguinal canal", "Stomach, liver & biliary tree", "Pancreas, spleen & duodenum", "Kidney, ureter & adrenal", "Pelvic viscera & perineum", "Portal-systemic anastomoses"]),
      ch("headneck", "Head & neck", ["Cranial nerves", "Scalp, face & parotid", "Triangles of neck", "Orbit & eye", "Larynx, pharynx & nose", "Cranial cavity & dural sinuses"]),
      ch("neuro", "Neuroanatomy", ["Spinal cord tracts & lesions", "Brainstem & cranial nerve nuclei", "Cerebellum & basal ganglia", "Thalamus & internal capsule", "Blood supply of brain", "Ventricles & CSF"]),
      ch("genetics", "Genetics", ["Chromosomal disorders", "Patterns of inheritance", "Karyotyping & FISH"]),
    ],
  },
  {
    key: "physiology", name: "Physiology", group: "Pre-clinical", weight: 17, hue: 28,
    chapters: [
      ch("general", "General & cell physiology", ["Membrane transport", "Resting & action potential", "Body fluid compartments", "Homeostasis & feedback"]),
      ch("nerve-muscle", "Nerve & muscle", ["Nerve fibre types & conduction", "Neuromuscular junction", "Skeletal muscle contraction", "Smooth & cardiac muscle"]),
      ch("blood", "Blood", ["Haemopoiesis", "Haemoglobin & RBC indices", "Haemostasis & coagulation", "Blood groups", "Immunity basics"]),
      ch("cvs", "Cardiovascular", ["Cardiac cycle & heart sounds", "ECG", "Cardiac output & regulation", "Blood pressure regulation", "Regional circulations", "Shock physiology"]),
      ch("resp", "Respiratory", ["Lung volumes & compliance", "Gas transport & O2 dissociation curve", "Regulation of respiration", "Hypoxia & high altitude", "Ventilation-perfusion"]),
      ch("renal", "Renal & acid-base", ["GFR & clearance", "Tubular transport", "Concentration of urine", "Acid-base balance", "Micturition"]),
      ch("gi", "Gastrointestinal", ["GI hormones", "Gastric secretion", "Pancreatic & bile secretion", "Digestion & absorption", "GI motility"]),
      ch("endo", "Endocrine & reproduction", ["Hypothalamo-pituitary axis", "Thyroid", "Adrenal", "Calcium homeostasis", "Pancreatic hormones", "Male & female reproduction", "Pregnancy & lactation"]),
      ch("cns", "Nervous system", ["Sensory receptors & pathways", "Pain", "Motor control & reflexes", "Cerebellum & basal ganglia", "Sleep & EEG", "Learning & memory", "Hypothalamus & temperature"]),
      ch("special", "Special senses", ["Vision physiology", "Hearing", "Taste & smell"]),
    ],
  },
  {
    key: "biochemistry", name: "Biochemistry", group: "Pre-clinical", weight: 16, hue: 45,
    chapters: [
      ch("enzymes", "Enzymes", ["Kinetics & Km/Vmax", "Inhibition types", "Clinical enzymology", "Isoenzymes"]),
      ch("carbs", "Carbohydrate metabolism", ["Glycolysis & TCA", "Gluconeogenesis", "Glycogen metabolism & storage diseases", "HMP shunt & G6PD", "Galactose & fructose disorders"]),
      ch("lipids", "Lipid metabolism", ["Fatty acid oxidation", "Ketone bodies", "Cholesterol & lipoproteins", "Lipid storage disorders", "Dyslipidaemias"]),
      ch("protein", "Amino acids & proteins", ["Urea cycle disorders", "Aminoacidopathies", "Protein structure & folding", "Haem synthesis & porphyrias", "Bilirubin metabolism"]),
      ch("molbio", "Molecular biology", ["DNA replication & repair", "Transcription & translation", "Gene regulation", "PCR, blotting & sequencing", "Recombinant DNA & CRISPR"]),
      ch("vitamins", "Vitamins & minerals", ["Fat-soluble vitamins", "Water-soluble vitamins", "Iron, calcium & trace elements"]),
      ch("nutrition", "Nutrition & integration", ["Energy metabolism & BMR", "Fed-fast cycle", "Protein-energy malnutrition"]),
      ch("clinical", "Clinical biochemistry", ["Liver & renal function tests", "Acid-base & electrolytes", "Tumour markers", "Lysosomal storage diseases"]),
    ],
  },
  {
    key: "pathology", name: "Pathology", group: "Para-clinical", weight: 25, hue: 340,
    chapters: [
      ch("cell", "Cell injury & adaptation", ["Necrosis & apoptosis", "Cellular adaptations", "Intracellular accumulations", "Calcification"]),
      ch("inflam", "Inflammation & repair", ["Acute inflammation & mediators", "Chronic & granulomatous inflammation", "Wound healing"]),
      ch("haemo", "Haemodynamics", ["Oedema & thrombosis", "Embolism & infarction", "Shock"]),
      ch("immuno", "Immunopathology", ["Hypersensitivity reactions", "Autoimmune diseases", "Amyloidosis", "Transplant rejection", "Immunodeficiency"]),
      ch("neoplasia", "Neoplasia", ["Hallmarks & oncogenes", "Tumour suppressors", "Carcinogenesis", "Paraneoplastic syndromes", "Grading, staging & markers"]),
      ch("haem", "Haematology", ["Anaemias", "Haemolytic anaemias", "Leukaemias", "Lymphomas", "Bleeding disorders", "Plasma cell dyscrasias"]),
      ch("cvs", "CVS & respiratory pathology", ["Atherosclerosis & IHD", "Rheumatic & infective endocarditis", "Lung tumours", "Pneumonias & TB", "Obstructive & restrictive disease"]),
      ch("gi", "GI & hepatobiliary", ["Oesophagus & stomach", "IBD & colorectal neoplasia", "Hepatitis & cirrhosis", "Liver tumours", "Pancreas"]),
      ch("renal", "Renal & genitourinary", ["Glomerulonephritis", "Nephrotic syndrome", "Renal tumours", "Testis & prostate", "Bladder tumours"]),
      ch("systemic", "Other systems", ["Breast pathology", "Female genital tract", "Endocrine pathology", "Bone & soft tissue tumours", "CNS tumours", "Skin pathology"]),
    ],
  },
  {
    key: "pharmacology", name: "Pharmacology", group: "Para-clinical", weight: 20, hue: 265,
    chapters: [
      ch("general", "General pharmacology", ["Pharmacokinetics", "Pharmacodynamics & receptors", "Drug interactions", "ADRs & pharmacovigilance", "Clinical trials phases"]),
      ch("ans", "Autonomic", ["Cholinergic & anticholinergic", "Adrenergic agonists", "Alpha & beta blockers"]),
      ch("cvs", "Cardiovascular & renal", ["Antihypertensives", "Antianginals", "Heart failure drugs", "Antiarrhythmics", "Diuretics", "Lipid-lowering drugs"]),
      ch("cns", "CNS", ["Sedatives & hypnotics", "Antiepileptics", "Antipsychotics", "Antidepressants & mood stabilisers", "Opioids", "Anti-parkinsonian drugs", "General & local anaesthetics"]),
      ch("autacoids", "Autacoids & respiratory", ["NSAIDs", "Antihistamines", "Asthma & COPD drugs", "Gout & RA drugs"]),
      ch("endo", "Endocrine", ["Insulin & oral antidiabetics", "Thyroid drugs", "Corticosteroids", "Sex hormones & contraceptives", "Bone mineral drugs"]),
      ch("chemo", "Chemotherapy", ["Beta-lactams", "Aminoglycosides & macrolides", "Fluoroquinolones & others", "Anti-tubercular & anti-leprosy", "Antifungals", "Antivirals & ART", "Antimalarials & anthelminthics"]),
      ch("cancer", "Anticancer & immunomodulators", ["Cytotoxic drugs", "Targeted therapy & monoclonals", "Immunosuppressants"]),
      ch("blood-gi", "Blood & GI", ["Anticoagulants & antiplatelets", "Fibrinolytics", "Haematinics", "Peptic ulcer drugs", "Antiemetics & laxatives"]),
    ],
  },
  {
    key: "microbiology", name: "Microbiology", group: "Para-clinical", weight: 20, hue: 150,
    chapters: [
      ch("general", "General microbiology", ["Bacterial structure & genetics", "Sterilisation & disinfection", "Culture media & identification", "Antimicrobial resistance"]),
      ch("immunology", "Immunology", ["Innate & adaptive immunity", "Antigen-antibody reactions", "Complement", "Hypersensitivity & immunodeficiency", "Vaccines"]),
      ch("gpc", "Gram-positive bacteria", ["Staphylococcus", "Streptococcus & pneumococcus", "Clostridium", "Corynebacterium & Bacillus"]),
      ch("gnb", "Gram-negative bacteria", ["Enterobacteriaceae", "Vibrio", "Pseudomonas", "Neisseria", "Haemophilus & Bordetella"]),
      ch("special", "Mycobacteria, spirochaetes & others", ["Mycobacterium tuberculosis", "Leprosy", "Syphilis & Leptospira", "Rickettsia & Chlamydia"]),
      ch("virology", "Virology", ["Herpesviruses", "Hepatitis viruses", "HIV", "Respiratory viruses", "Arboviruses", "Rabies & polio"]),
      ch("mycology", "Mycology", ["Superficial & subcutaneous mycoses", "Systemic mycoses", "Opportunistic fungi"]),
      ch("parasitology", "Parasitology", ["Malaria", "Amoebae & flagellates", "Cestodes & trematodes", "Nematodes"]),
      ch("applied", "Applied microbiology", ["Hospital infection control", "Biomedical waste", "Infective syndromes approach"]),
    ],
  },
  {
    key: "forensic", name: "Forensic Medicine", group: "Para-clinical", weight: 10, hue: 210,
    chapters: [
      ch("legal", "Legal procedures & medical law", ["Inquest & courts", "Consent & negligence", "Medical ethics & laws (BNS/BNSS)"]),
      ch("identity", "Identification", ["Age estimation", "Dactylography & DNA", "Sex determination"]),
      ch("death", "Thanatology", ["Signs of death", "Postmortem changes & time since death", "Autopsy"]),
      ch("injuries", "Injuries", ["Mechanical injuries", "Firearm injuries", "Thermal & electrical injuries", "Regional injuries"]),
      ch("asphyxia", "Asphyxial deaths", ["Hanging & strangulation", "Drowning", "Suffocation"]),
      ch("sexual", "Sexual offences & infant deaths", ["Sexual offences", "Infanticide & child abuse"]),
      ch("toxicology", "Toxicology", ["General toxicology & antidotes", "Corrosives & metals", "Organophosphates & pesticides", "Snake bite & animal poisons", "Plant poisons & drugs of abuse"]),
    ],
  },
  {
    key: "community", name: "Community Medicine", group: "Para-clinical", weight: 25, hue: 95,
    chapters: [
      ch("concepts", "Concepts of health & disease", ["Determinants & indicators", "Levels of prevention", "Natural history of disease"]),
      ch("epidemiology", "Epidemiology", ["Measures of morbidity & mortality", "Study designs", "Bias & confounding", "Screening tests"]),
      ch("biostat", "Biostatistics", ["Sampling & data", "Measures of central tendency & dispersion", "Tests of significance", "Sample size"]),
      ch("cd", "Communicable diseases", ["Vaccine-preventable diseases", "TB & NTEP", "Malaria & vector-borne", "HIV & STIs", "Diarrhoeal diseases", "Emerging infections"]),
      ch("ncd", "Non-communicable diseases", ["Cardiovascular & diabetes", "Cancer screening", "Blindness & accidents", "Obesity"]),
      ch("rch", "Maternal & child health", ["Antenatal & natal care", "Growth monitoring", "Immunisation schedule", "Family planning"]),
      ch("nutrition", "Nutrition", ["Nutritional requirements", "Deficiency disorders", "Nutrition programmes"]),
      ch("environment", "Environment & occupational health", ["Water & air", "Waste disposal", "Occupational diseases"]),
      ch("programmes", "Health programmes & care delivery", ["National health programmes", "Health care delivery in India", "International health"]),
    ],
  },
  {
    key: "medicine", name: "Medicine", group: "Clinical", weight: 45, hue: 200,
    chapters: [
      ch("cardio", "Cardiology", ["Heart failure", "Acute coronary syndromes", "Arrhythmias", "Valvular heart disease", "Hypertension", "Cardiomyopathies & pericardial disease"]),
      ch("resp", "Respiratory", ["Asthma & COPD", "Pneumonia", "Interstitial lung disease", "Pulmonary embolism", "Pleural effusion", "Lung cancer"]),
      ch("gi", "Gastroenterology & hepatology", ["GI bleeding", "IBD", "Malabsorption", "Viral hepatitis", "Cirrhosis & complications", "Pancreatitis"]),
      ch("renal", "Nephrology", ["AKI", "CKD", "Glomerular disease", "Electrolyte disorders", "Acid-base disorders"]),
      ch("endo", "Endocrinology", ["Diabetes mellitus", "Thyroid disorders", "Adrenal disorders", "Pituitary disorders", "Calcium & bone disorders"]),
      ch("haem", "Haematology & oncology", ["Anaemias", "Haematological malignancies", "Bleeding & thrombosis", "Oncological emergencies"]),
      ch("neuro", "Neurology", ["Stroke", "Epilepsy", "Headache", "Movement disorders", "Neuropathies & myopathies", "Demyelinating disease"]),
      ch("rheum", "Rheumatology", ["Rheumatoid arthritis", "SLE & connective tissue disease", "Vasculitis", "Spondyloarthritis & gout"]),
      ch("id", "Infectious diseases", ["Fever approach", "Tropical infections", "HIV & opportunistic infections", "Sepsis"]),
      ch("misc", "Critical care, poisoning & geriatrics", ["ICU basics & ventilation", "Common poisonings", "Geriatric syndromes"]),
    ],
  },
  {
    key: "surgery", name: "Surgery", group: "Clinical", weight: 45, hue: 0,
    chapters: [
      ch("general", "General surgery principles", ["Wound healing & infections", "Shock & fluids", "Burns", "Trauma (ATLS)", "Nutrition in surgery"]),
      ch("headneck", "Head, neck & endocrine", ["Thyroid", "Parathyroid & adrenal", "Salivary glands", "Oral cancers"]),
      ch("breast", "Breast", ["Benign breast disease", "Breast cancer"]),
      ch("vascular", "Vascular & lymphatic", ["Peripheral arterial disease", "Varicose veins & DVT", "Lymphoedema"]),
      ch("gi", "Gastrointestinal surgery", ["Oesophagus", "Stomach & duodenum", "Small bowel & appendix", "Colorectal", "Anal canal"]),
      ch("hpb", "Hepatobiliary & pancreas", ["Gall stones & cholecystitis", "Obstructive jaundice", "Liver abscess & tumours", "Pancreatitis & pancreatic tumours", "Spleen"]),
      ch("hernia", "Hernia & abdominal wall", ["Inguinal & femoral hernia", "Ventral hernias"]),
      ch("uro", "Urology", ["Urolithiasis", "BPH & prostate cancer", "Renal & bladder tumours", "Testis & scrotum"]),
      ch("specialties", "Neuro, cardiothoracic & paediatric surgery", ["Head injury", "Chest trauma", "Congenital surgical conditions"]),
      ch("ortho-anaes", "Orthopaedics & anaesthesia basics in surgery", ["Perioperative care", "Day-care & minimal access surgery"]),
    ],
  },
  {
    key: "obg", name: "Obstetrics & Gynaecology", group: "Clinical", weight: 30, hue: 320,
    chapters: [
      ch("anatomy", "Anatomy & physiology", ["Female pelvis & genitalia", "Menstrual cycle", "Physiology of pregnancy"]),
      ch("antenatal", "Antenatal care", ["Diagnosis of pregnancy", "Antenatal screening", "Prenatal diagnosis"]),
      ch("labour", "Labour", ["Normal labour", "Abnormal labour & malpresentations", "Operative obstetrics", "Puerperium"]),
      ch("complications", "Complications of pregnancy", ["Hypertensive disorders", "Antepartum haemorrhage", "Postpartum haemorrhage", "Preterm labour & PROM", "Multiple pregnancy", "Rh isoimmunisation"]),
      ch("medical", "Medical disorders in pregnancy", ["Diabetes in pregnancy", "Anaemia", "Heart disease", "Infections"]),
      ch("early", "Early pregnancy", ["Abortion", "Ectopic pregnancy", "Gestational trophoblastic disease"]),
      ch("gynae", "Gynaecology", ["Menstrual disorders & AUB", "PCOS & infertility", "Contraception", "Menopause", "Genital tract infections", "Pelvic organ prolapse"]),
      ch("onco", "Gynaecological oncology", ["Cervical cancer & screening", "Endometrial cancer", "Ovarian tumours", "Fibroids"]),
    ],
  },
  {
    key: "paediatrics", name: "Paediatrics", group: "Clinical", weight: 10, hue: 180,
    chapters: [
      ch("growth", "Growth & development", ["Milestones", "Growth charts", "Adolescent health"]),
      ch("neonatology", "Neonatology", ["Neonatal resuscitation", "Neonatal jaundice", "Respiratory distress", "Neonatal sepsis", "Low birth weight & preterm"]),
      ch("nutrition", "Nutrition & immunisation", ["Breastfeeding", "SAM & malnutrition", "Immunisation schedule"]),
      ch("systemic", "Systemic paediatrics", ["Congenital heart disease", "Nephrotic & nephritic syndromes", "Childhood infections", "Paediatric neurology", "Genetic syndromes", "Inborn errors"]),
      ch("emergency", "Paediatric emergencies", ["Dehydration", "Seizures", "Poisoning"]),
    ],
  },
  {
    key: "ophthalmology", name: "Ophthalmology", group: "Clinical", weight: 10, hue: 230,
    chapters: [
      ch("basics", "Anatomy & optics", ["Anatomy of eye", "Refraction errors"]),
      ch("anterior", "Anterior segment", ["Conjunctiva", "Cornea", "Uvea", "Lens & cataract"]),
      ch("glaucoma", "Glaucoma", ["Open-angle glaucoma", "Angle-closure glaucoma", "Congenital glaucoma"]),
      ch("posterior", "Retina & optic nerve", ["Diabetic retinopathy", "Retinal detachment & vascular occlusion", "Optic neuritis & papilloedema", "Retinoblastoma"]),
      ch("misc", "Squint, orbit & community", ["Strabismus", "Orbit & lids", "Blindness programmes"]),
    ],
  },
  {
    key: "ent", name: "ENT", group: "Clinical", weight: 10, hue: 60,
    chapters: [
      ch("ear", "Ear", ["Anatomy & physiology of ear", "Otitis media & complications", "Hearing loss & tests", "Vertigo"]),
      ch("nose", "Nose & sinuses", ["Epistaxis", "Sinusitis", "Nasal polyps & tumours"]),
      ch("throat", "Pharynx & larynx", ["Tonsils & adenoids", "Laryngeal disorders", "Head & neck cancers", "Tracheostomy"]),
    ],
  },
  {
    key: "orthopaedics", name: "Orthopaedics", group: "Clinical", weight: 10, hue: 30,
    chapters: [
      ch("trauma", "Trauma", ["Fracture principles", "Upper limb fractures", "Lower limb fractures", "Spinal injuries"]),
      ch("infection", "Infections & tumours", ["Osteomyelitis & bone TB", "Bone tumours"]),
      ch("regional", "Regional & paediatric orthopaedics", ["Peripheral nerve injuries", "Congenital disorders (CTEV, DDH)", "Metabolic bone disease", "Sports injuries"]),
    ],
  },
  {
    key: "dermatology", name: "Dermatology", group: "Clinical", weight: 5, hue: 15,
    chapters: [
      ch("basics", "Basics & infections", ["Skin lesions & morphology", "Bacterial & fungal infections", "Leprosy", "STIs"]),
      ch("disorders", "Inflammatory & immunobullous", ["Psoriasis & eczema", "Vesiculobullous disorders", "Pigmentary & hair disorders"]),
    ],
  },
  {
    key: "psychiatry", name: "Psychiatry", group: "Clinical", weight: 5, hue: 280,
    chapters: [
      ch("major", "Major disorders", ["Schizophrenia", "Mood disorders", "Anxiety & OCD", "Substance use"]),
      ch("other", "Other topics", ["Personality disorders", "Child psychiatry", "Mental Healthcare Act"]),
    ],
  },
  {
    key: "radiology", name: "Radiology", group: "Clinical", weight: 5, hue: 190,
    chapters: [
      ch("physics", "Physics & safety", ["Radiation physics & protection", "Contrast media"]),
      ch("imaging", "Imaging signs", ["Chest X-ray signs", "Abdominal imaging", "Neuroimaging", "Radiotherapy basics"]),
    ],
  },
  {
    key: "anaesthesia", name: "Anaesthesia", group: "Clinical", weight: 5, hue: 170,
    chapters: [
      ch("general", "General anaesthesia", ["Pre-op assessment", "Airway management", "Inhalational & IV agents", "Muscle relaxants"]),
      ch("regional", "Regional & critical care", ["Spinal & epidural", "Local anaesthetics", "CPR & BLS/ACLS"]),
    ],
  },
];

/** Depth topics are appended after the originals (case-insensitive de-dupe). */
const deepen = (base: string[], extra?: string): string[] => {
  if (!extra) return base;
  const seen = new Set(base.map((t) => t.toLowerCase()));
  return [...base, ...extra.split("|").map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))];
};

export const NEET_PG_SUBJECTS: SyllabusSubject[] = PG_BASE.map((s) => ({
  ...s,
  chapters: s.chapters.map((c) => ({ ...c, topics: deepen(c.topics, PG_DEPTH[`${s.key}/${c.key}`]) })),
}));

export { deepen };

export const NEET_PG_PAPER = { questions: 180, marks: 720, sections: 5, minutes: 210, plus: 4, minus: 1 };

/**
 * NEET PG 2025 marks vs rank (Careers360 / published analyses), stored as a
 * share of maximum marks so it survives the 800 → 720 change.
 */
export const NEET_PG_RANK_ANCHORS: Array<{ share: number; rank: number }> = [
  { share: 707 / 800, rank: 1 },
  { share: 690 / 800, rank: 11 },
  { share: 678 / 800, rank: 28 },
  { share: 640 / 800, rank: 511 },
  { share: 618 / 800, rank: 1500 },
  { share: 586 / 800, rank: 4606 },
  { share: 555 / 800, rank: 10000 },
  { share: 535 / 800, rank: 14889 },
  { share: 486 / 800, rank: 28856 },
  { share: 427 / 800, rank: 50000 },
  { share: 276 / 800, rank: 130000 },
];

/** AIQ (General) govt closing ranks 2025 — the targets that matter. */
export const NEET_PG_TARGETS = [
  { key: "md-clinical", label: "MD/MS clinical (govt, AIQ)", rank: 18000, note: "MD General Medicine closed ≈ 17,190 · Paediatrics ≈ 18,067" },
  { key: "derm", label: "MD Dermatology (govt)", rank: 15000, note: "closed ≈ 15,146" },
  { key: "radio", label: "MD Radiodiagnosis (govt)", rank: 6500, note: "closed ≈ 6,656" },
];
