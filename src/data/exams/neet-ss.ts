import { deepen, type SyllabusChapter } from "@/data/exams/neet-pg";
import { SS_DEPTH } from "./neet-ss-depth";

/**
 * NEET SS (NBEMS) — group-wise papers for DM / MCh / DrNB admission.
 * Paper (2025 cycle, as reported): 150 MCQs, 600 marks, +4/−1, three timed
 * sections of 50 (50 min each). Questions: ~40% from the feeder broad
 * specialty, ~60% from the super-specialty courses chosen at registration.
 * Chapter lists follow the standard curriculum of each course; NBEMS publishes
 * no chapter weights, so chapters share their part's weight equally.
 */

export type SsSpecialty = { key: string; name: string; degree: "DM" | "MCh"; chapters: SyllabusChapter[] };
export type SsGroup = { key: string; name: string; feeder: { name: string; chapters: SyllabusChapter[] }; specialties: SsSpecialty[]; hue: number };

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const chs = (list: Array<[string, string[]]>): SyllabusChapter[] => list.map(([name, topics]) => ({ key: slug(name), name, topics }));
const sp = (name: string, degree: "DM" | "MCh", list: Array<[string, string[]]>): SsSpecialty => ({ key: slug(name), name, degree, chapters: chs(list) });

export const NEET_SS_PAPER = { questions: 150, marks: 600, sections: 3, minutes: 150, plus: 4, minus: 1, feederShare: 0.4 };

