/**
 * NEET PG topic depth: extra high-yield topics appended to each chapter in
 * neet-pg.ts (existing topics are kept, so their progress keys stay stable).
 * Keys are `<subject>/<chapter>`; topics are separated by "|". Drawn from the
 * NMC CBME competencies and recurring NEET PG question areas.
 */
export const PG_DEPTH: Record<string, string> = {
  /* Anatomy */
  "anatomy/general": "Cartilage types|Synovial joint classification|Skin & appendages histology|Nerve tissue histology",
  "anatomy/embryo": "Neural tube & neural crest|Placenta & fetal membranes|Face & palate development|Teratogens & critical periods",
  "anatomy/upper": "Rotator cuff|Cubital fossa & carpal tunnel|Anatomical snuffbox|Nerve injuries (radial, ulnar, median)|Dermatomes of upper limb",
  "anatomy/lower": "Femoral triangle & canal|Popliteal fossa|Adductor canal|Venous drainage & varicosities|Nerve injuries (sciatic, peroneal)",
  "anatomy/thorax": "Intercostal spaces & nerves|Pericardium & sinuses|Thoracic duct & azygos system|Bronchopulmonary segments|Oesophagus constrictions",
  "anatomy/abdomen": "Anterior abdominal wall|Blood supply of gut|Posterior abdominal wall|Rectum & anal canal|Pelvic floor & ischiorectal fossa",
  "anatomy/headneck": "Pterygopalatine fossa|Infratemporal fossa & TMJ|Thyroid & parathyroid|Middle & inner ear|Tongue & palate|Cervical fascia & spaces",
  "anatomy/neuro": "Hypothalamus|Limbic system|Cortical areas|Visual pathway lesions|Brainstem syndromes",
  "anatomy/genetics": "Mutations & polymorphisms|Genomic imprinting|Mitochondrial inheritance|Genetic counselling",

  /* Physiology */
  "physiology/general": "Cell junctions|Signal transduction|Osmosis & tonicity|Apoptosis physiology",
  "physiology/nerve-muscle": "Excitation-contraction coupling|Motor unit & recruitment|Muscle fatigue & rigor|Nerve injury & regeneration",
  "physiology/blood": "Plasma proteins|WBC functions|Platelets|Lymph & tissue fluid|Anticoagulants mechanism",
  "physiology/cvs": "Cardiac action potentials|Starling's law|Coronary circulation|Baroreceptors & chemoreceptors|Haemodynamics & Poiseuille's law",
  "physiology/resp": "Mechanics of breathing & surfactant|Dead space|Pulmonary function tests|Periodic breathing|Diving & space physiology",
  "physiology/renal": "Juxtaglomerular apparatus|RAAS|Renal blood flow & autoregulation|Countercurrent mechanism|Diuretic physiology",
  "physiology/gi": "Salivary secretion|Swallowing|Vomiting reflex|Enteric nervous system|Liver functions",
  "physiology/endo": "Growth hormone|Hormone receptors & second messengers|Pineal & melatonin|Insulin & glucagon actions|Placental hormones",
  "physiology/cns": "Synaptic transmission|Neurotransmitters|Reticular activating system|Limbic system & emotion|Autonomic nervous system|CSF & blood-brain barrier",
  "physiology/special": "Photoreceptors & phototransduction|Colour vision|Accommodation & pupillary reflexes|Visual pathway|Vestibular apparatus|Auditory pathway",

  /* Biochemistry */
  "biochemistry/enzymes": "Coenzymes & cofactors|Enzyme regulation|Enzyme classification|Ribozymes & abzymes",
  "biochemistry/carbs": "Pyruvate dehydrogenase|Electron transport chain & oxidative phosphorylation|Uncouplers & inhibitors|Mucopolysaccharidoses|Insulin & glucose regulation",
  "biochemistry/lipids": "Fatty acid synthesis|Phospholipids & sphingolipids|Prostaglandins & eicosanoids|Fatty liver",
  "biochemistry/protein": "Transamination & deamination|Ammonia metabolism|One-carbon metabolism|Specialised products of amino acids|Collagen synthesis & defects",
  "biochemistry/molbio": "Mutations & DNA damage|Post-translational modifications|Genetic code & mutations|Oncogenes & tumour suppressor genes|Gene therapy",
  "biochemistry/vitamins": "Vitamin A & vision|Vitamin D metabolism|Vitamin K & coagulation|Thiamine & niacin deficiency|Folate & B12",
  "biochemistry/nutrition": "Dietary fibre|Glycaemic index|Starvation metabolism|Obesity biochemistry",
  "biochemistry/clinical": "Thyroid function tests|Plasma proteins & electrophoresis|Free radicals & antioxidants|Xenobiotic metabolism|Purine & pyrimidine metabolism",

  /* Pathology */
  "pathology/cell": "Free radical injury|Reversible vs irreversible injury|Autophagy|Cellular ageing",
  "pathology/inflam": "Leukocyte recruitment|Chemical mediators|Systemic effects of inflammation|Fibrosis",
  "pathology/haemo": "Hyperaemia & congestion|DIC|Haemorrhage",
  "pathology/immuno": "MHC & HLA|Graft-versus-host disease|AIDS pathology|SLE pathology",
  "pathology/neoplasia": "Tumour spread & metastasis|Tumour immunity|Viral carcinogenesis|Molecular diagnosis of cancer|Epidemiology of cancer",
  "pathology/haem": "Iron deficiency & ACD|Megaloblastic anaemia|Thalassaemia & sickle cell|Myeloproliferative neoplasms|Blood transfusion|Hodgkin lymphoma",
  "pathology/cvs": "Cardiomyopathies|Congenital heart disease|Vasculitis|Bronchiectasis|Pneumoconioses",
  "pathology/gi": "Coeliac disease|Gastric tumours|Polyps & polyposis|Alcoholic liver disease|Gallbladder pathology",
  "pathology/renal": "Acute tubular necrosis|Cystic kidney diseases|Pyelonephritis|Urolithiasis pathology",
  "pathology/systemic": "Thyroid pathology|Bone pathology|Lymph node pathology|Soft tissue tumours",

  /* Pharmacology */
  "pharmacology/general": "Routes of administration|Bioavailability & half-life|Dose-response & therapeutic index|Pharmacogenetics|Drug development",
  "pharmacology/ans": "Ganglionic blockers|Skeletal muscle relaxants|Drugs for glaucoma|Myasthenia gravis treatment",
  "pharmacology/cvs": "Shock & vasopressors|Pulmonary hypertension drugs|Drugs in pregnancy hypertension",
  "pharmacology/cns": "Drugs for dementia|Alcohol & disulfiram|CNS stimulants|Drug dependence",
  "pharmacology/autacoids": "Serotonin & 5-HT drugs|Migraine drugs|Prostaglandin analogues|Drugs for cough",
  "pharmacology/endo": "Oxytocics & tocolytics|Drugs for infertility|Pituitary hormones|SGLT2 & GLP-1 drugs",
  "pharmacology/chemo": "Antibiotic mechanisms & resistance|Glycopeptides & oxazolidinones|Tetracyclines & chloramphenicol|Sulfonamides|Anti-leishmanial & anti-amoebic",
  "pharmacology/cancer": "Chemotherapy toxicities|Hormonal anticancer drugs|Immune checkpoint inhibitors",
  "pharmacology/blood-gi": "Plasma expanders|Drugs for IBD|Drugs for haemostasis|Drugs for diarrhoea",

  /* Microbiology */
  "microbiology/general": "Bacterial growth curve|Microscopy & stains|Bacterial toxins|Normal flora",
  "microbiology/immunology": "MHC & antigen presentation|Cytokines|Transplant & tumour immunology|Immunoglobulin classes",
  "microbiology/gpc": "Enterococcus|Listeria|Actinomyces & Nocardia",
  "microbiology/gnb": "Salmonella|Shigella|Brucella|Campylobacter & H. pylori|Anaerobic gram-negatives",
  "microbiology/special": "Atypical mycobacteria|Borrelia|Mycoplasma",
  "microbiology/virology": "Viral structure & replication|Picornaviruses|Rotavirus & enteric viruses|Oncogenic viruses|COVID-19 & coronaviruses|Prions",
  "microbiology/mycology": "Candida|Aspergillus & Mucor|Cryptococcus|Dermatophytes",
  "microbiology/parasitology": "Leishmania|Toxoplasma|Trypanosoma|Filaria",
  "microbiology/applied": "Specimen collection|Diarrhoea & food poisoning|Meningitis approach|UTI approach|Zoonoses",

  /* Forensic medicine */
  "forensic/legal": "Dying declaration|Medical certificates|Professional misconduct|Evidence & witnesses",
  "forensic/identity": "Anthropometry|Teeth & forensic odontology|Superimposition",
  "forensic/death": "Rigor mortis|Putrefaction|Adipocere & mummification|Exhumation",
  "forensic/injuries": "Abrasion, bruise & laceration|Head injury in forensics|Road traffic injuries|Blast injuries",
  "forensic/asphyxia": "Traumatic asphyxia|Ligature mark analysis",
  "forensic/sexual": "Virginity & pregnancy|Unnatural sexual offences|Sudden infant death",
  "forensic/toxicology": "Arsenic & lead|Alcohol & methanol|Cyanide|Carbon monoxide|Datura & cannabis",

  /* Community medicine */
  "community/concepts": "Iceberg phenomenon|Disease causation models|Health indicators",
  "community/epidemiology": "Descriptive epidemiology|Cohort & case-control studies|RCTs|Association & causation|Outbreak investigation",
  "community/biostat": "Normal distribution|Chi-square & t-test|Correlation & regression|Data presentation",
  "community/cd": "Leprosy & NLEP|Measles & polio|Dengue & chikungunya|Zoonoses|Hospital-acquired infections",
  "community/ncd": "Rheumatic heart disease|Stroke|Tobacco control",
  "community/rch": "MMR & IMR|JSY & JSSK|IMNCI|Adolescent health programmes",
  "community/nutrition": "Food fortification|Food adulteration|Anaemia Mukt Bharat|ICDS & POSHAN",
  "community/environment": "Housing & noise|Medical entomology|Radiation hazards|ESI Act",
  "community/programmes": "Ayushman Bharat|NHM|Disaster management|Health education & communication",

  /* Medicine */
  "medicine/cardio": "Infective endocarditis|Rheumatic fever|Congenital heart disease in adults|ECG patterns|Aortic dissection",
  "medicine/resp": "Tuberculosis|Bronchiectasis|Sleep apnoea|ARDS|Sarcoidosis",
  "medicine/gi": "Peptic ulcer disease|Hepatic encephalopathy|Wilson's & haemochromatosis|Autoimmune liver disease",
  "medicine/renal": "Nephrotic syndrome|Renal tubular acidosis|Dialysis|Hyponatraemia & hyperkalaemia",
  "medicine/endo": "Diabetic emergencies|Cushing's syndrome|Pheochromocytoma|MEN syndromes|Hypoglycaemia",
  "medicine/haem": "Thalassaemia|Myeloma|ITP & TTP|Transfusion",
  "medicine/neuro": "Myasthenia gravis|GBS|Meningitis & encephalitis|Dementia|Motor neurone disease",
  "medicine/rheum": "Polymyositis & scleroderma|Sjögren's syndrome|Septic arthritis",
  "medicine/id": "Malaria|Dengue|Typhoid|Leptospirosis & scrub typhus|COVID-19",
  "medicine/misc": "Snake bite|Organophosphate poisoning|Heat stroke|Fluids & shock in ICU",

  /* Surgery */
  "surgery/general": "Haemorrhage & transfusion|Surgical site infection|Ulcers & sinuses|Cysts & lumps|Skin tumours",
  "surgery/headneck": "Neck swellings|Thyroid cancer|Cleft lip & palate|Branchial cyst",
  "surgery/breast": "Breast imaging|Gynaecomastia|Nipple discharge",
  "surgery/vascular": "Aneurysms|Acute limb ischaemia|Buerger's disease",
  "surgery/gi": "Peptic ulcer complications|Intestinal obstruction|GI bleeding|Gastric cancer|Haemorrhoids & fissure",
  "surgery/hpb": "Choledochal cyst|Portal hypertension|Cholangiocarcinoma|Hydatid cyst",
  "surgery/hernia": "Umbilical & epigastric hernia|Incisional hernia|Hernia complications",
  "surgery/uro": "Hydronephrosis|Hypospadias & undescended testis|Urethral stricture|Bladder injuries",
  "surgery/specialties": "Spinal cord compression|Cardiac surgery basics|Pyloric stenosis & intussusception|Hirschsprung disease",
  "surgery/ortho-anaes": "Laparoscopy principles|Surgical sutures & instruments|Post-operative complications",

  /* OBG */
  "obg/anatomy": "Fetal skull|Placenta & amniotic fluid|Fetal circulation",
  "obg/antenatal": "Fetal monitoring & NST|Ultrasound in obstetrics|IUGR",
  "obg/labour": "Partograph|Induction of labour|Breech & transverse lie|Shoulder dystocia|Caesarean section",
  "obg/complications": "Eclampsia management|Obstetric shock|Post-term pregnancy|Intrauterine fetal death",
  "obg/medical": "Thyroid disease in pregnancy|Jaundice in pregnancy|Drugs in pregnancy|HIV in pregnancy",
  "obg/early": "Recurrent pregnancy loss|MTP Act|Hyperemesis gravidarum",
  "obg/gynae": "Amenorrhoea|Endometriosis|Urinary incontinence|Genital fistulae|Intersex & DSD",
  "obg/onco": "CIN & HPV vaccination|Vulval cancer|Ovarian cancer staging|Gynaecological surgeries",

  /* Paediatrics */
  "paediatrics/growth": "Short stature|Puberty disorders|Developmental delay|Behavioural problems",
  "paediatrics/neonatology": "Neonatal hypoglycaemia|Birth asphyxia|NEC|Neonatal reflexes",
  "paediatrics/nutrition": "Vitamin deficiencies in children|Complementary feeding|Obesity in children",
  "paediatrics/systemic": "Paediatric respiratory infections|Rheumatic fever|Childhood leukaemia|Thalassaemia|Cerebral palsy|Paediatric endocrinology",
  "paediatrics/emergency": "PALS & shock|Status epilepticus|Foreign body aspiration|Burns in children",

  /* Ophthalmology */
  "ophthalmology/basics": "Visual acuity testing|Accommodation & presbyopia|Contact lenses & refractive surgery",
  "ophthalmology/anterior": "Corneal ulcers|Uveitis|Dry eye|Pterygium & trachoma",
  "ophthalmology/glaucoma": "Secondary glaucoma|Anti-glaucoma drugs|Glaucoma surgery",
  "ophthalmology/posterior": "Hypertensive retinopathy|Retinitis pigmentosa|ARMD|Retinopathy of prematurity",
  "ophthalmology/misc": "Neuro-ophthalmology|Ocular trauma|Eye in systemic disease|Lacrimal apparatus",

  /* ENT */
  "ent/ear": "Otosclerosis|Facial nerve palsy|Cholesteatoma|Cochlear implants",
  "ent/nose": "DNS & rhinitis|Fungal sinusitis|Juvenile nasopharyngeal angiofibroma|CSF rhinorrhoea",
  "ent/throat": "Stridor|Vocal cord palsy|Deep neck space infections|Oesophageal foreign bodies",

  /* Orthopaedics */
  "orthopaedics/trauma": "Fracture complications|Dislocations|Pelvic fractures|Hand injuries|Compartment syndrome",
  "orthopaedics/infection": "Septic arthritis|Spinal TB|Osteosarcoma & Ewing's|Giant cell tumour",
  "orthopaedics/regional": "Osteoarthritis & RA|Low back pain|Perthes & SCFE|Rickets & osteoporosis|Amputations & prosthetics",

  /* Dermatology */
  "dermatology/basics": "Viral infections of skin|Scabies & pediculosis|Skin biopsy & investigations",
  "dermatology/disorders": "Lichen planus|Acne & rosacea|Urticaria & drug eruptions|Nail disorders|Skin in systemic disease|Cutaneous malignancies",

  /* Psychiatry */
  "psychiatry/major": "Bipolar disorder|Somatoform & dissociative disorders|Eating disorders|Sleep disorders|Alcohol dependence",
  "psychiatry/other": "Psychotherapy|ECT|Defence mechanisms|Delirium & dementia|Psychopharmacology adverse effects",

  /* Radiology */
  "radiology/physics": "Ultrasound physics|CT & MRI principles|Nuclear medicine",
  "radiology/imaging": "Musculoskeletal imaging|Paediatric radiology|Interventional radiology|Imaging in trauma",

  /* Anaesthesia */
  "anaesthesia/general": "Monitoring in anaesthesia|Anaesthesia machine|Malignant hyperthermia|Post-operative nausea & pain",
  "anaesthesia/regional": "Nerve blocks|Oxygen therapy|Mechanical ventilation basics|Fluid therapy",
};
