// Complete NEET UG syllabus tree — used for DB seeding

export interface SyllabusChapter {
  name: string;
  classLevel: "11" | "12";
  topics: string[];
}

export interface SyllabusSubject {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  chapters: SyllabusChapter[];
}

export const SYLLABUS: SyllabusSubject[] = [
  {
    slug: "physics",
    name: "Physics",
    emoji: "⚛️",
    color: "#4f9cf9",
    chapters: [
      {
        name: "Physics and Measurement",
        classLevel: "11",
        topics: ["Units & SI System", "Significant Figures", "Measurement Errors", "Dimensional Analysis"],
      },
      {
        name: "Kinematics",
        classLevel: "11",
        topics: ["Motion in a Straight Line", "Vectors & Scalars", "Projectile Motion", "Uniform Circular Motion", "Relative Velocity"],
      },
      {
        name: "Laws of Motion",
        classLevel: "11",
        topics: ["Newton's Laws", "Momentum & Impulse", "Friction", "Centripetal Force", "Circular Motion on Roads"],
      },
      {
        name: "Work, Energy and Power",
        classLevel: "11",
        topics: ["Work-Energy Theorem", "Conservative Forces", "Spring PE", "Elastic & Inelastic Collisions", "Power"],
      },
      {
        name: "Rotational Motion",
        classLevel: "11",
        topics: ["Torque & Angular Momentum", "Moment of Inertia", "Parallel/Perpendicular Axis Theorems", "Rolling Motion", "Rigid Body Equilibrium"],
      },
      {
        name: "Gravitation",
        classLevel: "11",
        topics: ["Universal Law of Gravitation", "g Variation with altitude/depth", "Kepler's Laws", "Escape Velocity", "Satellites & Orbital Motion"],
      },
      {
        name: "Properties of Solids and Liquids",
        classLevel: "11",
        topics: ["Elastic Moduli", "Fluid Pressure & Pascal's Law", "Viscosity & Stokes' Law", "Bernoulli's Principle", "Surface Tension", "Thermal Expansion & Calorimetry"],
      },
      {
        name: "Thermodynamics",
        classLevel: "11",
        topics: ["Zeroth & First Law", "Isothermal & Adiabatic Processes", "Second Law", "Entropy", "Reversible/Irreversible Processes"],
      },
      {
        name: "Kinetic Theory of Gases",
        classLevel: "11",
        topics: ["Ideal Gas Equation", "Kinetic Theory Assumptions", "RMS Speed", "Equipartition of Energy", "Mean Free Path"],
      },
      {
        name: "Oscillations and Waves",
        classLevel: "11",
        topics: ["SHM", "Spring Oscillations", "Simple Pendulum", "Wave Motion", "Standing Waves", "Beats & Superposition"],
      },
      {
        name: "Electrostatics",
        classLevel: "12",
        topics: ["Coulomb's Law", "Electric Field & Dipole", "Gauss's Law", "Electric Potential", "Capacitors & Dielectrics", "Energy Stored"],
      },
      {
        name: "Current Electricity",
        classLevel: "12",
        topics: ["Drift Velocity & Ohm's Law", "Resistivity & Conductivity", "Kirchhoff's Laws", "Wheatstone Bridge", "Cells in Series/Parallel"],
      },
      {
        name: "Magnetic Effects of Current and Magnetism",
        classLevel: "12",
        topics: ["Biot-Savart Law", "Ampere's Law", "Force on Charged Particle", "Torque on Current Loop", "Magnetic Properties of Materials"],
      },
      {
        name: "Electromagnetic Induction and AC",
        classLevel: "12",
        topics: ["Faraday's Law & Lenz's Law", "Self & Mutual Inductance", "AC Basics", "LCR Circuit & Resonance", "Transformers & Generators"],
      },
      {
        name: "Electromagnetic Waves",
        classLevel: "12",
        topics: ["Displacement Current", "EM Wave Properties", "Electromagnetic Spectrum"],
      },
      {
        name: "Optics",
        classLevel: "12",
        topics: ["Reflection & Mirrors", "Refraction & Lenses", "Total Internal Reflection", "Prism & Dispersion", "Wavefront & Huygens' Principle", "Interference (YDSE)", "Diffraction", "Polarization"],
      },
      {
        name: "Dual Nature of Matter and Radiation",
        classLevel: "12",
        topics: ["Photoelectric Effect", "Einstein's Equation", "de Broglie Relation", "Matter Waves"],
      },
      {
        name: "Atoms and Nuclei",
        classLevel: "12",
        topics: ["Rutherford & Bohr Model", "Hydrogen Spectrum", "Nuclear Binding Energy", "Radioactive Decay", "Fission & Fusion"],
      },
      {
        name: "Electronic Devices",
        classLevel: "12",
        topics: ["p-n Junction Diode", "Rectifiers", "LED, Zener Diode", "Transistors", "Logic Gates"],
      },
      {
        name: "Experimental Skills",
        classLevel: "12",
        topics: ["Vernier Calipers & Screw Gauge", "Metre Bridge & Ohm's Law", "Focal Length Experiments", "Refractive Index", "p-n Diode Characteristics"],
      },
    ],
  },
  {
    slug: "chemistry",
    name: "Chemistry",
    emoji: "🧪",
    color: "#a855f7",
    chapters: [
      {
        name: "Some Basic Concepts in Chemistry",
        classLevel: "11",
        topics: ["Laws of Chemical Combination", "Mole Concept", "Stoichiometry", "Empirical & Molecular Formula"],
      },
      {
        name: "Atomic Structure",
        classLevel: "11",
        topics: ["Bohr Model", "Quantum Numbers", "Aufbau, Pauli, Hund's Rule", "Electronic Configuration", "de Broglie & Uncertainty Principle"],
      },
      {
        name: "Chemical Bonding and Molecular Structure",
        classLevel: "11",
        topics: ["Ionic & Covalent Bonding", "VSEPR Theory", "Hybridization", "Resonance", "MOT & Bond Order", "Hydrogen Bonding"],
      },
      {
        name: "Chemical Thermodynamics",
        classLevel: "11",
        topics: ["First Law & Internal Energy", "Enthalpy & Hess's Law", "Entropy & Gibbs Energy", "Spontaneity"],
      },
      {
        name: "Solutions",
        classLevel: "12",
        topics: ["Concentration Terms", "Raoult's Law", "Colligative Properties", "Van't Hoff Factor"],
      },
      {
        name: "Equilibrium",
        classLevel: "11",
        topics: ["Kc & Kp", "Le Chatelier's Principle", "Acids & Bases", "pH & Buffer", "Solubility Product"],
      },
      {
        name: "Redox Reactions and Electrochemistry",
        classLevel: "12",
        topics: ["Oxidation Numbers", "Balancing Redox", "Electrochemical Cells", "Nernst Equation", "Molar Conductivity", "Batteries"],
      },
      {
        name: "Chemical Kinetics",
        classLevel: "12",
        topics: ["Reaction Rate & Order", "Rate Law", "Zero & First Order Kinetics", "Arrhenius Equation", "Collision Theory"],
      },
      {
        name: "Classification of Elements and Periodicity",
        classLevel: "11",
        topics: ["Modern Periodic Law", "s/p/d/f Block Elements", "Atomic & Ionic Radii", "Ionization Enthalpy", "Electronegativity"],
      },
      {
        name: "P-Block Elements",
        classLevel: "12",
        topics: ["Group 13 to 18", "Physical & Chemical Trends", "Special Behavior of First Element"],
      },
      {
        name: "d- and f-Block Elements",
        classLevel: "12",
        topics: ["Transition Elements Trends", "Oxidation States & Colour", "KMnO4 & K2Cr2O7", "Lanthanoids & Actinoids", "Complex Formation"],
      },
      {
        name: "Coordination Compounds",
        classLevel: "12",
        topics: ["Werner's Theory & Ligands", "IUPAC Nomenclature", "Isomerism", "Crystal Field Theory", "Biological Importance"],
      },
      {
        name: "Purification and Characterisation of Organic Compounds",
        classLevel: "11",
        topics: ["Crystallization & Distillation", "Chromatography", "Qualitative Analysis of N/S/P/Halogens"],
      },
      {
        name: "Some Basic Principles of Organic Chemistry",
        classLevel: "11",
        topics: ["Hybridization & Functional Groups", "Isomerism & IUPAC", "Inductive & Resonance Effects", "Electrophiles & Nucleophiles"],
      },
      {
        name: "Hydrocarbons",
        classLevel: "11",
        topics: ["Alkanes", "Alkenes & Markovnikov's Rule", "Alkynes", "Aromatic Hydrocarbons (Benzene)", "Electrophilic Substitution"],
      },
      {
        name: "Organic Compounds Containing Halogens",
        classLevel: "12",
        topics: ["Preparation & Properties", "C-X Bond Nature", "Substitution Mechanisms", "Chloroform, Iodoform"],
      },
      {
        name: "Organic Compounds Containing Oxygen",
        classLevel: "12",
        topics: ["Alcohols & Phenols", "Ethers", "Aldehydes & Ketones", "Carboxylic Acids", "Grignard & Aldol Reactions"],
      },
      {
        name: "Organic Compounds Containing Nitrogen",
        classLevel: "12",
        topics: ["Amines (1°/2°/3°)", "Diazonium Salts", "Identification of Amines"],
      },
      {
        name: "Biomolecules",
        classLevel: "12",
        topics: ["Carbohydrates", "Proteins & Amino Acids", "Nucleic Acids (DNA/RNA)", "Vitamins & Hormones", "Enzymes"],
      },
      {
        name: "Principles Related to Practical Chemistry",
        classLevel: "12",
        topics: ["Detection of Functional Groups", "Salt Analysis", "Titrimetric Exercises"],
      },
    ],
  },
  {
    slug: "botany",
    name: "Botany",
    emoji: "🌿",
    color: "#22c55e",
    chapters: [
      {
        name: "Diversity in Living World (Plant Portion)",
        classLevel: "11",
        topics: ["Kingdom Classification", "Algae, Bryophytes, Pteridophytes", "Gymnosperms & Angiosperms", "Fungi & Lichens", "Viruses & Viroids"],
      },
      {
        name: "Structural Organisation in Plants",
        classLevel: "11",
        topics: ["Root, Stem & Leaf Morphology", "Flower & Fruit Structure", "Meristematic Tissues", "Xylem & Phloem", "Secondary Growth"],
      },
      {
        name: "Cell Structure and Function (Plant Focus)",
        classLevel: "11",
        topics: ["Cell Theory & Prokaryotes/Eukaryotes", "Plastids & Vacuole", "Biomolecules", "Cell Cycle & Mitosis/Meiosis"],
      },
      {
        name: "Plant Physiology — Transport",
        classLevel: "11",
        topics: ["Osmosis & Diffusion", "Transpiration", "Ascent of Sap", "Mineral Nutrition & Deficiency"],
      },
      {
        name: "Plant Physiology — Photosynthesis",
        classLevel: "11",
        topics: ["Pigments & Light Reaction", "Calvin Cycle (Dark Reaction)", "C3 & C4 Pathways", "Photorespiration"],
      },
      {
        name: "Plant Physiology — Respiration & Growth",
        classLevel: "11",
        topics: ["Glycolysis & Krebs Cycle", "ETS & Fermentation", "Plant Hormones (Auxin, GA, Cytokinin, ABA, Ethylene)"],
      },
      {
        name: "Reproduction in Plants",
        classLevel: "12",
        topics: ["Microsporogenesis & Megasporogenesis", "Pollination Types", "Double Fertilization", "Apomixis & Parthenocarpy"],
      },
      {
        name: "Genetics (Plant Portion)",
        classLevel: "12",
        topics: ["Mendelian Laws", "Incomplete Dominance & Codominance", "Polygenic Inheritance", "Linkage & Chromosomal Theory"],
      },
      {
        name: "Biotechnology (Plant Applications)",
        classLevel: "12",
        topics: ["Tissue Culture & Micropropagation", "Genetically Modified Crops (Bt)", "Plant Biotechnology Applications"],
      },
      {
        name: "Ecology (Plant Focus)",
        classLevel: "12",
        topics: ["Xerophyte & Hydrophyte Adaptations", "Ecosystem & Productivity", "Nutrient Cycles", "Ecological Succession", "Biodiversity & Conservation"],
      },
    ],
  },
  {
    slug: "zoology",
    name: "Zoology",
    emoji: "🧬",
    color: "#f59e0b",
    chapters: [
      {
        name: "Diversity in Living World (Animal Portion)",
        classLevel: "11",
        topics: ["Non-Chordates (Porifera to Echinodermata)", "Chordates (Fish to Mammals)", "Classification Basis"],
      },
      {
        name: "Structural Organisation in Animals",
        classLevel: "11",
        topics: ["Epithelial, Connective, Muscular, Neural Tissues", "Cockroach Morphology", "Frog Anatomy"],
      },
      {
        name: "Human Physiology — Digestion",
        classLevel: "11",
        topics: ["Digestive System", "Digestive Enzymes", "Absorption of Nutrients"],
      },
      {
        name: "Human Physiology — Breathing",
        classLevel: "11",
        topics: ["Respiratory System", "Mechanism of Breathing", "Transport of Gases"],
      },
      {
        name: "Human Physiology — Circulation",
        classLevel: "11",
        topics: ["Blood Composition & Groups", "Heart Structure", "Cardiac Cycle", "Blood Pressure"],
      },
      {
        name: "Human Physiology — Excretion",
        classLevel: "11",
        topics: ["Excretory System", "Urine Formation", "Kidney Function & Regulation"],
      },
      {
        name: "Human Physiology — Neural & Endocrine",
        classLevel: "11",
        topics: ["Neuron Structure & CNS", "Reflex Action", "Endocrine Glands", "Hormones & Functions"],
      },
      {
        name: "Locomotion and Movement",
        classLevel: "11",
        topics: ["Bones & Muscles", "Muscle Contraction Mechanism"],
      },
      {
        name: "Human Reproduction",
        classLevel: "12",
        topics: ["Male & Female Reproductive Systems", "Gametogenesis", "Menstrual Cycle", "Fertilization & Embryonic Development", "Pregnancy & Lactation"],
      },
      {
        name: "Reproductive Health",
        classLevel: "12",
        topics: ["Birth Control Methods", "Infertility & ART (IVF, ZIFT, GIFT)", "STDs"],
      },
      {
        name: "Genetics and Evolution",
        classLevel: "12",
        topics: ["DNA Structure & Replication", "Transcription & Translation", "Genetic Code & Lac Operon", "Human Genetic Disorders", "Darwin's Theory & Hardy-Weinberg"],
      },
      {
        name: "Biology in Human Welfare",
        classLevel: "12",
        topics: ["Infectious Diseases (Malaria, TB, Dengue, Typhoid)", "Immunity & Vaccines", "AIDS & Cancer", "Drugs & Alcohol Abuse", "Microbes in Human Welfare"],
      },
      {
        name: "Biotechnology (Human Focus)",
        classLevel: "12",
        topics: ["Recombinant DNA Technology", "Gene Therapy", "Insulin Production", "Transgenic Animals"],
      },
      {
        name: "Ecology (Animal & Human Impact)",
        classLevel: "12",
        topics: ["Population Ecology", "Predation, Competition, Mutualism", "Energy Flow & Food Webs", "Biodiversity Loss & Conservation", "Environmental Pollution"],
      },
    ],
  },
];
