/**
 * NEET-SS question-paper groups, verified against the NBEMS NEET-SS 2025
 * Information Bulletin (Tables 1 and 2, printed pages 67–69):
 *  · 15 groups, one common paper per group, 150 MCQs in 150 minutes
 *    (three timed sections of 50), +4 / −1.
 *  · 13 groups ask only from the PG-exit curriculum of the primary feeder broad
 *    specialty (general component + all its sub-specialty components).
 *  · Critical Care Medicine and Medical Oncology groups ask only from the topics
 *    of that super specialty.
 * The syllabus itself lives in the database (exam_nodes); `paperSubject` is the
 * subject that carries the paper's marks, each course is a reference subject
 * for the DM/MCh/DrNB course you are aiming at (studied, but not examined).
 */
export type SsCourse = { key: string; name: string; subject: string | null };
export type SsGroup = { key: string; name: string; feeder: string; paperSubject: string; exception: boolean; hue: number; courses: SsCourse[] };

export const NEET_SS_PAPER = { questions: 150, marks: 600, sections: 3, minutes: 150, plus: 4, minus: 1 };

export const NEET_SS_GROUPS: SsGroup[] = [
  {
    "key": "medical",
    "name": "Medical Group",
    "feeder": "MD/DNB General Medicine",
    "paperSubject": "medical.paper",
    "exception": false,
    "hue": 200,
    "courses": [
      {
        "key": "cardiology",
        "name": "Cardiology",
        "subject": "medical.cardiology"
      },
      {
        "key": "clinical-haematology",
        "name": "Clinical Haematology",
        "subject": "medical.clinical-haematology"
      },
      {
        "key": "clinical-immunology-and-rheumatology",
        "name": "Clinical Immunology & Rheumatology",
        "subject": "medical.clinical-immunology-and-rheumatology"
      },
      {
        "key": "endocrinology",
        "name": "Endocrinology",
        "subject": "medical.endocrinology"
      },
      {
        "key": "medical-gastroenterology",
        "name": "Medical Gastroenterology",
        "subject": "medical.medical-gastroenterology"
      },
      {
        "key": "hepatology",
        "name": "Hepatology",
        "subject": "medical.hepatology"
      },
      {
        "key": "infectious-diseases",
        "name": "Infectious Diseases",
        "subject": "medical.infectious-diseases"
      },
      {
        "key": "medical-genetics",
        "name": "Medical Genetics",
        "subject": "medical.medical-genetics"
      },
      {
        "key": "nephrology",
        "name": "Nephrology",
        "subject": "medical.nephrology"
      },
      {
        "key": "neurology",
        "name": "Neurology",
        "subject": "medical.neurology"
      }
    ]
  },
  {
    "key": "surgical",
    "name": "Surgical Group",
    "feeder": "MS/DNB General Surgery",
    "paperSubject": "surgical.paper",
    "exception": false,
    "hue": 0,
    "courses": [
      {
        "key": "cardiovascular-and-thoracic-surgery",
        "name": "Cardiovascular & thoracic Surgery",
        "subject": "surgical.cardiovascular-and-thoracic-surgery"
      },
      {
        "key": "paediatric-cardiothoracic-vascular-surgery",
        "name": "Paediatric Cardiothoracic Vascular Surgery",
        "subject": "surgical.paediatric-cardiothoracic-vascular-surgery"
      },
      {
        "key": "paediatric-surgery",
        "name": "Paediatric Surgery",
        "subject": "surgical.paediatric-surgery"
      },
      {
        "key": "surgical-gastroenterology",
        "name": "Surgical Gastroenterology",
        "subject": "surgical.surgical-gastroenterology"
      },
      {
        "key": "hepato-pancreato-biliary-surgery",
        "name": "Hepato Pancreato Biliary Surgery",
        "subject": "surgical.hepato-pancreato-biliary-surgery"
      },
      {
        "key": "neurosurgery",
        "name": "Neurosurgery",
        "subject": "surgical.neurosurgery"
      },
      {
        "key": "plastic-and-reconstructive-surgery",
        "name": "Plastic & Reconstructive Surgery",
        "subject": "surgical.plastic-and-reconstructive-surgery"
      },
      {
        "key": "urology",
        "name": "Urology",
        "subject": "surgical.urology"
      },
      {
        "key": "vascular-surgery",
        "name": "Vascular Surgery",
        "subject": "surgical.vascular-surgery"
      },
      {
        "key": "surgical-oncology",
        "name": "Surgical Oncology",
        "subject": "surgical.surgical-oncology"
      },
      {
        "key": "endocrine-surgery",
        "name": "Endocrine Surgery",
        "subject": "surgical.endocrine-surgery"
      },
      {
        "key": "thoracic-surgery",
        "name": "Thoracic Surgery",
        "subject": "surgical.thoracic-surgery"
      }
    ]
  },
  {
    "key": "orthopaedics",
    "name": "Orthopaedics Group",
    "feeder": "MS/DNB Orthopaedics",
    "paperSubject": "orthopaedics.paper",
    "exception": false,
    "hue": 28,
    "courses": [
      {
        "key": "hand-surgery",
        "name": "Hand Surgery",
        "subject": "orthopaedics.hand-surgery"
      },
      {
        "key": "paediatric-orthopaedics",
        "name": "Paediatric Orthopaedics",
        "subject": "orthopaedics.paediatric-orthopaedics"
      }
    ]
  },
  {
    "key": "paediatric",
    "name": "Paediatric Group",
    "feeder": "MD/DNB Paediatrics",
    "paperSubject": "paediatric.paper",
    "exception": false,
    "hue": 300,
    "courses": [
      {
        "key": "neonatology",
        "name": "Neonatology",
        "subject": "paediatric.neonatology"
      },
      {
        "key": "paediatric-hepatology",
        "name": "Paediatric Hepatology",
        "subject": "paediatric.paediatric-hepatology"
      },
      {
        "key": "paediatric-nephrology",
        "name": "Paediatric Nephrology",
        "subject": "paediatric.paediatric-nephrology"
      },
      {
        "key": "paediatric-oncology",
        "name": "Paediatric Oncology",
        "subject": "paediatric.paediatric-oncology"
      },
      {
        "key": "paediatric-neurology",
        "name": "Paediatric Neurology",
        "subject": "paediatric.paediatric-neurology"
      },
      {
        "key": "paediatric-cardiology",
        "name": "Paediatric Cardiology",
        "subject": "paediatric.paediatric-cardiology"
      },
      {
        "key": "paediatric-gastroenterology",
        "name": "Paediatric Gastroenterology",
        "subject": "paediatric.paediatric-gastroenterology"
      },
      {
        "key": "paediatric-critical-care",
        "name": "Paediatric Critical Care",
        "subject": "paediatric.paediatric-critical-care"
      }
    ]
  },
  {
    "key": "obg",
    "name": "Obstetrics and Gynaecology Group",
    "feeder": "MD/MS/DNB Obstetrics & Gynaecology",
    "paperSubject": "obg.paper",
    "exception": false,
    "hue": 330,
    "courses": [
      {
        "key": "gynaecological-oncology",
        "name": "Gynaecological Oncology",
        "subject": "obg.gynaecological-oncology"
      },
      {
        "key": "reproductive-medicine-and-surgery",
        "name": "Reproductive Medicine & Surgery",
        "subject": "obg.reproductive-medicine-and-surgery"
      }
    ]
  },
  {
    "key": "anaesthesia",
    "name": "Anaesthesiology Group",
    "feeder": "MD/DNB Anaesthesiology",
    "paperSubject": "anaesthesia.paper",
    "exception": false,
    "hue": 180,
    "courses": [
      {
        "key": "cardiac-anaesthesia",
        "name": "Cardiac Anaesthesia",
        "subject": "anaesthesia.cardiac-anaesthesia"
      },
      {
        "key": "neuroanesthesia",
        "name": "Neuroanesthesia",
        "subject": "anaesthesia.neuroanesthesia"
      },
      {
        "key": "organ-transplant-anaesthesia-and-critical-care",
        "name": "Organ Transplant Anaesthesia & Critical Care",
        "subject": "anaesthesia.organ-transplant-anaesthesia-and-critical-care"
      },
      {
        "key": "paediatric-and-neonatal-anaesthesia",
        "name": "Paediatric & Neonatal Anaesthesia",
        "subject": "anaesthesia.paediatric-and-neonatal-anaesthesia"
      }
    ]
  },
  {
    "key": "radiodiagnosis",
    "name": "Radiodiagnosis Group",
    "feeder": "MD/DNB Radiodiagnosis",
    "paperSubject": "radiodiagnosis.paper",
    "exception": false,
    "hue": 230,
    "courses": [
      {
        "key": "neuro-radiology",
        "name": "Neuro Radiology",
        "subject": "radiodiagnosis.neuro-radiology"
      },
      {
        "key": "interventional-radiology",
        "name": "Interventional Radiology",
        "subject": "radiodiagnosis.interventional-radiology"
      }
    ]
  },
  {
    "key": "respiratory",
    "name": "Respiratory Medicine Group",
    "feeder": "MD/DNB Respiratory Medicine",
    "paperSubject": "respiratory.paper",
    "exception": false,
    "hue": 160,
    "courses": [
      {
        "key": "pulmonary-medicine",
        "name": "Pulmonary Medicine",
        "subject": "respiratory.pulmonary-medicine"
      }
    ]
  },
  {
    "key": "microbiology",
    "name": "Microbiology Group",
    "feeder": "MD/DNB Microbiology",
    "paperSubject": "microbiology.paper",
    "exception": false,
    "hue": 130,
    "courses": [
      {
        "key": "virology",
        "name": "Virology",
        "subject": "microbiology.virology"
      }
    ]
  },
  {
    "key": "pathology",
    "name": "Pathology Group",
    "feeder": "MD/DNB Pathology",
    "paperSubject": "pathology.paper",
    "exception": false,
    "hue": 270,
    "courses": [
      {
        "key": "onco-pathology",
        "name": "Onco-Pathology",
        "subject": "pathology.onco-pathology"
      }
    ]
  },
  {
    "key": "psychiatry",
    "name": "Psychiatry Group",
    "feeder": "MD/DNB Psychiatry",
    "paperSubject": "psychiatry.paper",
    "exception": false,
    "hue": 260,
    "courses": [
      {
        "key": "geriatric-mental-health",
        "name": "Geriatric Mental Health",
        "subject": "psychiatry.geriatric-mental-health"
      },
      {
        "key": "child-and-adolescent-psychiatry",
        "name": "Child and Adolescent Psychiatry",
        "subject": "psychiatry.child-and-adolescent-psychiatry"
      }
    ]
  },
  {
    "key": "pharmacology",
    "name": "Pharmacology Group",
    "feeder": "MD/DNB Pharmacology",
    "paperSubject": "pharmacology.paper",
    "exception": false,
    "hue": 50,
    "courses": [
      {
        "key": "clinical-pharmacology",
        "name": "Clinical Pharmacology",
        "subject": "pharmacology.clinical-pharmacology"
      }
    ]
  },
  {
    "key": "ent",
    "name": "ENT Group",
    "feeder": "MS/DNB ENT",
    "paperSubject": "ent.paper",
    "exception": false,
    "hue": 60,
    "courses": [
      {
        "key": "head-and-neck-surgery",
        "name": "Head & Neck Surgery",
        "subject": "ent.head-and-neck-surgery"
      }
    ]
  },
  {
    "key": "critical-care",
    "name": "Critical Care Medicine Group",
    "feeder": "Topics of Critical Care Medicine",
    "paperSubject": "critical-care.paper",
    "exception": true,
    "hue": 190,
    "courses": [
      {
        "key": "critical-care-medicine",
        "name": "Critical Care Medicine",
        "subject": null
      }
    ]
  },
  {
    "key": "medical-oncology",
    "name": "Medical Oncology Group",
    "feeder": "Topics of Medical Oncology",
    "paperSubject": "medical-oncology.paper",
    "exception": true,
    "hue": 340,
    "courses": [
      {
        "key": "medical-oncology",
        "name": "Medical Oncology",
        "subject": null
      }
    ]
  }
];