const SS_BASE: SsGroup[] = [
  {
    key: "medicine", name: "Medicine group", hue: 200,
    feeder: { name: "MD General Medicine", chapters: chs([
      ["Cardiology", ["Heart failure", "ACS", "Arrhythmias", "Valvular disease"]],
      ["Respiratory medicine", ["Airway disease", "ILD", "Pulmonary vascular disease"]],
      ["Gastroenterology & hepatology", ["Liver disease", "IBD", "GI bleeding"]],
      ["Nephrology", ["AKI & CKD", "Glomerular disease", "Electrolytes & acid-base"]],
      ["Endocrinology & metabolism", ["Diabetes", "Thyroid", "Adrenal & pituitary"]],
      ["Haematology", ["Anaemias", "Haematological malignancy", "Haemostasis"]],
      ["Neurology", ["Stroke", "Epilepsy", "Neuromuscular disease"]],
      ["Rheumatology & immunology", ["Connective tissue disease", "Vasculitis", "Arthritides"]],
      ["Infectious diseases", ["Sepsis", "HIV", "Tropical infections"]],
      ["Oncology", ["Solid tumours", "Oncological emergencies"]],
      ["Critical care & toxicology", ["Ventilation", "Shock", "Poisoning"]],
      ["Genetics, geriatrics & clinical pharmacology", ["Genetic disease", "Geriatric syndromes", "Drug therapy"]],
    ]) },
    specialties: [
      sp("Cardiology", "DM", [["Heart failure & cardiomyopathy", []], ["Coronary artery disease & ACS", []], ["Arrhythmias & electrophysiology", []], ["Valvular heart disease", []], ["Congenital heart disease (adult)", []], ["Pericardial & myocardial disease", []], ["Hypertension & vascular disease", []], ["Pulmonary hypertension", []], ["Cardiac imaging & echocardiography", []], ["Interventional cardiology", []]]),
      sp("Neurology", "DM", [["Neuroanatomy & localisation", []], ["Stroke & neurovascular disease", []], ["Epilepsy & EEG", []], ["Movement disorders", []], ["Demyelinating disease", []], ["Neuromuscular disease & EMG", []], ["Dementia & cognitive disorders", []], ["Headache", []], ["CNS infections", []], ["Neuro-oncology & neurogenetics", []]]),
      sp("Nephrology", "DM", [["Renal physiology", []], ["Acute kidney injury", []], ["Chronic kidney disease", []], ["Glomerular diseases", []], ["Tubulointerstitial disease", []], ["Fluid, electrolyte & acid-base", []], ["Dialysis", []], ["Renal transplantation", []], ["Hypertension & renovascular disease", []], ["Paediatric & genetic nephrology", []]]),
      sp("Medical Gastroenterology", "DM", [["Oesophagus", []], ["Stomach & duodenum", []], ["Small intestine & malabsorption", []], ["Inflammatory bowel disease", []], ["Pancreas", []], ["Liver disease", []], ["Biliary tract", []], ["GI bleeding", []], ["GI oncology", []], ["Endoscopy", []]]),
      sp("Hepatology", "DM", [["Viral hepatitis", []], ["Alcoholic & metabolic liver disease", []], ["Cirrhosis & portal hypertension", []], ["Acute liver failure", []], ["Autoimmune & cholestatic disease", []], ["Liver tumours", []], ["Liver transplantation", []], ["Paediatric hepatology", []]]),
      sp("Endocrinology", "DM", [["Diabetes mellitus", []], ["Thyroid", []], ["Pituitary & hypothalamus", []], ["Adrenal", []], ["Calcium & bone", []], ["Reproductive endocrinology", []], ["Obesity & lipids", []], ["Paediatric endocrinology", []], ["Endocrine tumours", []]]),
      sp("Clinical Haematology", "DM", [["Red cell disorders", []], ["Bone marrow failure", []], ["Acute leukaemias", []], ["Chronic leukaemias & MPN", []], ["Lymphomas", []], ["Plasma cell disorders", []], ["Haemostasis & thrombosis", []], ["Transfusion medicine", []], ["Stem cell transplantation", []]]),
      sp("Clinical Immunology & Rheumatology", "DM", [["Basic immunology", []], ["Rheumatoid arthritis", []], ["SLE & connective tissue disease", []], ["Vasculitides", []], ["Spondyloarthropathies", []], ["Crystal arthropathy", []], ["Myositis & scleroderma", []], ["Primary immunodeficiency", []], ["Immunotherapeutics", []]]),
      sp("Infectious Diseases", "DM", [["Antimicrobial stewardship", []], ["Bacterial infections", []], ["HIV medicine", []], ["Tuberculosis", []], ["Fungal infections", []], ["Tropical & parasitic infections", []], ["Healthcare-associated infections", []], ["Infections in the immunocompromised", []], ["Emerging infections & vaccination", []]]),
      sp("Medical Oncology", "DM", [["Cancer biology", []], ["Chemotherapy principles", []], ["Targeted & immunotherapy", []], ["Breast cancer", []], ["Lung cancer", []], ["GI cancers", []], ["Genitourinary cancers", []], ["Haematological malignancy", []], ["Supportive & palliative care", []]]),
      sp("Medical Genetics", "DM", [["Chromosomal disorders", []], ["Mendelian disorders", []], ["Molecular diagnostics", []], ["Inborn errors of metabolism", []], ["Prenatal diagnosis & counselling", []], ["Cancer genetics", []]]),
      sp("Critical Care Medicine", "DM", [["Respiratory failure & ventilation", []], ["Shock & haemodynamics", []], ["Sepsis", []], ["Neurocritical care", []], ["Renal replacement therapy", []], ["Trauma & burns", []], ["Toxicology", []], ["Ethics & end-of-life care", []]]),
    ],
  },
  {
    key: "surgery", name: "Surgery group", hue: 0,
    feeder: { name: "MS General Surgery", chapters: chs([
      ["Principles of surgery", ["Wound healing", "Surgical infections", "Shock & fluids"]],
      ["Trauma & burns", ["ATLS", "Abdominal & chest trauma", "Burns"]],
      ["Head, neck & endocrine", ["Thyroid", "Parathyroid", "Salivary glands"]],
      ["Breast", ["Breast cancer", "Benign disease"]],
      ["Upper GI", ["Oesophagus", "Stomach"]],
      ["Hepatobiliary & pancreas", ["Gall bladder", "Liver", "Pancreas"]],
      ["Small & large bowel", ["Intestinal obstruction", "Colorectal cancer", "IBD surgery"]],
      ["Hernia & abdominal wall", ["Groin hernia", "Ventral hernia"]],
      ["Vascular", ["Arterial disease", "Venous disease"]],
      ["Urology", ["Stones", "Prostate", "Urological cancers"]],
      ["Paediatric & plastic surgery basics", ["Congenital anomalies", "Grafts & flaps"]],
      ["Oncology & minimal access", ["Surgical oncology principles", "Laparoscopy"]],
    ]) },
    specialties: [
      sp("Neurosurgery", "MCh", [["Neuroanatomy & neurophysiology", []], ["Head injury", []], ["Brain tumours", []], ["Spinal disorders & tumours", []], ["Cerebrovascular surgery", []], ["Hydrocephalus & paediatric neurosurgery", []], ["Functional neurosurgery", []], ["Peripheral nerve surgery", []], ["Neuro-critical care", []]]),
      sp("Urology", "MCh", [["Urological anatomy & physiology", []], ["Urolithiasis & endourology", []], ["BPH & LUTS", []], ["Prostate cancer", []], ["Renal & bladder cancer", []], ["Paediatric urology", []], ["Andrology & infertility", []], ["Renal transplantation", []], ["Female & neuro-urology", []]]),
      sp("Surgical Gastroenterology", "MCh", [["Oesophagus", []], ["Stomach & duodenum", []], ["Hepatobiliary surgery", []], ["Pancreatic surgery", []], ["Small & large bowel", []], ["Colorectal & anal surgery", []], ["GI oncology", []], ["Bariatric & metabolic surgery", []], ["Liver transplantation", []]]),
      sp("Cardiovascular & Thoracic Surgery", "MCh", [["Cardiopulmonary bypass", []], ["Coronary artery bypass", []], ["Valve surgery", []], ["Congenital heart surgery", []], ["Aortic surgery", []], ["Thoracic oncology", []], ["Heart & lung transplantation", []], ["Vascular surgery basics", []]]),
      sp("Paediatric Surgery", "MCh", [["Neonatal surgery", []], ["Congenital GI anomalies", []], ["Paediatric urology", []], ["Paediatric oncology", []], ["Hepatobiliary in children", []], ["Thoracic paediatric surgery", []], ["Paediatric trauma", []]]),
      sp("Plastic & Reconstructive Surgery", "MCh", [["Wound healing & grafts", []], ["Flaps & microsurgery", []], ["Burns & reconstruction", []], ["Cleft lip & palate", []], ["Hand surgery", []], ["Craniofacial surgery", []], ["Aesthetic surgery", []]]),
      sp("Surgical Oncology", "MCh", [["Cancer biology & staging", []], ["Head & neck cancers", []], ["Breast cancer surgery", []], ["GI cancers", []], ["Gynaecological cancers", []], ["Soft tissue sarcoma", []], ["Multimodality therapy", []]]),
      sp("Vascular Surgery", "MCh", [["Arterial occlusive disease", []], ["Aneurysms", []], ["Carotid disease", []], ["Venous disease", []], ["Vascular trauma", []], ["Endovascular techniques", []]]),
      sp("Endocrine Surgery", "MCh", [["Thyroid surgery", []], ["Parathyroid surgery", []], ["Adrenal surgery", []], ["Neuroendocrine tumours", []], ["Endocrine breast surgery", []]]),
      sp("Hepato-Pancreato-Biliary Surgery", "MCh", [["Liver resection", []], ["Biliary surgery", []], ["Pancreatic surgery", []], ["Portal hypertension surgery", []], ["Liver transplantation", []]]),
      sp("Thoracic Surgery", "MCh", [["Lung cancer surgery", []], ["Mediastinal disease", []], ["Oesophageal surgery", []], ["Chest wall & pleura", []], ["Thoracoscopic surgery", []]]),
    ],
  },
  {
    key: "paediatrics", name: "Paediatrics group", hue: 180,
    feeder: { name: "MD Paediatrics", chapters: chs([
      ["Growth, development & nutrition", []], ["Neonatology", []], ["Infectious diseases & immunisation", []], ["Cardiology", []], ["Respiratory", []], ["Gastroenterology & hepatology", []], ["Nephrology", []], ["Neurology", []], ["Haemato-oncology", []], ["Endocrinology & genetics", []], ["Paediatric emergencies & critical care", []],
    ]) },
    specialties: [
      sp("Neonatology", "DM", [["Fetal & neonatal physiology", []], ["Neonatal resuscitation", []], ["Respiratory disorders & ventilation", []], ["Neonatal jaundice", []], ["Neonatal sepsis", []], ["Prematurity & nutrition", []], ["Neonatal neurology", []], ["Follow-up of high-risk neonates", []]]),
      sp("Paediatric Cardiology", "DM", [["Fetal circulation", []], ["Acyanotic congenital heart disease", []], ["Cyanotic congenital heart disease", []], ["Rheumatic heart disease", []], ["Arrhythmias in children", []], ["Echocardiography", []], ["Interventional procedures", []]]),
      sp("Paediatric Neurology", "DM", [["Developmental neurology", []], ["Epilepsy", []], ["Neuromuscular disorders", []], ["Neurometabolic disorders", []], ["CNS infections", []], ["Movement disorders", []]]),
      sp("Paediatric Nephrology", "DM", [["Nephrotic syndrome", []], ["Glomerulonephritis", []], ["AKI & CKD in children", []], ["Urinary tract infection & VUR", []], ["Tubular disorders", []], ["Dialysis & transplantation", []]]),
      sp("Paediatric Gastroenterology & Hepatology", "DM", [["Chronic diarrhoea & malabsorption", []], ["Neonatal cholestasis", []], ["Chronic liver disease", []], ["IBD in children", []], ["GI bleeding", []], ["Nutrition & endoscopy", []]]),
      sp("Paediatric Haemato-Oncology", "DM", [["Anaemias & haemoglobinopathies", []], ["Bleeding disorders", []], ["Acute leukaemias", []], ["Solid tumours", []], ["Stem cell transplantation", []], ["Supportive care", []]]),
      sp("Paediatric Critical Care", "DM", [["Respiratory failure", []], ["Shock & sepsis", []], ["Neurocritical care", []], ["Fluid & electrolytes", []], ["Procedures & ventilation", []]]),
    ],
  },
  {
    key: "obg", name: "Obstetrics & Gynaecology group", hue: 320,
    feeder: { name: "MD/MS Obstetrics & Gynaecology", chapters: chs([
      ["Reproductive physiology", []], ["Antenatal & intrapartum care", []], ["High-risk pregnancy", []], ["Operative obstetrics", []], ["Gynaecological endocrinology", []], ["Infertility", []], ["Gynaecological oncology", []], ["Urogynaecology", []], ["Contraception & family planning", []],
    ]) },
    specialties: [
      sp("Gynaecological Oncology", "MCh", [["Cervical cancer", []], ["Endometrial cancer", []], ["Ovarian cancer", []], ["Vulval & vaginal cancer", []], ["Gestational trophoblastic disease", []], ["Radical surgery techniques", []], ["Chemotherapy & radiotherapy", []]]),
      sp("Reproductive Medicine & Surgery", "MCh", [["Reproductive endocrinology", []], ["Ovulation induction", []], ["ART & IVF", []], ["Male infertility", []], ["Endoscopic reproductive surgery", []], ["Recurrent pregnancy loss", []]]),
      sp("Maternal & Fetal Medicine", "DM", [["Fetal imaging & diagnosis", []], ["Fetal therapy", []], ["Medical disorders in pregnancy", []], ["Twin pregnancy", []], ["Fetal growth restriction", []]]),
    ],
  },
  {
    key: "orthopaedics", name: "Orthopaedics group", hue: 30,
    feeder: { name: "MS Orthopaedics", chapters: chs([
      ["Fractures & trauma", []], ["Spine", []], ["Arthroplasty & arthritis", []], ["Sports medicine", []], ["Paediatric orthopaedics", []], ["Bone tumours & infection", []], ["Hand & upper limb", []],
    ]) },
    specialties: [
      sp("Hand Surgery", "MCh", [["Hand anatomy", []], ["Tendon injuries", []], ["Nerve injuries & repair", []], ["Hand fractures", []], ["Microsurgery & replantation", []], ["Congenital hand anomalies", []]]),
      sp("Paediatric Orthopaedics", "MCh", [["CTEV & foot deformities", []], ["DDH & hip disorders", []], ["Cerebral palsy", []], ["Paediatric fractures", []], ["Skeletal dysplasias", []]]),
      sp("Spine Surgery", "MCh", [["Degenerative spine", []], ["Spinal deformity", []], ["Spinal trauma", []], ["Spinal infection & tumours", []]]),
    ],
  },
  {
    key: "anaesthesia", name: "Anaesthesiology group", hue: 170,
    feeder: { name: "MD Anaesthesiology", chapters: chs([
      ["Physiology & pharmacology", []], ["Airway management", []], ["Monitoring", []], ["Regional anaesthesia", []], ["Subspecialty anaesthesia", []], ["Critical care", []], ["Pain medicine", []],
    ]) },
    specialties: [
      sp("Cardiac Anaesthesia", "DM", [["Cardiopulmonary bypass", []], ["Anaesthesia for CABG & valves", []], ["Congenital cardiac anaesthesia", []], ["TEE", []], ["Post-cardiac surgery ICU", []]]),
      sp("Neuro Anaesthesia", "DM", [["Neurophysiology & ICP", []], ["Anaesthesia for craniotomy", []], ["Spine surgery anaesthesia", []], ["Neuromonitoring", []], ["Neurocritical care", []]]),
      sp("Paediatric Anaesthesia", "DM", [["Neonatal anaesthesia", []], ["Paediatric airway", []], ["Regional blocks in children", []], ["Paediatric ICU", []]]),
      sp("Onco-Anaesthesia & Palliative Medicine", "DM", [["Cancer pain", []], ["Anaesthesia for cancer surgery", []], ["Palliative care", []], ["Symptom management", []]]),
    ],
  },
  {
    key: "radiology", name: "Radiodiagnosis group", hue: 190,
    feeder: { name: "MD Radiodiagnosis", chapters: chs([
      ["Physics & radiation safety", []], ["Neuroradiology", []], ["Chest imaging", []], ["Abdominal imaging", []], ["Musculoskeletal imaging", []], ["Interventional basics", []], ["Paediatric radiology", []],
    ]) },
    specialties: [
      sp("Neuroradiology", "DM", [["Brain tumours imaging", []], ["Stroke imaging", []], ["Spine imaging", []], ["Head & neck imaging", []], ["Neurointervention", []]]),
      sp("Interventional Radiology", "DM", [["Vascular intervention", []], ["Non-vascular intervention", []], ["Oncology intervention", []], ["Neuro intervention", []], ["Image-guided biopsy", []]]),
    ],
  },
  {
    key: "psychiatry", name: "Psychiatry group", hue: 280,
    feeder: { name: "MD Psychiatry", chapters: chs([
      ["Psychopathology & classification", []], ["Psychotic disorders", []], ["Mood & anxiety disorders", []], ["Substance use", []], ["Child psychiatry", []], ["Psychopharmacology", []], ["Psychotherapy", []], ["Forensic & legal psychiatry", []],
    ]) },
    specialties: [
      sp("Child & Adolescent Psychiatry", "DM", [["Neurodevelopmental disorders", []], ["ADHD & behavioural disorders", []], ["Mood disorders in youth", []], ["Psychopharmacology in children", []]]),
      sp("Geriatric Mental Health", "DM", [["Dementia", []], ["Late-life depression", []], ["Delirium", []], ["Geriatric psychopharmacology", []]]),
      sp("Addiction Psychiatry", "DM", [["Alcohol use disorder", []], ["Opioid use disorder", []], ["Behavioural addictions", []], ["Pharmacotherapy of addiction", []]]),
    ],
  },
  {
    key: "respiratory", name: "Respiratory Medicine group", hue: 210,
    feeder: { name: "MD Respiratory Medicine", chapters: chs([
      ["Airway disease", []], ["Infections & TB", []], ["Interstitial lung disease", []], ["Pulmonary vascular disease", []], ["Sleep medicine", []], ["Lung cancer", []], ["Critical care & ventilation", []],
    ]) },
    specialties: [
      sp("Pulmonary Medicine & Critical Care", "DM", [["Advanced airway disease", []], ["ILD", []], ["Pulmonary hypertension", []], ["Interventional pulmonology", []], ["Sleep disorders", []], ["Mechanical ventilation", []], ["Lung transplantation", []]]),
    ],
  },
  {
    key: "pathology", name: "Pathology group", hue: 340,
    feeder: { name: "MD Pathology", chapters: chs([
      ["General pathology", []], ["Haematopathology", []], ["Systemic pathology", []], ["Cytopathology", []], ["Transfusion medicine", []], ["Molecular pathology", []],
    ]) },
    specialties: [
      sp("Haematopathology", "DM", [["Bone marrow pathology", []], ["Leukaemia diagnostics", []], ["Lymphoma pathology", []], ["Flow cytometry", []], ["Molecular haematology", []]]),
      sp("Neuropathology", "DM", [["CNS tumours (WHO classification)", []], ["Neurodegenerative disease", []], ["Neuromuscular pathology", []], ["CNS infections", []]]),
    ],
  },
  {
    key: "microbiology", name: "Microbiology group", hue: 150,
    feeder: { name: "MD Microbiology", chapters: chs([
      ["Bacteriology", []], ["Virology", []], ["Mycology", []], ["Parasitology", []], ["Immunology", []], ["Hospital infection control", []], ["Molecular diagnostics", []],
    ]) },
    specialties: [
      sp("Virology", "DM", [["Diagnostic virology", []], ["Respiratory viruses", []], ["Hepatitis viruses", []], ["HIV", []], ["Emerging viral infections", []]]),
      sp("Infectious Diseases (Microbiology)", "DM", [["Clinical microbiology", []], ["Antimicrobial resistance", []], ["Infection control", []], ["Tropical infections", []]]),
    ],
  },
  {
    key: "pharmacology", name: "Pharmacology group", hue: 265,
    feeder: { name: "MD Pharmacology", chapters: chs([
      ["General pharmacology", []], ["Systemic pharmacology", []], ["Clinical trials & regulation", []], ["Pharmacovigilance", []], ["Pharmacogenomics", []],
    ]) },
    specialties: [
      sp("Clinical Pharmacology", "DM", [["Clinical pharmacokinetics", []], ["Therapeutic drug monitoring", []], ["Drug development", []], ["Pharmacoeconomics", []], ["Rational prescribing", []]]),
    ],
  },
  {
    key: "ent", name: "ENT group", hue: 60,
    feeder: { name: "MS ENT", chapters: chs([
      ["Otology", []], ["Rhinology", []], ["Laryngology", []], ["Head & neck oncology", []], ["Paediatric ENT", []],
    ]) },
    specialties: [
      sp("Head & Neck Surgery", "MCh", [["Oral cavity & oropharynx cancer", []], ["Laryngeal cancer", []], ["Thyroid & salivary tumours", []], ["Reconstruction", []]]),
      sp("Neuro-otology", "DM", [["Vestibular disorders", []], ["Hearing loss & implants", []], ["Skull base", []]]),
    ],
  },
];

const deepChapters = (prefix: string, list: SyllabusChapter[]) => list.map((c) => ({ ...c, topics: deepen(c.topics, SS_DEPTH[`${prefix}/${c.key}`]) }));

export const NEET_SS_GROUPS: SsGroup[] = SS_BASE.map((g) => ({
  ...g,
  feeder: { ...g.feeder, chapters: deepChapters(`${g.key}-feeder`, g.feeder.chapters) },
  specialties: g.specialties.map((s) => ({ ...s, chapters: deepChapters(s.key, s.chapters) })),
}));
