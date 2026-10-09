/**
 * NEET SS topic depth: the examinable topics inside every chapter, merged
 * onto the chapter lists in neet-ss.ts. Keys are `<specialty>/<chapter>` or
 * `<group>-feeder/<chapter>`; topics are separated by "|". Drawn from the
 * standard DM/MCh/DrNB curricula and recurring NEET SS question areas.
 */
export const SS_DEPTH: Record<string, string> = {
  /* ── Medicine group · feeder (MD General Medicine) ── */
  "medicine-feeder/cardiology": "Infective endocarditis|Cardiomyopathies|Hypertension & emergencies|ECG interpretation|Pericardial disease",
  "medicine-feeder/respiratory-medicine": "Asthma & COPD|Pneumonia|Pleural effusion|Tuberculosis|Sleep apnoea",
  "medicine-feeder/gastroenterology-and-hepatology": "Viral hepatitis|Pancreatitis|Malabsorption|Cirrhosis complications",
  "medicine-feeder/nephrology": "Renal replacement therapy|Renal tubular acidosis|Hyponatraemia & hyperkalaemia",
  "medicine-feeder/endocrinology-and-metabolism": "Calcium & bone disorders|Endocrine emergencies|Lipid disorders|Obesity",
  "medicine-feeder/haematology": "Thrombosis & anticoagulation|Transfusion medicine|Myeloproliferative neoplasms",
  "medicine-feeder/neurology": "Movement disorders|Demyelination|Headache|CNS infections|Dementia",
  "medicine-feeder/rheumatology-and-immunology": "Spondyloarthritis|Gout & crystal disease|Immunodeficiency",
  "medicine-feeder/infectious-diseases": "Antimicrobial therapy|Fungal infections|Vaccination|Fever of unknown origin",
  "medicine-feeder/oncology": "Paraneoplastic syndromes|Chemotherapy toxicity|Tumour markers",
  "medicine-feeder/critical-care-and-toxicology": "Sepsis bundles|ARDS|Snake bite & envenomation|Organophosphate poisoning",
  "medicine-feeder/genetics-geriatrics-and-clinical-pharmacology": "Adverse drug reactions|Polypharmacy|Pharmacogenomics",

  /* ── DM Cardiology ── */
  "cardiology/heart-failure-and-cardiomyopathy": "HFrEF guideline therapy|HFpEF|Hypertrophic cardiomyopathy|Dilated cardiomyopathy|Restrictive & infiltrative cardiomyopathy|Devices: ICD, CRT, LVAD",
  "cardiology/coronary-artery-disease-and-acs": "Stable angina|STEMI management|NSTE-ACS risk scores|Antiplatelets & anticoagulants|Mechanical complications of MI|Secondary prevention",
  "cardiology/arrhythmias-and-electrophysiology": "Atrial fibrillation|SVT & WPW|Ventricular tachycardia|Brady-arrhythmias & pacing|Channelopathies (Brugada, LQTS)|Sudden cardiac death",
  "cardiology/valvular-heart-disease": "Rheumatic mitral stenosis|Mitral regurgitation|Aortic stenosis & TAVR|Aortic regurgitation|Prosthetic valves|Infective endocarditis",
  "cardiology/congenital-heart-disease-adult": "ASD, VSD, PDA|Tetralogy of Fallot repaired|Eisenmenger syndrome|Coarctation of aorta|Pregnancy in heart disease",
  "cardiology/pericardial-and-myocardial-disease": "Acute pericarditis|Cardiac tamponade|Constrictive pericarditis|Myocarditis|Cardiac tumours",
  "cardiology/hypertension-and-vascular-disease": "Resistant hypertension|Secondary hypertension|Aortic dissection|Peripheral arterial disease|Takayasu arteritis",
  "cardiology/pulmonary-hypertension": "WHO classification|Haemodynamic diagnosis|PAH therapy|CTEPH|Right heart failure",
  "cardiology/cardiac-imaging-and-echocardiography": "Echo quantification|Stress testing|Cardiac CT|Cardiac MRI|Nuclear cardiology",
  "cardiology/interventional-cardiology": "Coronary angiography|PCI & stents|FFR & intravascular imaging|Structural interventions|Complications of catheterisation",

  /* ── DM Neurology ── */
  "neurology/neuroanatomy-and-localisation": "Brainstem syndromes|Spinal cord syndromes|Cortical localisation|Cranial nerve lesions|Plexus & root lesions",
  "neurology/stroke-and-neurovascular-disease": "Ischaemic stroke thrombolysis|Thrombectomy selection|Intracerebral haemorrhage|Subarachnoid haemorrhage|CVT|Secondary prevention",
  "neurology/epilepsy-and-eeg": "ILAE classification|Epilepsy syndromes|Antiseizure drugs|Status epilepticus|EEG patterns|Epilepsy surgery",
  "neurology/movement-disorders": "Parkinson's disease|Atypical parkinsonism|Dystonia|Chorea & Huntington's|Tremor|Wilson's disease",
  "neurology/demyelinating-disease": "Multiple sclerosis criteria|Disease-modifying therapy|NMOSD|MOGAD|ADEM",
  "neurology/neuromuscular-disease-and-emg": "Guillain-Barré syndrome|CIDP|Myasthenia gravis|Muscular dystrophies|Motor neurone disease|Nerve conduction & EMG",
  "neurology/dementia-and-cognitive-disorders": "Alzheimer's disease|Frontotemporal dementia|Lewy body dementia|Vascular dementia|Prion disease",
  "neurology/headache": "Migraine|Cluster headache|Idiopathic intracranial hypertension|Secondary headache red flags",
  "neurology/cns-infections": "Bacterial meningitis|TB meningitis|Viral encephalitis|Neurocysticercosis|Autoimmune encephalitis",
  "neurology/neuro-oncology-and-neurogenetics": "Gliomas|Paraneoplastic syndromes|Hereditary ataxias|Leukodystrophies|Neurocutaneous syndromes",

  /* ── DM Nephrology ── */
  "nephrology/renal-physiology": "Glomerular filtration|Tubular transport|Concentration & dilution|Renin-angiotensin system",
  "nephrology/acute-kidney-injury": "KDIGO staging|Prerenal vs ATN|Contrast nephropathy|Rhabdomyolysis|Hepatorenal syndrome",
  "nephrology/chronic-kidney-disease": "CKD staging|CKD-MBD|Anaemia of CKD|Progression & RAAS blockade|Uraemic complications",
  "nephrology/glomerular-diseases": "Minimal change & FSGS|Membranous nephropathy|IgA nephropathy|Lupus nephritis|RPGN & ANCA|C3 glomerulopathy",
  "nephrology/tubulointerstitial-disease": "Acute interstitial nephritis|Analgesic & drug nephropathy|Reflux nephropathy|Myeloma kidney",
  "nephrology/fluid-electrolyte-and-acid-base": "Hyponatraemia|Hyper/hypokalaemia|Metabolic acidosis|Metabolic alkalosis|Calcium & phosphate",
  "nephrology/dialysis": "Haemodialysis adequacy|Vascular access|Peritoneal dialysis|Dialysis complications|CRRT",
  "nephrology/renal-transplantation": "Donor & recipient work-up|Immunosuppression|Acute rejection|Chronic allograft injury|Post-transplant infections",
  "nephrology/hypertension-and-renovascular-disease": "Renal artery stenosis|Fibromuscular dysplasia|Scleroderma renal crisis|Thrombotic microangiopathy",
  "nephrology/paediatric-and-genetic-nephrology": "ADPKD|Alport syndrome|Fabry disease|Congenital anomalies of kidney",

  /* ── DM Medical Gastroenterology ── */
  "medical-gastroenterology/oesophagus": "GERD & Barrett's|Achalasia|Eosinophilic oesophagitis|Oesophageal cancer",
  "medical-gastroenterology/stomach-and-duodenum": "H. pylori|Peptic ulcer disease|Gastroparesis|Gastric cancer & MALToma",
  "medical-gastroenterology/small-intestine-and-malabsorption": "Coeliac disease|Tropical sprue|SIBO|Intestinal TB|Whipple's disease",
  "medical-gastroenterology/inflammatory-bowel-disease": "Ulcerative colitis|Crohn's disease|Biologics in IBD|Acute severe colitis|IBD vs intestinal TB",
  "medical-gastroenterology/pancreas": "Acute pancreatitis|Chronic pancreatitis|Autoimmune pancreatitis|Pancreatic cysts",
  "medical-gastroenterology/liver-disease": "Viral hepatitis|NAFLD/MASLD|Cirrhosis|Drug-induced liver injury",
  "medical-gastroenterology/biliary-tract": "Gallstone disease|Cholangitis|PSC|Cholangiocarcinoma",
  "medical-gastroenterology/gi-bleeding": "Variceal bleeding|Non-variceal upper GI bleed|Lower GI bleeding|Obscure GI bleeding",
  "medical-gastroenterology/gi-oncology": "Colorectal cancer screening|Polyposis syndromes|Neuroendocrine tumours|GIST",
  "medical-gastroenterology/endoscopy": "Diagnostic endoscopy|ERCP|EUS|Therapeutic endoscopy|Capsule endoscopy",

  /* ── DM Hepatology ── */
  "hepatology/viral-hepatitis": "Hepatitis B natural history & antivirals|Hepatitis C DAAs|Hepatitis D & E|Occult HBV",
  "hepatology/alcoholic-and-metabolic-liver-disease": "Alcoholic hepatitis scores|MASLD fibrosis assessment|Wilson's disease|Haemochromatosis",
  "hepatology/cirrhosis-and-portal-hypertension": "HVPG & varices|Ascites & SBP|Hepatic encephalopathy|Hepatorenal syndrome|TIPS",
  "hepatology/acute-liver-failure": "Causes & King's criteria|ACLF|Intensive care in liver failure",
  "hepatology/autoimmune-and-cholestatic-disease": "Autoimmune hepatitis|PBC|PSC|Overlap syndromes",
  "hepatology/liver-tumours": "HCC surveillance & BCLC|Benign liver lesions|Cholangiocarcinoma",
  "hepatology/liver-transplantation": "MELD & listing|Living donor transplant|Post-transplant care",
  "hepatology/paediatric-hepatology": "Biliary atresia|Neonatal cholestasis|Metabolic liver disease",

  /* ── DM Endocrinology ── */
  "endocrinology/diabetes-mellitus": "Type 1 & type 2 pathogenesis|Insulin regimens|SGLT2i & GLP-1RA|DKA & HHS|Diabetic complications|MODY & atypical diabetes",
  "endocrinology/thyroid": "Thyrotoxicosis|Hypothyroidism|Thyroid nodules & cancer|Thyroid in pregnancy|Thyroid eye disease",
  "endocrinology/pituitary-and-hypothalamus": "Prolactinoma|Acromegaly|Cushing's disease|Hypopituitarism|Diabetes insipidus & SIADH",
  "endocrinology/adrenal": "Primary aldosteronism|Pheochromocytoma|Adrenal insufficiency|Adrenal incidentaloma|CAH",
  "endocrinology/calcium-and-bone": "Hyperparathyroidism|Hypocalcaemia|Osteoporosis|Vitamin D & rickets|Paget's disease",
  "endocrinology/reproductive-endocrinology": "PCOS|Hypogonadism|Disorders of sex development|Menopause",
  "endocrinology/obesity-and-lipids": "Obesity pharmacotherapy|Familial hypercholesterolaemia|Hypertriglyceridaemia|Metabolic syndrome",
  "endocrinology/paediatric-endocrinology": "Short stature|Precocious puberty|Delayed puberty|Neonatal hypoglycaemia",
  "endocrinology/endocrine-tumours": "MEN syndromes|Neuroendocrine tumours|Insulinoma|Carcinoid syndrome",

  /* ── DM Clinical Haematology ── */
  "clinical-haematology/red-cell-disorders": "Iron deficiency|Megaloblastic anaemia|Thalassaemia|Sickle cell disease|Haemolytic anaemias|PNH",
  "clinical-haematology/bone-marrow-failure": "Aplastic anaemia|Inherited marrow failure|Pure red cell aplasia",
  "clinical-haematology/acute-leukaemias": "AML classification & genetics|APL|ALL|Tumour lysis syndrome",
  "clinical-haematology/chronic-leukaemias-and-mpn": "CML & TKIs|CLL|Polycythaemia vera|Essential thrombocythaemia|Myelofibrosis",
  "clinical-haematology/lymphomas": "Hodgkin lymphoma|DLBCL|Follicular lymphoma|T-cell lymphomas|Staging & PET",
  "clinical-haematology/plasma-cell-disorders": "Multiple myeloma|MGUS|AL amyloidosis|Waldenström macroglobulinaemia",
  "clinical-haematology/haemostasis-and-thrombosis": "Haemophilia|von Willebrand disease|ITP|TTP & HUS|Thrombophilia|DIC",
  "clinical-haematology/transfusion-medicine": "Blood components|Transfusion reactions|Massive transfusion|Apheresis",
  "clinical-haematology/stem-cell-transplantation": "Autologous vs allogeneic|Conditioning regimens|GVHD|Post-transplant infections",

  /* ── DM Clinical Immunology & Rheumatology ── */
  "clinical-immunology-and-rheumatology/basic-immunology": "Innate & adaptive immunity|Cytokines|Complement|Autoantibodies",
  "clinical-immunology-and-rheumatology/rheumatoid-arthritis": "Classification criteria|DMARDs|Biologics & JAK inhibitors|Extra-articular disease",
  "clinical-immunology-and-rheumatology/sle-and-connective-tissue-disease": "SLE criteria & activity|Lupus nephritis|Antiphospholipid syndrome|Sjögren's|MCTD",
  "clinical-immunology-and-rheumatology/vasculitides": "Giant cell arteritis|Takayasu arteritis|ANCA vasculitis|Polyarteritis nodosa|Behçet's disease",
  "clinical-immunology-and-rheumatology/spondyloarthropathies": "Ankylosing spondylitis|Psoriatic arthritis|Reactive arthritis|Enteropathic arthritis",
  "clinical-immunology-and-rheumatology/crystal-arthropathy": "Gout|CPPD|Urate-lowering therapy",
  "clinical-immunology-and-rheumatology/myositis-and-scleroderma": "Dermatomyositis|Polymyositis|Systemic sclerosis|Myositis antibodies",
  "clinical-immunology-and-rheumatology/primary-immunodeficiency": "Antibody deficiencies|Combined immunodeficiency|Phagocyte defects|Complement deficiency",
  "clinical-immunology-and-rheumatology/immunotherapeutics": "IVIG|Rituximab|Anti-TNF|IL-6 & IL-17 blockade|Vaccination in immunosuppression",

  /* ── DM Infectious Diseases ── */
  "infectious-diseases/antimicrobial-stewardship": "PK/PD principles|Antibiotic classes|De-escalation|Antibiograms",
  "infectious-diseases/bacterial-infections": "Enteric fever|Leptospirosis|Scrub typhus|Melioidosis|Brucellosis",
  "infectious-diseases/hiv-medicine": "ART regimens|Opportunistic infections|IRIS|PrEP & PEP|HIV drug resistance",
  "infectious-diseases/tuberculosis": "Drug-sensitive TB|MDR & XDR TB|Extrapulmonary TB|Latent TB|TB-HIV",
  "infectious-diseases/fungal-infections": "Invasive aspergillosis|Mucormycosis|Candidaemia|Cryptococcosis|Histoplasmosis",
  "infectious-diseases/tropical-and-parasitic-infections": "Malaria|Dengue|Visceral leishmaniasis|Filariasis|Chikungunya",
  "infectious-diseases/healthcare-associated-infections": "CLABSI|CAUTI|VAP|Surgical site infection|MDR gram-negatives",
  "infectious-diseases/infections-in-the-immunocompromised": "Febrile neutropenia|Transplant infections|CMV|PJP",
  "infectious-diseases/emerging-infections-and-vaccination": "COVID-19|Nipah|Adult immunisation|Travel medicine",

  /* ── DM Medical Oncology ── */
  "medical-oncology/cancer-biology": "Hallmarks of cancer|Oncogenes & tumour suppressors|Cell cycle|Tumour microenvironment",
  "medical-oncology/chemotherapy-principles": "Drug classes|Dose intensity|Toxicity management|Drug resistance",
  "medical-oncology/targeted-and-immunotherapy": "TKIs|Monoclonal antibodies|Checkpoint inhibitors|immune-related adverse events|CAR-T",
  "medical-oncology/breast-cancer": "Molecular subtypes|Adjuvant therapy|HER2-targeted therapy|Metastatic breast cancer",
  "medical-oncology/lung-cancer": "NSCLC staging|Driver mutations (EGFR, ALK)|Small cell lung cancer|Immunotherapy in lung cancer",
  "medical-oncology/gi-cancers": "Colorectal cancer|Gastric cancer|Pancreatic cancer|Hepatocellular carcinoma",
  "medical-oncology/genitourinary-cancers": "Prostate cancer|Renal cell carcinoma|Bladder cancer|Germ cell tumours",
  "medical-oncology/haematological-malignancy": "Lymphoma regimens|Myeloma therapy|Leukaemia principles",
  "medical-oncology/supportive-and-palliative-care": "Febrile neutropenia|Antiemetics|Cancer pain|Oncologic emergencies",

  /* ── DM Medical Genetics ── */
  "medical-genetics/chromosomal-disorders": "Aneuploidies|Microdeletion syndromes|Karyotype & CMA|Mosaicism",
  "medical-genetics/mendelian-disorders": "Patterns of inheritance|Penetrance & expressivity|Imprinting disorders|Trinucleotide repeats",
  "medical-genetics/molecular-diagnostics": "Sanger & NGS|Exome & genome sequencing|Variant interpretation (ACMG)|MLPA",
  "medical-genetics/inborn-errors-of-metabolism": "Aminoacidopathies|Organic acidaemias|Urea cycle defects|Lysosomal storage disorders|Newborn screening",
  "medical-genetics/prenatal-diagnosis-and-counselling": "Screening tests|CVS & amniocentesis|NIPT|Genetic counselling ethics",
  "medical-genetics/cancer-genetics": "Hereditary breast-ovarian cancer|Lynch syndrome|Li-Fraumeni|Predictive testing",

  /* ── DM Critical Care Medicine ── */
  "critical-care-medicine/respiratory-failure-and-ventilation": "ARDS ventilation|Modes of ventilation|NIV & HFNC|Weaning|ECMO",
  "critical-care-medicine/shock-and-haemodynamics": "Shock types|Fluid responsiveness|Vasopressors & inotropes|Haemodynamic monitoring",
  "critical-care-medicine/sepsis": "Sepsis-3 definitions|Surviving Sepsis bundles|Source control|Steroids in sepsis",
  "critical-care-medicine/neurocritical-care": "Raised ICP|Status epilepticus|Brain death|Targeted temperature management",
  "critical-care-medicine/renal-replacement-therapy": "Indications & timing|CRRT modes|Anticoagulation in CRRT",
  "critical-care-medicine/trauma-and-burns": "Damage control resuscitation|Burns fluid management|Traumatic brain injury",
  "critical-care-medicine/toxicology": "Paracetamol poisoning|Organophosphates|Snake envenomation|Toxic alcohols",
  "critical-care-medicine/ethics-and-end-of-life-care": "Withdrawal of support|Advance directives|Organ donation",

  /* ── Surgery group · feeder (MS General Surgery) ── */
  "surgery-feeder/principles-of-surgery": "Wound healing|Surgical infection|Fluid & nutrition|Haemorrhage & transfusion",
  "surgery-feeder/trauma-and-burns": "ATLS primary survey|Abdominal trauma|Chest trauma|Burns assessment",
  "surgery-feeder/head-neck-and-endocrine": "Thyroid swellings|Salivary tumours|Neck lumps|Parathyroid disease",
  "surgery-feeder/breast": "Breast lumps|Breast cancer management|Benign breast disease",
  "surgery-feeder/upper-gi": "Peptic ulcer complications|Gastric cancer|Oesophageal disorders",
  "surgery-feeder/hepatobiliary-and-pancreas": "Gallstones|Obstructive jaundice|Pancreatitis|Liver abscess",
  "surgery-feeder/small-and-large-bowel": "Intestinal obstruction|Appendicitis|Colorectal cancer|Anorectal disorders",
  "surgery-feeder/hernia-and-abdominal-wall": "Inguinal hernia|Ventral hernia|Mesh repair",
  "surgery-feeder/vascular": "Limb ischaemia|Varicose veins|Aneurysms",
  "surgery-feeder/urology": "Urolithiasis|BPH|Renal tumours|Scrotal swellings",
  "surgery-feeder/paediatric-and-plastic-surgery-basics": "Congenital anomalies|Skin grafts & flaps|Cleft lip",
  "surgery-feeder/oncology-and-minimal-access": "Laparoscopy principles|Cancer staging|Sentinel node biopsy",

  /* ── MCh Neurosurgery ── */
  "neurosurgery/neuroanatomy-and-neurophysiology": "Microsurgical anatomy|Cerebral blood flow|ICP dynamics|Skull base anatomy",
  "neurosurgery/head-injury": "GCS & classification|Extradural & subdural haematoma|Diffuse axonal injury|Decompressive craniectomy|ICP monitoring",
  "neurosurgery/brain-tumours": "Gliomas (WHO 2021)|Meningiomas|Pituitary adenomas|Vestibular schwannoma|Paediatric posterior fossa tumours",
  "neurosurgery/spinal-disorders-and-tumours": "Degenerative disc disease|Cervical myelopathy|Intradural tumours|Spinal cord injury",
  "neurosurgery/cerebrovascular-surgery": "Aneurysmal SAH|AVMs|Cavernomas|Moyamoya|Carotid stenosis",
  "neurosurgery/hydrocephalus-and-paediatric-neurosurgery": "Hydrocephalus & shunts|ETV|Neural tube defects|Craniosynostosis",
  "neurosurgery/functional-neurosurgery": "Deep brain stimulation|Epilepsy surgery|Trigeminal neuralgia|Spasticity surgery",
  "neurosurgery/peripheral-nerve-surgery": "Nerve injury classification|Brachial plexus injury|Entrapment neuropathies",
  "neurosurgery/neuro-critical-care": "Post-operative care|Cerebral vasospasm|Brain death",

  /* ── MCh Urology ── */
  "urology/urological-anatomy-and-physiology": "Renal & ureteric anatomy|Bladder physiology|Urodynamics",
  "urology/urolithiasis-and-endourology": "Stone metabolism|ESWL|URS & RIRS|PCNL|Medical expulsive therapy",
  "urology/bph-and-luts": "BPH pathophysiology|Medical therapy|TURP & HoLEP|Urinary retention",
  "urology/prostate-cancer": "PSA & MRI|Gleason & ISUP grading|Radical prostatectomy|ADT & advanced disease",
  "urology/renal-and-bladder-cancer": "Renal cell carcinoma|Upper tract urothelial cancer|NMIBC|Muscle-invasive bladder cancer & cystectomy",
  "urology/paediatric-urology": "VUR|PUJ obstruction|Posterior urethral valves|Hypospadias|Undescended testis",
  "urology/andrology-and-infertility": "Erectile dysfunction|Male infertility work-up|Varicocele|Peyronie's disease",
  "urology/renal-transplantation": "Donor nephrectomy|Transplant surgery|Urological complications",
  "urology/female-and-neuro-urology": "Stress incontinence|Overactive bladder|Neurogenic bladder|Fistulae",

  /* ── MCh Surgical Gastroenterology ── */
  "surgical-gastroenterology/oesophagus": "Achalasia surgery|Oesophagectomy|Corrosive injury|Hiatal hernia",
  "surgical-gastroenterology/stomach-and-duodenum": "Gastrectomy & D2 nodes|Peptic ulcer surgery|GIST",
  "surgical-gastroenterology/hepatobiliary-surgery": "Bile duct injury|Choledochal cyst|Gallbladder cancer",
  "surgical-gastroenterology/pancreatic-surgery": "Whipple's procedure|Chronic pancreatitis surgery|Pancreatic necrosis",
  "surgical-gastroenterology/small-and-large-bowel": "Intestinal failure|Small bowel obstruction|Diverticular disease",
  "surgical-gastroenterology/colorectal-and-anal-surgery": "Rectal cancer TME|Restorative proctocolectomy|Fistula-in-ano|Haemorrhoids",
  "surgical-gastroenterology/gi-oncology": "Neoadjuvant therapy|Peritoneal malignancy|Liver metastases",
  "surgical-gastroenterology/bariatric-and-metabolic-surgery": "Sleeve gastrectomy|Gastric bypass|Metabolic outcomes",
  "surgical-gastroenterology/liver-transplantation": "Indications|Living donor hepatectomy|Complications",

  /* ── MCh CTVS ── */
  "cardiovascular-and-thoracic-surgery/cardiopulmonary-bypass": "CPB circuit|Myocardial protection|Weaning from bypass|CPB complications",
  "cardiovascular-and-thoracic-surgery/coronary-artery-bypass": "Conduits|Off-pump CABG|Indications vs PCI|Post-operative care",
  "cardiovascular-and-thoracic-surgery/valve-surgery": "Mitral repair|Valve replacement|Prosthesis choice|Endocarditis surgery",
  "cardiovascular-and-thoracic-surgery/congenital-heart-surgery": "Shunts|TOF repair|TGA arterial switch|Fontan circulation",
  "cardiovascular-and-thoracic-surgery/aortic-surgery": "Aortic dissection repair|Thoracic aneurysm|Root replacement",
  "cardiovascular-and-thoracic-surgery/thoracic-oncology": "Lung resection|Mediastinal tumours|Oesophageal cancer",
  "cardiovascular-and-thoracic-surgery/heart-and-lung-transplantation": "Donor selection|Rejection|Mechanical circulatory support",
  "cardiovascular-and-thoracic-surgery/vascular-surgery-basics": "Peripheral bypass|Vascular access|Endovascular basics",

  /* ── MCh Paediatric Surgery ── */
  "paediatric-surgery/neonatal-surgery": "Oesophageal atresia & TEF|CDH|Abdominal wall defects|NEC",
  "paediatric-surgery/congenital-gi-anomalies": "Duodenal atresia|Malrotation|Hirschsprung's disease|Anorectal malformations",
  "paediatric-surgery/paediatric-urology": "Hydronephrosis|Bladder exstrophy|Hypospadias",
  "paediatric-surgery/paediatric-oncology": "Wilms tumour|Neuroblastoma|Hepatoblastoma|Germ cell tumours",
  "paediatric-surgery/hepatobiliary-in-children": "Biliary atresia & Kasai|Choledochal cyst|Portal hypertension",
  "paediatric-surgery/thoracic-paediatric-surgery": "Congenital lung lesions|Empyema|Chest wall deformities",
  "paediatric-surgery/paediatric-trauma": "Paediatric ATLS|Solid organ injury|Non-accidental injury",

  /* ── MCh Plastic & Reconstructive Surgery ── */
  "plastic-and-reconstructive-surgery/wound-healing-and-grafts": "Wound healing phases|Skin grafts|Scar management|Pressure sores",
  "plastic-and-reconstructive-surgery/flaps-and-microsurgery": "Flap classification|Free flaps|Microvascular anastomosis|Flap monitoring",
  "plastic-and-reconstructive-surgery/burns-and-reconstruction": "Burn depth & resuscitation|Excision & grafting|Contracture release|Electrical burns",
  "plastic-and-reconstructive-surgery/cleft-lip-and-palate": "Embryology & classification|Cleft repair timing|Velopharyngeal insufficiency",
  "plastic-and-reconstructive-surgery/hand-surgery": "Tendon repair|Nerve repair|Replantation",
  "plastic-and-reconstructive-surgery/craniofacial-surgery": "Facial fractures|Craniosynostosis|Orthognathic surgery",
  "plastic-and-reconstructive-surgery/aesthetic-surgery": "Rhinoplasty|Breast surgery|Body contouring",

  /* ── MCh Surgical Oncology ── */
  "surgical-oncology/cancer-biology-and-staging": "TNM staging|Tumour markers|Screening principles",
  "surgical-oncology/head-and-neck-cancers": "Oral cancer|Neck dissection|Laryngeal preservation",
  "surgical-oncology/breast-cancer-surgery": "Breast conservation|Sentinel node biopsy|Oncoplastic surgery",
  "surgical-oncology/gi-cancers": "Oesophageal & gastric cancer|Colorectal cancer|Hepatobiliary cancer",
  "surgical-oncology/gynaecological-cancers": "Ovarian cytoreduction|Cervical cancer surgery|Endometrial cancer staging",
  "surgical-oncology/soft-tissue-sarcoma": "Biopsy principles|Limb-salvage surgery|Retroperitoneal sarcoma",
  "surgical-oncology/multimodality-therapy": "Neoadjuvant therapy|Radiotherapy principles|HIPEC",

  /* ── MCh Vascular Surgery ── */
  "vascular-surgery/arterial-occlusive-disease": "Critical limb ischaemia|Bypass vs angioplasty|Diabetic foot",
  "vascular-surgery/aneurysms": "AAA screening & repair|EVAR|Peripheral aneurysms",
  "vascular-surgery/carotid-disease": "Carotid endarterectomy|Carotid stenting|Asymptomatic stenosis",
  "vascular-surgery/venous-disease": "Varicose veins & ablation|DVT management|Venous ulcers",
  "vascular-surgery/vascular-trauma": "Hard & soft signs|Repair techniques|Compartment syndrome",
  "vascular-surgery/endovascular-techniques": "Access & sheaths|Stents & grafts|Contrast & radiation safety",

  /* ── MCh Endocrine Surgery ── */
  "endocrine-surgery/thyroid-surgery": "Thyroidectomy technique|Differentiated thyroid cancer|Medullary carcinoma|Nerve monitoring",
  "endocrine-surgery/parathyroid-surgery": "Localisation studies|Minimally invasive parathyroidectomy|Secondary hyperparathyroidism",
  "endocrine-surgery/adrenal-surgery": "Laparoscopic adrenalectomy|Pheochromocytoma preparation|Adrenocortical carcinoma",
  "endocrine-surgery/neuroendocrine-tumours": "Pancreatic NETs|MEN syndromes|Insulinoma localisation",
  "endocrine-surgery/endocrine-breast-surgery": "Breast cancer surgery|Gynaecomastia",

  /* ── MCh HPB Surgery ── */
  "hepato-pancreato-biliary-surgery/liver-resection": "Couinaud segments|Future liver remnant|Portal vein embolisation",
  "hepato-pancreato-biliary-surgery/biliary-surgery": "Hilar cholangiocarcinoma|Bile duct injury repair|Hepaticojejunostomy",
  "hepato-pancreato-biliary-surgery/pancreatic-surgery": "Pancreatoduodenectomy|Distal pancreatectomy|Pancreatic fistula",
  "hepato-pancreato-biliary-surgery/portal-hypertension-surgery": "Shunt surgery|Devascularisation|EHPVO",
  "hepato-pancreato-biliary-surgery/liver-transplantation": "Graft types|Vascular complications|Biliary complications",

  /* ── MCh Thoracic Surgery ── */
  "thoracic-surgery/lung-cancer-surgery": "Lobectomy & segmentectomy|Mediastinal staging|Pulmonary function assessment",
  "thoracic-surgery/mediastinal-disease": "Thymoma|Germ cell tumours|Myasthenia & thymectomy",
  "thoracic-surgery/oesophageal-surgery": "Oesophagectomy approaches|Anastomotic leak|Benign oesophageal disease",
  "thoracic-surgery/chest-wall-and-pleura": "Empyema & decortication|Pneumothorax|Chest wall tumours",
  "thoracic-surgery/thoracoscopic-surgery": "VATS principles|Robotic thoracic surgery",

  /* ── Paediatrics group · feeder (MD Paediatrics) ── */
  "paediatrics-feeder/growth-development-and-nutrition": "Growth monitoring|Developmental milestones|Severe acute malnutrition|Micronutrient deficiencies|Breastfeeding & complementary feeding",
  "paediatrics-feeder/neonatology": "Neonatal resuscitation|Neonatal jaundice|Neonatal sepsis|Respiratory distress",
  "paediatrics-feeder/infectious-diseases-and-immunisation": "National immunisation schedule|Measles & dengue|Enteric fever|Childhood TB",
  "paediatrics-feeder/cardiology": "Congenital heart disease|Rheumatic fever|Heart failure in children",
  "paediatrics-feeder/respiratory": "Pneumonia|Bronchiolitis|Childhood asthma|Cystic fibrosis",
  "paediatrics-feeder/gastroenterology-and-hepatology": "Acute diarrhoea & ORS|Chronic liver disease|Malabsorption",
  "paediatrics-feeder/nephrology": "Nephrotic syndrome|AGN|UTI in children",
  "paediatrics-feeder/neurology": "Febrile seizures|Epilepsy|Cerebral palsy|Meningitis",
  "paediatrics-feeder/haemato-oncology": "Anaemia|Thalassaemia|ALL|Solid tumours",
  "paediatrics-feeder/endocrinology-and-genetics": "Short stature|Congenital hypothyroidism|Down syndrome|Inborn errors of metabolism",
  "paediatrics-feeder/paediatric-emergencies-and-critical-care": "PALS|Shock|Status epilepticus|Poisoning",

  /* ── DM Neonatology ── */
  "neonatology/fetal-and-neonatal-physiology": "Transition at birth|Thermoregulation|Fetal circulation|Neonatal fluid balance",
  "neonatology/neonatal-resuscitation": "NRP algorithm|Delayed cord clamping|Therapeutic hypothermia",
  "neonatology/respiratory-disorders-and-ventilation": "RDS & surfactant|BPD|PPHN|Neonatal ventilation & CPAP|Apnoea of prematurity",
  "neonatology/neonatal-jaundice": "Phototherapy thresholds|Exchange transfusion|Kernicterus|Cholestatic jaundice",
  "neonatology/neonatal-sepsis": "Early vs late-onset sepsis|Antibiotic choice|Neonatal meningitis",
  "neonatology/prematurity-and-nutrition": "Parenteral nutrition|Enteral feeding|NEC|ROP",
  "neonatology/neonatal-neurology": "HIE|IVH|Neonatal seizures",
  "neonatology/follow-up-of-high-risk-neonates": "Developmental follow-up|Hearing & vision screening|Growth catch-up",

  /* ── DM Paediatric Cardiology ── */
  "paediatric-cardiology/fetal-circulation": "Fetal shunts|Transitional circulation|Duct-dependent lesions",
  "paediatric-cardiology/acyanotic-congenital-heart-disease": "VSD|ASD|PDA|AV canal defect|Coarctation",
  "paediatric-cardiology/cyanotic-congenital-heart-disease": "Tetralogy of Fallot|TGA|TAPVC|Single ventricle physiology|Tricuspid atresia",
  "paediatric-cardiology/rheumatic-heart-disease": "Jones criteria|Secondary prophylaxis|Valve lesions in children",
  "paediatric-cardiology/arrhythmias-in-children": "SVT|Congenital heart block|Long QT",
  "paediatric-cardiology/echocardiography": "Segmental approach|Fetal echo|Doppler assessment",
  "paediatric-cardiology/interventional-procedures": "Balloon valvotomy|Device closure|Ductal stenting",

  /* ── DM Paediatric Neurology ── */
  "paediatric-neurology/developmental-neurology": "Global developmental delay|Autism spectrum disorder|Intellectual disability",
  "paediatric-neurology/epilepsy": "West syndrome|Lennox-Gastaut|Dravet syndrome|Ketogenic diet",
  "paediatric-neurology/neuromuscular-disorders": "Spinal muscular atrophy|Duchenne dystrophy|GBS in children",
  "paediatric-neurology/neurometabolic-disorders": "Leukodystrophies|Mitochondrial disorders|Neurotransmitter disorders",
  "paediatric-neurology/cns-infections": "Tubercular meningitis|Japanese encephalitis|SSPE",
  "paediatric-neurology/movement-disorders": "Sydenham chorea|Dystonia|Tic disorders",

  /* ── DM Paediatric Nephrology ── */
  "paediatric-nephrology/nephrotic-syndrome": "Steroid-sensitive NS|Steroid-resistant NS|Congenital nephrotic syndrome",
  "paediatric-nephrology/glomerulonephritis": "Post-streptococcal GN|IgA vasculitis|Lupus nephritis in children",
  "paediatric-nephrology/aki-and-ckd-in-children": "AKI causes|CKD growth & bone|Paediatric dialysis",
  "paediatric-nephrology/urinary-tract-infection-and-vur": "UTI work-up|VUR grading|Renal scarring",
  "paediatric-nephrology/tubular-disorders": "Renal tubular acidosis|Bartter & Gitelman|Nephrogenic DI",
  "paediatric-nephrology/dialysis-and-transplantation": "PD in children|Paediatric kidney transplant",

  /* ── DM Paediatric Gastroenterology & Hepatology ── */
  "paediatric-gastroenterology-and-hepatology/chronic-diarrhoea-and-malabsorption": "Coeliac disease|Cow's milk protein allergy|Congenital diarrhoeas",
  "paediatric-gastroenterology-and-hepatology/neonatal-cholestasis": "Biliary atresia|PFIC|Alagille syndrome",
  "paediatric-gastroenterology-and-hepatology/chronic-liver-disease": "Wilson's disease|Autoimmune hepatitis|Portal hypertension in children",
  "paediatric-gastroenterology-and-hepatology/ibd-in-children": "Very-early-onset IBD|Nutritional therapy",
  "paediatric-gastroenterology-and-hepatology/gi-bleeding": "Variceal bleeding|Meckel's diverticulum|Juvenile polyps",
  "paediatric-gastroenterology-and-hepatology/nutrition-and-endoscopy": "Enteral & parenteral nutrition|Paediatric endoscopy",

  /* ── DM Paediatric Haemato-oncology ── */
  "paediatric-haemato-oncology/anaemias-and-haemoglobinopathies": "Thalassaemia major & chelation|Sickle cell disease|Iron deficiency|Aplastic anaemia",
  "paediatric-haemato-oncology/bleeding-disorders": "Haemophilia|ITP in children|VWD",
  "paediatric-haemato-oncology/acute-leukaemias": "ALL risk stratification|AML in children|CNS prophylaxis",
  "paediatric-haemato-oncology/solid-tumours": "Wilms tumour|Neuroblastoma|Retinoblastoma|Medulloblastoma",
  "paediatric-haemato-oncology/stem-cell-transplantation": "Indications in children|GVHD",
  "paediatric-haemato-oncology/supportive-care": "Febrile neutropenia|Tumour lysis|Transfusion support",

  /* ── DM Paediatric Critical Care ── */
  "paediatric-critical-care/respiratory-failure": "Paediatric ARDS|Asthma in ICU|HFNC & NIV",
  "paediatric-critical-care/shock-and-sepsis": "Septic shock in children|Fluid resuscitation|Inotropes",
  "paediatric-critical-care/neurocritical-care": "Raised ICP|Status epilepticus|Traumatic brain injury",
  "paediatric-critical-care/fluid-and-electrolytes": "Dehydration|Hyponatraemia|DKA in children",
  "paediatric-critical-care/procedures-and-ventilation": "Airway management|Central lines|Ventilator strategies",

  /* ── OBG group · feeder (MS OBG) ── */
  "obg-feeder/reproductive-physiology": "Menstrual cycle|Puberty|Menopause|Placental physiology",
  "obg-feeder/antenatal-and-intrapartum-care": "Antenatal screening|Normal labour|Partograph|Fetal monitoring",
  "obg-feeder/high-risk-pregnancy": "Hypertensive disorders|GDM|Anaemia in pregnancy|Antepartum haemorrhage|PPH",
  "obg-feeder/operative-obstetrics": "Caesarean section|Instrumental delivery|Obstetric hysterectomy",
  "obg-feeder/gynaecological-endocrinology": "PCOS|Amenorrhoea|Abnormal uterine bleeding",
  "obg-feeder/infertility": "Female infertility work-up|Ovulation induction|IVF basics",
  "obg-feeder/gynaecological-oncology": "Cervical screening|Ovarian tumours|Endometrial cancer",
  "obg-feeder/urogynaecology": "Pelvic organ prolapse|Urinary incontinence|Fistulae",
  "obg-feeder/contraception-and-family-planning": "Hormonal contraception|IUCDs|Sterilisation|MTP Act",

  /* ── MCh Gynaecological Oncology ── */
  "gynaecological-oncology/cervical-cancer": "HPV & screening|FIGO staging|Radical hysterectomy|Chemoradiation",
  "gynaecological-oncology/endometrial-cancer": "Molecular classification|Surgical staging|Adjuvant therapy",
  "gynaecological-oncology/ovarian-cancer": "Epithelial ovarian cancer|Cytoreductive surgery|BRCA & PARP inhibitors|Germ cell tumours",
  "gynaecological-oncology/vulval-and-vaginal-cancer": "Vulval cancer surgery|Groin node dissection",
  "gynaecological-oncology/gestational-trophoblastic-disease": "Molar pregnancy|GTN scoring|Chemotherapy",
  "gynaecological-oncology/radical-surgery-techniques": "Pelvic lymphadenectomy|Minimally invasive radical surgery",
  "gynaecological-oncology/chemotherapy-and-radiotherapy": "Brachytherapy|Platinum regimens|Toxicities",

  /* ── MCh Reproductive Medicine & Surgery ── */
  "reproductive-medicine-and-surgery/reproductive-endocrinology": "HPO axis|Ovarian reserve tests|Endometriosis",
  "reproductive-medicine-and-surgery/ovulation-induction": "Letrozole & clomiphene|Gonadotropins|OHSS",
  "reproductive-medicine-and-surgery/art-and-ivf": "IVF protocols|ICSI|Embryo transfer|Cryopreservation|ART Act",
  "reproductive-medicine-and-surgery/male-infertility": "Semen analysis|Azoospermia|Sperm retrieval",
  "reproductive-medicine-and-surgery/endoscopic-reproductive-surgery": "Hysteroscopy|Laparoscopy for infertility|Tubal surgery",
  "reproductive-medicine-and-surgery/recurrent-pregnancy-loss": "Causes & work-up|APS in pregnancy|Management",

  /* ── MCh Maternal & Fetal Medicine ── */
  "maternal-and-fetal-medicine/fetal-imaging-and-diagnosis": "Anomaly scan|Fetal echocardiography|Aneuploidy screening",
  "maternal-and-fetal-medicine/fetal-therapy": "Intrauterine transfusion|Fetal shunts|TTTS laser",
  "maternal-and-fetal-medicine/medical-disorders-in-pregnancy": "Heart disease in pregnancy|Thyroid disorders|Epilepsy & pregnancy|Liver disease of pregnancy",
  "maternal-and-fetal-medicine/twin-pregnancy": "Chorionicity|Complications of monochorionic twins",
  "maternal-and-fetal-medicine/fetal-growth-restriction": "Doppler surveillance|Timing of delivery",

  /* ── Orthopaedics group · feeder ── */
  "orthopaedics-feeder/fractures-and-trauma": "Fracture healing|Hip fractures|Open fractures|Polytrauma|Nerve injuries",
  "orthopaedics-feeder/spine": "Spinal injuries|Spinal TB|Disc prolapse",
  "orthopaedics-feeder/arthroplasty-and-arthritis": "Osteoarthritis|Rheumatoid hand|Hip & knee replacement",
  "orthopaedics-feeder/sports-medicine": "ACL injury|Meniscal tears|Shoulder dislocation",
  "orthopaedics-feeder/paediatric-orthopaedics": "CTEV|DDH|Perthes disease",
  "orthopaedics-feeder/bone-tumours-and-infection": "Osteomyelitis|Osteosarcoma|Giant cell tumour",
  "orthopaedics-feeder/hand-and-upper-limb": "Carpal tunnel|Tendon injuries|Elbow fractures",

  /* ── MCh Hand Surgery ── */
  "hand-surgery/hand-anatomy": "Zones of flexor tendons|Intrinsic muscles|Nerve supply",
  "hand-surgery/tendon-injuries": "Flexor tendon repair|Extensor injuries|Rehabilitation",
  "hand-surgery/nerve-injuries-and-repair": "Median & ulnar nerve|Nerve grafting|Tendon transfers",
  "hand-surgery/hand-fractures": "Metacarpal fractures|Scaphoid fractures|Phalangeal fractures",
  "hand-surgery/microsurgery-and-replantation": "Replantation indications|Free tissue transfer",
  "hand-surgery/congenital-hand-anomalies": "Syndactyly|Polydactyly|Radial club hand",

  /* ── MCh Paediatric Orthopaedics ── */
  "paediatric-orthopaedics/ctev-and-foot-deformities": "Ponseti method|Vertical talus|Flat foot",
  "paediatric-orthopaedics/ddh-and-hip-disorders": "DDH screening|Perthes disease|SCFE",
  "paediatric-orthopaedics/cerebral-palsy": "Gait analysis|Spasticity management|Orthopaedic surgery in CP",
  "paediatric-orthopaedics/paediatric-fractures": "Supracondylar fracture|Physeal injuries|Non-accidental injury",
  "paediatric-orthopaedics/skeletal-dysplasias": "Achondroplasia|Osteogenesis imperfecta",

  /* ── MCh Spine Surgery ── */
  "spine-surgery/degenerative-spine": "Lumbar canal stenosis|Cervical myelopathy|Disc herniation surgery",
  "spine-surgery/spinal-deformity": "Adolescent idiopathic scoliosis|Kyphosis|Spondylolisthesis",
  "spine-surgery/spinal-trauma": "Thoracolumbar injury classification|Cervical spine injury|Spinal cord injury care",
  "spine-surgery/spinal-infection-and-tumours": "Pott's spine|Pyogenic spondylodiscitis|Spinal metastases",

  /* ── Anaesthesia group · feeder ── */
  "anaesthesia-feeder/physiology-and-pharmacology": "Inhalational agents|IV induction agents|Muscle relaxants & reversal|Opioids",
  "anaesthesia-feeder/airway-management": "Difficult airway algorithm|Supraglottic devices|Rapid sequence induction",
  "anaesthesia-feeder/monitoring": "Capnography|Invasive monitoring|Depth of anaesthesia",
  "anaesthesia-feeder/regional-anaesthesia": "Spinal & epidural|Peripheral nerve blocks|LA toxicity",
  "anaesthesia-feeder/subspecialty-anaesthesia": "Obstetric anaesthesia|Paediatric anaesthesia|Cardiac anaesthesia basics",
  "anaesthesia-feeder/critical-care": "Ventilation|Sepsis|CPR & ACLS",
  "anaesthesia-feeder/pain-medicine": "Acute pain services|Chronic pain|Cancer pain",

  /* ── DM Cardiac Anaesthesia ── */
  "cardiac-anaesthesia/cardiopulmonary-bypass": "Priming & anticoagulation|Weaning|Protamine reactions",
  "cardiac-anaesthesia/anaesthesia-for-cabg-and-valves": "Haemodynamic goals|Off-pump anaesthesia|Valve lesion physiology",
  "cardiac-anaesthesia/congenital-cardiac-anaesthesia": "Shunt physiology|PVR management",
  "cardiac-anaesthesia/tee": "Standard views|Valve assessment|Ventricular function",
  "cardiac-anaesthesia/post-cardiac-surgery-icu": "Low cardiac output|Bleeding|Arrhythmias",

  /* ── DM Neuro-anaesthesia ── */
  "neuro-anaesthesia/neurophysiology-and-icp": "Cerebral autoregulation|ICP control|Anaesthetic effects on CBF",
  "neuro-anaesthesia/anaesthesia-for-craniotomy": "Awake craniotomy|Posterior fossa surgery|Aneurysm surgery",
  "neuro-anaesthesia/spine-surgery-anaesthesia": "Prone positioning|Blood conservation",
  "neuro-anaesthesia/neuromonitoring": "SSEP & MEP|EEG & BIS",
  "neuro-anaesthesia/neurocritical-care": "TBI management|SAH care",

  /* ── DM Paediatric Anaesthesia ── */
  "paediatric-anaesthesia/neonatal-anaesthesia": "Neonatal physiology|Pyloric stenosis|TEF repair",
  "paediatric-anaesthesia/paediatric-airway": "Anatomical differences|Difficult paediatric airway",
  "paediatric-anaesthesia/regional-blocks-in-children": "Caudal block|Peripheral blocks",
  "paediatric-anaesthesia/paediatric-icu": "Fluids & sedation|Paediatric ventilation",

  /* ── DM Onco-anaesthesia & Palliative Medicine ── */
  "onco-anaesthesia-and-palliative-medicine/cancer-pain": "WHO ladder|Opioid rotation|Interventional pain",
  "onco-anaesthesia-and-palliative-medicine/anaesthesia-for-cancer-surgery": "Major resections|Airway tumours|Chemotherapy effects",
  "onco-anaesthesia-and-palliative-medicine/palliative-care": "Communication & goals of care|End-of-life care",
  "onco-anaesthesia-and-palliative-medicine/symptom-management": "Breathlessness|Nausea|Delirium",

  /* ── Radiology group · feeder ── */
  "radiology-feeder/physics-and-radiation-safety": "X-ray physics|CT physics|MRI physics|Radiation protection",
  "radiology-feeder/neuroradiology": "Stroke imaging|Brain tumours|Head trauma",
  "radiology-feeder/chest-imaging": "Chest X-ray patterns|HRCT|Pulmonary embolism",
  "radiology-feeder/abdominal-imaging": "Liver lesions|Bowel obstruction|Renal masses",
  "radiology-feeder/musculoskeletal-imaging": "Bone tumours|Joint MRI|Trauma imaging",
  "radiology-feeder/interventional-basics": "Seldinger technique|Drainage procedures|Contrast reactions",
  "radiology-feeder/paediatric-radiology": "Neonatal chest|Intussusception|Skeletal survey",

  /* ── DM Neuroradiology ── */
  "neuroradiology/brain-tumours-imaging": "Glioma imaging|Perfusion & spectroscopy|Extra-axial tumours",
  "neuroradiology/stroke-imaging": "CT & CTA protocol|Perfusion mismatch|Venous thrombosis",
  "neuroradiology/spine-imaging": "Cord lesions|Degenerative spine|Spinal infection",
  "neuroradiology/head-and-neck-imaging": "Temporal bone|Sinonasal disease|Neck spaces",
  "neuroradiology/neurointervention": "Aneurysm coiling|Thrombectomy|AVM embolisation",

  /* ── DM Interventional Radiology ── */
  "interventional-radiology/vascular-intervention": "Angioplasty & stenting|Embolisation|Venous intervention",
  "interventional-radiology/non-vascular-intervention": "Biliary drainage|Nephrostomy|Abscess drainage",
  "interventional-radiology/oncology-intervention": "TACE|Radiofrequency ablation|Y-90 radioembolisation",
  "interventional-radiology/neuro-intervention": "Stroke thrombectomy|Carotid stenting",
  "interventional-radiology/image-guided-biopsy": "CT-guided biopsy|USG-guided biopsy|Complications",

  /* ── Psychiatry group · feeder ── */
  "psychiatry-feeder/psychopathology-and-classification": "ICD-11 & DSM-5|Mental status examination|Defence mechanisms",
  "psychiatry-feeder/psychotic-disorders": "Schizophrenia|Delusional disorder|Antipsychotics",
  "psychiatry-feeder/mood-and-anxiety-disorders": "Depression|Bipolar disorder|Anxiety disorders|OCD",
  "psychiatry-feeder/substance-use": "Alcohol withdrawal|Opioid dependence|Cannabis",
  "psychiatry-feeder/child-psychiatry": "ADHD|Autism|Conduct disorder",
  "psychiatry-feeder/psychopharmacology": "Antidepressants|Mood stabilisers|ECT",
  "psychiatry-feeder/psychotherapy": "CBT|Psychodynamic therapy|Family therapy",
  "psychiatry-feeder/forensic-and-legal-psychiatry": "Mental Healthcare Act 2017|Capacity & consent|Forensic assessment",

  /* ── DM Child & Adolescent Psychiatry ── */
  "child-and-adolescent-psychiatry/neurodevelopmental-disorders": "Autism spectrum disorder|Intellectual disability|Specific learning disorder",
  "child-and-adolescent-psychiatry/adhd-and-behavioural-disorders": "ADHD management|Oppositional defiant disorder|Conduct disorder",
  "child-and-adolescent-psychiatry/mood-disorders-in-youth": "Adolescent depression|Paediatric bipolar|Suicide prevention",
  "child-and-adolescent-psychiatry/psychopharmacology-in-children": "Stimulants|SSRIs in youth|Antipsychotic monitoring",

  /* ── DM Geriatric Mental Health ── */
  "geriatric-mental-health/dementia": "Alzheimer's|BPSD management|Cholinesterase inhibitors",
  "geriatric-mental-health/late-life-depression": "Presentation in elderly|Treatment & ECT",
  "geriatric-mental-health/delirium": "Causes & screening|Prevention & management",
  "geriatric-mental-health/geriatric-psychopharmacology": "Pharmacokinetic changes|Falls & anticholinergic burden",

  /* ── DM Addiction Psychiatry ── */
  "addiction-psychiatry/alcohol-use-disorder": "Withdrawal & delirium tremens|Wernicke-Korsakoff|Relapse prevention drugs",
  "addiction-psychiatry/opioid-use-disorder": "Opioid substitution therapy|Overdose & naloxone",
  "addiction-psychiatry/behavioural-addictions": "Gambling disorder|Internet gaming disorder",
  "addiction-psychiatry/pharmacotherapy-of-addiction": "Naltrexone|Buprenorphine|Nicotine replacement",

  /* ── Respiratory group · feeder ── */
  "respiratory-feeder/airway-disease": "Asthma|COPD|Bronchiectasis",
  "respiratory-feeder/infections-and-tb": "Pneumonia|TB & MDR-TB|Fungal infections",
  "respiratory-feeder/interstitial-lung-disease": "IPF|Sarcoidosis|Hypersensitivity pneumonitis",
  "respiratory-feeder/pulmonary-vascular-disease": "Pulmonary embolism|Pulmonary hypertension",
  "respiratory-feeder/sleep-medicine": "Obstructive sleep apnoea|Polysomnography",
  "respiratory-feeder/lung-cancer": "Diagnosis & staging|Pleural malignancy",
  "respiratory-feeder/critical-care-and-ventilation": "ARDS|NIV|Weaning",

  /* ── DM Pulmonary, Critical Care & Sleep ── */
  "pulmonary-medicine-and-critical-care/advanced-airway-disease": "Severe asthma biologics|COPD exacerbations|Cystic fibrosis",
  "pulmonary-medicine-and-critical-care/ild": "IPF antifibrotics|CTD-ILD|Occupational lung disease",
  "pulmonary-medicine-and-critical-care/pulmonary-hypertension": "PAH therapy|CTEPH",
  "pulmonary-medicine-and-critical-care/interventional-pulmonology": "EBUS|Thoracoscopy|Airway stenting",
  "pulmonary-medicine-and-critical-care/sleep-disorders": "OSA & CPAP|Central sleep apnoea|Narcolepsy",
  "pulmonary-medicine-and-critical-care/mechanical-ventilation": "Lung-protective ventilation|ECMO|Weaning",
  "pulmonary-medicine-and-critical-care/lung-transplantation": "Selection criteria|Chronic lung allograft dysfunction",

  /* ── Pathology group · feeder ── */
  "pathology-feeder/general-pathology": "Cell injury|Inflammation|Neoplasia|Immunopathology",
  "pathology-feeder/haematopathology": "Anaemias|Leukaemias|Lymphomas",
  "pathology-feeder/systemic-pathology": "Renal pathology|Liver pathology|CNS pathology",
  "pathology-feeder/cytopathology": "FNAC|Pap smear (Bethesda)|Fluid cytology",
  "pathology-feeder/transfusion-medicine": "Blood grouping|Component therapy",
  "pathology-feeder/molecular-pathology": "PCR & FISH|Immunohistochemistry|NGS in pathology",

  /* ── DM Haematopathology ── */
  "haematopathology/bone-marrow-pathology": "Marrow aspirate & biopsy|Myelodysplastic syndromes|Marrow infiltration",
  "haematopathology/leukaemia-diagnostics": "WHO classification|Cytogenetics|MRD assessment",
  "haematopathology/lymphoma-pathology": "B-cell lymphomas|T-cell lymphomas|Hodgkin lymphoma",
  "haematopathology/flow-cytometry": "Immunophenotyping panels|PNH testing",
  "haematopathology/molecular-haematology": "BCR-ABL & JAK2|FLT3 & NPM1",

  /* ── DM Neuropathology ── */
  "neuropathology/cns-tumours-who-classification": "Integrated diagnosis|IDH & 1p/19q|Medulloblastoma subgroups",
  "neuropathology/neurodegenerative-disease": "Tauopathies|Synucleinopathies|Prion disease",
  "neuropathology/neuromuscular-pathology": "Muscle biopsy|Nerve biopsy",
  "neuropathology/cns-infections": "Viral encephalitis|Fungal infections|Parasitic infections",

  /* ── Microbiology group · feeder ── */
  "microbiology-feeder/bacteriology": "Gram-positive cocci|Enterobacterales|Anaerobes|Mycobacteria",
  "microbiology-feeder/virology": "Hepatitis viruses|HIV|Respiratory viruses",
  "microbiology-feeder/mycology": "Candida|Aspergillus|Mucorales",
  "microbiology-feeder/parasitology": "Malaria|Intestinal helminths|Tissue parasites",
  "microbiology-feeder/immunology": "Hypersensitivity|Serological tests|Vaccines",
  "microbiology-feeder/hospital-infection-control": "Hand hygiene|Sterilisation|Biomedical waste",
  "microbiology-feeder/molecular-diagnostics": "PCR|CBNAAT|Sequencing",

  /* ── DM Virology ── */
  "virology/diagnostic-virology": "Cell culture|Molecular assays|Serology",
  "virology/respiratory-viruses": "Influenza|SARS-CoV-2|RSV",
  "virology/hepatitis-viruses": "HBV markers|HCV genotypes|HEV",
  "virology/hiv": "Viral load & resistance testing|Infant diagnosis",
  "virology/emerging-viral-infections": "Nipah|Zika|Mpox",

  /* ── DM Infectious Diseases (Microbiology) ── */
  "infectious-diseases-microbiology/clinical-microbiology": "Blood culture|Antimicrobial susceptibility testing|Rapid diagnostics",
  "infectious-diseases-microbiology/antimicrobial-resistance": "ESBL & carbapenemases|MRSA & VRE|Stewardship programmes",
  "infectious-diseases-microbiology/infection-control": "Outbreak investigation|Surveillance|Isolation precautions",
  "infectious-diseases-microbiology/tropical-infections": "Scrub typhus|Leptospirosis|Melioidosis",

  /* ── Pharmacology group · feeder ── */
  "pharmacology-feeder/general-pharmacology": "Pharmacokinetics|Pharmacodynamics|Drug interactions",
  "pharmacology-feeder/systemic-pharmacology": "Autonomic drugs|CVS drugs|Antimicrobials|Anticancer drugs",
  "pharmacology-feeder/clinical-trials-and-regulation": "Trial phases|GCP|New Drugs & Clinical Trials Rules",
  "pharmacology-feeder/pharmacovigilance": "ADR reporting|Causality assessment",
  "pharmacology-feeder/pharmacogenomics": "CYP polymorphisms|HLA & drug reactions",

  /* ── DM Clinical Pharmacology ── */
  "clinical-pharmacology/clinical-pharmacokinetics": "Dosing in renal & hepatic failure|Population PK",
  "clinical-pharmacology/therapeutic-drug-monitoring": "Narrow therapeutic index drugs|Sampling times",
  "clinical-pharmacology/drug-development": "Preclinical studies|Biosimilars",
  "clinical-pharmacology/pharmacoeconomics": "Cost-effectiveness analysis|Essential medicines list",
  "clinical-pharmacology/rational-prescribing": "Prescription audit|Deprescribing",

  /* ── ENT group · feeder ── */
  "ent-feeder/otology": "Chronic otitis media|Otosclerosis|Facial nerve palsy|Vertigo",
  "ent-feeder/rhinology": "Sinusitis & FESS|Epistaxis|Nasal polyps",
  "ent-feeder/laryngology": "Vocal cord lesions|Laryngeal paralysis|Stridor",
  "ent-feeder/head-and-neck-oncology": "Oral cavity cancer|Laryngeal cancer|Nasopharyngeal carcinoma",
  "ent-feeder/paediatric-ent": "Adenotonsillectomy|Paediatric airway|Congenital hearing loss",

  /* ── MCh Head & Neck Surgery ── */
  "head-and-neck-surgery/oral-cavity-and-oropharynx-cancer": "Staging & HPV|Composite resection|Neck dissection",
  "head-and-neck-surgery/laryngeal-cancer": "Organ preservation|Total laryngectomy|Voice rehabilitation",
  "head-and-neck-surgery/thyroid-and-salivary-tumours": "Thyroid cancer surgery|Parotidectomy",
  "head-and-neck-surgery/reconstruction": "Pectoralis major flap|Free fibula flap|Radial forearm flap",

  /* ── MCh Neuro-otology ── */
  "neuro-otology/vestibular-disorders": "BPPV|Ménière's disease|Vestibular neuritis",
  "neuro-otology/hearing-loss-and-implants": "Cochlear implants|Auditory brainstem implant|Sudden SNHL",
  "neuro-otology/skull-base": "Vestibular schwannoma|Glomus tumours|Lateral skull base approaches",
};
