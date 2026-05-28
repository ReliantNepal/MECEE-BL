/* Shared syllabus data — used by tracker.html and library.html. */
window.SYLLABUS = {
  "Physics": { emoji: "⚛️", total: 50, units: {
    "Mechanics": { marks: 10, chapters: [
      { n: "Physical quantities, vectors and scalars", m: ["Precision, accuracy, significant figures","Dimensional analysis","Concept, laws and calculations of vectors and scalars"] },
      { n: "Kinematics", m: ["Linear and projectile motions","In presence as well as absence of resistive force","Concepts, calculations and graphical treatment"] },
      { n: "Dynamics", m: ["Newton's laws and equilibrium conditions","Force, impulse, momentum, torque","Work, energy and power","Linear motions, collisions, solid friction"] },
      { n: "Rotational dynamics", m: ["Moment of inertia (rigid uniform rod only)","Radius of gyration","Torque, work, energy and power related to rotational motion"] },
      { n: "Fluid statics and dynamics", m: ["Pressure, surface tension and energy","Capillary action","Newton, Stokes, Poiseuille, Bernoulli laws/principles related to fluids"] },
      { n: "Circular and Periodic motion", m: ["Displacement, velocity, acceleration, centripetal force","Motion in horizontal and vertical circle","Simple harmonic motion (period, frequency, displacement, amplitude, velocity, acceleration, restoring force, energy)","Concept of forced oscillations"] },
      { n: "Gravity", m: ["Gravitation force, acceleration","Field strength","Energy and potential","Definitions, laws, calculations, graphical treatment"] },
      { n: "Elasticity", m: ["Strain, stress","Moduli of elasticity","Poisson ratio","Energy density"] }
    ]},
    "Heat and thermodynamics": { marks: 7, chapters: [
      { n: "Thermal energy, heat, temperature, heat flow and thermometers", m: ["Concept of thermal energy, heat and temperature","Modes and laws (zeroth law and Stefan-Boltzmann) of heat flow","Thermometers: liquid in glass, resistance thermometer, radiation thermometer (working principle, advantages, limitations)"] },
      { n: "Thermal expansion", m: ["Linear, cubical, superficial expansion","Real and apparent expansions","Calculations and applications"] },
      { n: "Quantity of heat", m: ["Heat capacity, specific heat capacity","Latent heats","Triple point"] },
      { n: "Ideal gas", m: ["Molecular properties of ideal gas","Pressure, volume, temperature, rms speed, energy"] },
      { n: "First law of thermodynamics", m: ["Thermodynamic system and processes","Adiabatic, isothermal, isochoric and isobaric"] },
      { n: "Second law of thermodynamics", m: ["Internal combustion heat engines","Refrigerator","Concept of entropy"] }
    ]},
    "Waves and optics": { marks: 8, chapters: [
      { n: "Wave motion", m: ["Progressive waves","Velocity of sound in solid, liquid and gas","Factors affecting the velocity"] },
      { n: "Stationary waves", m: ["Concept of stationary waves","Velocity, harmonics and overtones in pipes and strings","Calculations and applications"] },
      { n: "Acoustic phenomena", m: ["Pressure amplitude","Characteristics of waves (intensity, loudness, quality and pitch)","Doppler effect — concept, calculations and applications"] },
      { n: "Reflection, refraction and dispersion", m: ["Reflection at curve mirror","Refraction at plane surfaces and in lens","Dispersion (chromatic aberration, achromatism)"] },
      { n: "Interference", m: ["Concept, conditions and applications of interference","Young's double slit experiment"] },
      { n: "Diffraction and polarization", m: ["Concept and conditions of diffraction","Diffraction at a single slit and diffraction grating","Resolving power of optical instruments","Polarization and Brewster's law"] }
    ]},
    "Current electricity and magnetism": { marks: 9, chapters: [
      { n: "Electrical quantities", m: ["Ohm's and Joule's laws","Resistances, emf, p.d., energy, power"] },
      { n: "Electrical circuits", m: ["Kirchhoff's laws","Resistors in different combinations","Wheatstone Bridge","Meter bridge","Potentiometer","Galvanometer as ammeter and voltmeter"] },
      { n: "Thermoelectric effect", m: ["Seebeck and Peltier effects","Thermocouple"] },
      { n: "Alternating currents", m: ["Peak and rms values of AC","Impedance, power, Q-factor and phase in LRC circuits","Rectification using diode bridge"] },
      { n: "Magnetic properties of materials", m: ["Domains, relative permeability, susceptibility, hysteresis","Dia, para and ferromagnetic materials"] },
      { n: "Magnetic field", m: ["B-field around straight current-carrying conductor, circular coil, long solenoid","Effect of uniform B-field on moving charge and current-carrying conductor/coil","Hall effect"] },
      { n: "Electromagnetic induction", m: ["Faraday's law and Lenz's law","A.C. generator, transformer, eddy current","Inductance (self and mutual)","Energy stored in an inductor"] }
    ]},
    "Electrostatics and capacitors": { marks: 4, chapters: [
      { n: "Electric charge and electric field", m: ["Electric field due to point charges","Electrostatic induction","Coulomb's law and its applications"] },
      { n: "Electric field strength, potential and potential energy", m: ["Concepts, calculation, graphical analysis","Gauss's law and related applications"] },
      { n: "Capacitors", m: ["Principle of capacitor","Parallel plate capacitor","Combinations of capacitors","Energy density","Effect of dielectric"] }
    ]},
    "Modern physics": { marks: 12, chapters: [
      { n: "Nuclear physics", m: ["Nucleus and its properties (charge, size, mass, density)","Mass defect, binding energy per nucleon","Einstein's mass-energy relation","Nuclear fusion and fission"] },
      { n: "Electron", m: ["Motion of electron in an electric and magnetic field","Millikan's oil drop experiment","J.J. Thomson's experiment"] },
      { n: "Photon", m: ["Concept, laws and calculations of photon","Photo-electric effect"] },
      { n: "Wave particle duality", m: ["Bohr's theory of hydrogen atom (spectral series, energy levels)","De-Broglie wave","Uncertainty principle","X-rays — properties, uses and production","Bragg's law and applications"] },
      { n: "Radioactivity", m: ["Concept, laws and units of radioactivity","Properties of alpha, beta and gamma rays","Half-life, mean life and their relations","Carbon dating","Medical use of nuclear radiations and health hazard"] },
      { n: "Solid and semiconductor device", m: ["Energy band in solids (metal, semiconductor, insulator)","Intrinsic and extrinsic semiconductor","p-n diode, biasing of diode","p-n diode as a rectifier","Logic gates (AND, OR, NOT, NOR, NAND)"] },
      { n: "Particle physics and recent trends", m: ["Particle, antiparticle, leptons and quarks","Higgs boson","Nanotechnology","Big bang theory","Hubble law"] }
    ]}
  }},
  "Chemistry": { emoji: "🧪", total: 50, units: {
    "Physical Chemistry": { marks: 17, chapters: [
      { n: "Basic Concepts in Chemistry", m: ["Atoms, molecules, valency","Relative atomic mass and molecular mass","Atomic mass unit, radicals","Molecular formula, chemical equation","Empirical formula, percentage composition"] },
      { n: "Stoichiometry", m: ["Dalton's atomic theory","Laws of stoichiometry","Avogadro's law and applications","Mole concept","Limiting reactants, percentage yield","Related numerical problems"] },
      { n: "Atomic Structure", m: ["Rutherford's atomic model","Bohr's atomic model","Spectrum of hydrogen atom","de-Broglie's wave equation","Heisenberg's uncertainty principle","Orbitals, quantum numbers","Aufbau principle, Pauli's exclusion principle, Hund's rule of maximum multiplicity","Electronic configuration"] },
      { n: "Classification of Elements and Periodicity", m: ["Modern periodic law and table","s, p, d and f block elements","Periodicity, isoelectronic species","Atomic size, ionic size, ionization potential, electronegativity, electron affinity, metallic character"] },
      { n: "Chemical Bonding and Shape of Molecules", m: ["Electronic theory of valency","Ionic, covalent and coordinate covalent bonds","Lewis dot structure (s and p block elements)","VSEPR theory — shape and geometry","Valence Bond Theory (sigma and pi-bond)","Hybridization","Dipole moment","Ionic character in covalent bond","Bond length","Hydrogen bonding","Metallic bond","Vander Waal's forces"] },
      { n: "Redox Reaction", m: ["Classical and electronic concept of oxidation and reduction","Oxidation number","Balancing redox by oxidation-number and ion-electron methods","Applications"] },
      { n: "States of Matter", m: ["Gas: kinetic theory, gas laws, ideal and combined gas equation, deviation from ideality","Liquid: vapour pressure, boiling point, surface tension, viscosity, liquid crystal, solution, solubility curve","Solid: crystalline & amorphous, efflorescence, deliquescence, hygroscopic","Crystallization, water of crystallization","Unit cell, 7-crystal system and 14-Bravais lattices","Classification by dominant bonds"] },
      { n: "Chemical Equilibrium", m: ["Physical and chemical equilibrium","Law of mass action","Equilibrium constants Kp, Kc","Reaction quotient","Le-Chatelier's principle and its applications"] },
      { n: "Volumetric Analysis", m: ["Equivalent weights","Concentration: %, g/L, normality, molarity, molality, formality, ppm, ppb, mole fraction","Primary and secondary standard substances","Law of equivalence and normality equation","Related numerical problems"] },
      { n: "Ionic Equilibrium", m: ["Arrhenius theory of ionization","Arrhenius, Bronsted-Lowry and Lewis concepts of acids and bases","Ostwald's dilution law","Ionic product of water, pKa, pKb, pH, pOH","Common ion effect","Solubility and solubility product principle","Acidic and basic buffer solutions","Types of salts, qualitative aspect of hydrolysis of salt"] },
      { n: "Chemical Kinetics", m: ["Rate of reactions, equivalent rate expression","Rate constant and its unit","Order and molecularity","Integrated rate law for zero and first order reactions, half-lives","Collision theory","Activation energy, threshold energy, activated complex","Factors affecting rate","Homogeneous, heterogeneous and enzyme catalysis"] },
      { n: "Electrochemistry", m: ["Electrolytic cell","Qualitative and quantitative aspects of electrolysis","Standard electrode potential","Standard hydrogen electrode, calomel electrode","Electrochemical series and applications","Galvanic cell and standard emf","Primary and secondary cells","Hydrogen-oxygen fuel cell"] },
      { n: "Chemical Thermodynamics", m: ["Thermodynamic systems, surrounding","Open, closed and isolated system","State function, internal energy","Exothermic and endothermic processes","Extensive and intensive properties","First law of thermodynamics","Enthalpy: reaction, solution, formation, combustion, neutralization, fusion, vaporization","Laplace law and Hess's law","Spontaneous and non-spontaneous process","Entropy, second law","Gibbs free energy and spontaneity","Relation between standard Gibbs free energy and equilibrium constant"] },
      { n: "Nuclear Chemistry", m: ["Radioactivity","Types of nuclear reactions","Radioisotopes","Radio-carbon dating"] }
    ]},
    "Inorganic Chemistry": { marks: 10, chapters: [
      { n: "Chemistry of Non-metals", m: ["Atomic, molecular, nascent hydrogen","Isotopes of hydrogen, heavy water","Types of oxides","Preparation, structure and test of ozone","Ozone layer depletion","Ammonia, phosphine and nitric acid","Chlorine, bromine and iodine (preparation, properties, test)","HCl, HBr and HI","Allotropes of carbon","Carbon monoxide","H2S, SO2, sulphuric acid"] },
      { n: "Chemistry of Metals", m: ["Metallurgical principles: hydro/pyro/electrometallurgy","Ores, gangue, flux, slag","Concentration, calcination, roasting, smelting","Bessemerization, aluminothermite","Electrochemical reduction, poling, electro-refinement, zone refining","Alkali and alkaline earth metals","Sodium, NaOH, Na2CO3","Transition metals (3d series)","Complex ion shapes: tetrahedral, square planar, octahedral","Crystal field theory of octahedral complex","Cu, Zn, Hg, Ag, Fe — occurrence, extraction, properties","Blue vitriol, white vitriol, calomel, corrosive sublimate","Manufacture of steel — basic oxygen and open hearth","Corrosion of iron"] },
      { n: "Bio-inorganic Chemistry", m: ["Micro and macro nutrients","Biological importance of Na, K, Mg, Zn, Cu, Co, Ni, Fe, Cr, Ca ions","Sodium-potassium and sodium-glucose pump","Toxicity of Fe, As, Hg, Pb, Cd"] }
    ]},
    "Organic Chemistry": { marks: 17, chapters: [
      { n: "General Organic Chemistry", m: ["Tetra-covalency, catenation of carbon","Classification of organic compounds","Alkyl and aryl groups","Functional groups, homologous series","IUPAC name of aliphatic compounds","Isomerism","Heterolytic and homolytic bond fission","Electrophile, nucleophile, carbocation, carbanion, free radicals","Inductive effect, resonance effect"] },
      { n: "Hydrocarbons", m: ["Cracking, pyrolysis, reforming","Quality of gasoline, octane number, cetane number, gasoline additive","Isomerism, IUPAC name","Preparation of alkane, alkene and alkyne","Chemical properties of ethane","Addition reactions of alkene","Addition reaction and acidity of alkyne"] },
      { n: "Aromatic Hydrocarbons", m: ["Aromaticity","Resonance","Preparation and chemical properties of benzene"] },
      { n: "Haloalkanes and Haloarenes", m: ["Nomenclature, isomerism, classification","Preparation and properties of monohaloalkanes","SN1 and SN2 mechanisms","Chloroform and chlorobenzene"] },
      { n: "Alcohols and Phenols", m: ["Nomenclature, isomerism, classification","Preparation and properties of monohydric alcohols","Oxo-process","Hydroboration-oxidation of ethene","Fermentation of sugar","Types of ethanol (absolute, power, methylated, rectified spirit, alcoholic beverages)","Preparation and properties of phenol"] },
      { n: "Ethers", m: ["Nomenclature, classification, isomerism","Williamson's synthesis","Chemical properties of diethyl ether"] },
      { n: "Aldehydes and Ketones", m: ["Nomenclature, isomerism","Preparation and properties of aliphatic carbonyl compounds","Preparation and properties of benzaldehyde"] },
      { n: "Carboxylic Acid and its Derivatives", m: ["Nomenclature, isomerism","Preparation and properties of monocarboxylic acids","Acid halide, anhydride, amides, esters","Relative reactivity"] },
      { n: "Nitro-compounds", m: ["Nomenclature, isomerism","Preparation and chemical properties of nitroalkanes and nitrobenzene"] },
      { n: "Amine", m: ["Nomenclature, classification, isomerism","Preparation of primary amines","Basicity of amines","Hoffmann's method — separation of primary, secondary, tertiary amines","Aniline — preparation and properties"] },
      { n: "Organometallic Compounds", m: ["Organo-lithium, organocopper, organocadmium compounds","Metal-carbon bonding","Grignard's reagent — preparation and properties"] }
    ]},
    "Applied Chemistry": { marks: 3, chapters: [
      { n: "Fundamentals of Applied Chemistry and Manufacturing Processes", m: ["Chemical industry — importance, production stages","Plant management — cost, cash flow, operation, design","Continuous and batch processing","Environmental effects and control measures","Cement, paper and pulp","Nitric acid (Ostwald's process)","Ammonia (Haber's process)","Sulphuric acid (Contact process)","Caustic soda (Diaphragm cell)","Sodium carbonate (Ammonia soda / Solvay process)","Urea (Ammonium carbamate process)"] },
      { n: "Applications of Non-metals, Metals and Compounds", m: ["Hydrogen and isotopes, oxygen, ozone, heavy water, H2O2","Nitrogen, ammonia, nitric acid","Sulphur, H2S, SO2, sulphuric acid, hypo","Halogens, halogen acids","Carbon, CO, phosphorous, phosphine","Sodium, caustic soda, washing soda, baking soda","Quick lime, slaked lime, bleaching powder, plaster of Paris","Magnesia, epsom salt, gypsum","Copper, blue vitriol, oxides of Cu","Zinc, white vitriol, mercury, calomel, corrosive sublimate","Iron, silver chloride, silver nitrate","Alkane, alkene, alkyne, aromatic hydrocarbons","Chloroform, alcohol, phenol","Aldehydes, ketones, ethers, haloarene","Carboxylic acids and derivatives, nitro-compounds, amines","Formalin, chloropicrin, chloretone","Grignard's reagent"] },
      { n: "Chemistry in Service to Mankind", m: ["Polymer, dyes, drugs","Pesticides, fertilizer","Applications of colloid","Osmotic pressure","Buffer in daily life","Medical and industrial applications of radioisotopes"] }
    ]},
    "Analytical Chemistry": { marks: 3, chapters: [
      { n: "Chemical Tests", m: ["Tests of acid and basic radicals","Tests of unsaturation and functional groups","Distinction tests of organic compounds","Hetero-element detection by Lassaigne's test","Biomolecule tests (fat, protein, carbohydrate)"] },
      { n: "Separation Techniques", m: ["Filtration, sublimation, evaporation, precipitation","Simple and fractional crystallization","Simple, fractional and vacuum distillation","Paper chromatography","Atmolysis"] },
      { n: "Types of Titration", m: ["Acid-base titration","Redox: permanganometric, iodometric, iodimetric","Complexometric titration","Selection of indicators in acid-base titration"] }
    ]}
  }},
  "Zoology": { emoji: "🦋", total: 40, units: {
    "Evolutionary Biology": { marks: 3, chapters: [
      { n: "Origin of life", m: ["Oparin-Haldane theory","Miller-Urey's experiment"] },
      { n: "Evidences of evolution", m: ["Morphological","Anatomical","Paleontological","Embryological","Biochemical"] },
      { n: "Theories", m: ["Lamarckism","Darwinism","Neo-Darwinism"] },
      { n: "Human evolution", m: ["From Ramapithecus to modern man"] }
    ]},
    "Animal Diversity and Classification": { marks: 4, chapters: [
      { n: "Diagnostic features and classification from Protozoa to Chordata", m: ["Diagnostic features of each phylum","Classification from Protozoa to Chordata"] }
    ]},
    "Animal Tissues and Histology": { marks: 4, chapters: [
      { n: "Epithelial tissue", m: ["Structure, location, function"] },
      { n: "Connective tissue", m: ["Structure, location, function"] },
      { n: "Muscular tissue", m: ["Structure, location, function"] },
      { n: "Nervous tissue", m: ["Structure, location, function"] }
    ]},
    "Study of Selected Animals": { marks: 6, chapters: [
      { n: "Plasmodium", m: ["Habitat","Structure","Life cycle","Malaria types"] },
      { n: "Earthworm (Pheretima)", m: ["Morphology","Different body systems and physiology","Economic importance"] },
      { n: "Frog (Rana)", m: ["Morphology","Different body systems and physiology"] }
    ]},
    "Human Biology and Physiology": { marks: 15, chapters: [
      { n: "Digestive System", m: ["Alimentary canal and digestive glands","Physiology of digestion"] },
      { n: "Respiratory System", m: ["Respiratory organs","Gas exchange and transport","Regulation of respiration","Concept of respiratory disorders"] },
      { n: "Circulatory System", m: ["Heart, cardiac cycle and output","Heartbeat","Arterial and venous system","Blood group and pressure","Concept of cardiovascular disorders"] },
      { n: "Excretory System", m: ["Excretory organs","Urine formation","Concept of renal disorders"] },
      { n: "Nervous System", m: ["CNS, PNS and autonomic","Nerve impulse"] },
      { n: "Sense Organs", m: ["Eye","Ear"] },
      { n: "Endocrinology", m: ["Glands, hormones and disorders"] },
      { n: "Reproductive System", m: ["Organs","Gametogenesis","Ovarian and menstrual cycle"] }
    ]},
    "Microbial diseases and Immunology": { marks: 4, chapters: [
      { n: "Diseases", m: ["Typhoid","TB","HIV","Cholera","Influenza","Hepatitis","Candidiasis"] },
      { n: "Immunity", m: ["Innate and acquired","Antigens and antibodies"] },
      { n: "Vaccines", m: ["Live attenuated","Inactivated","Toxoid"] }
    ]},
    "Medical Technology and Applied Biology": { marks: 2, chapters: [
      { n: "Medical technology", m: ["Tissue and Organ transplantation","In-Vitro Fertilization (IVF)","Amniocentesis","Transgenic animals"] },
      { n: "Applied microbiology", m: ["Dairy/beverage microbes","Sewage and drinking water treatment","Bio-control agents"] }
    ]},
    "Biota, Environment and Conservation": { marks: 2, chapters: [
      { n: "Animal Behavior", m: ["Reflex actions","Taxis","Migration"] },
      { n: "Environmental pollution", m: ["Air, water and soil pollution","Pesticides"] },
      { n: "Adaptations", m: ["Aquatic","Terrestrial","Volant"] },
      { n: "Conservation Biology", m: ["Biodiversity","Protected areas","Hotspots","Ramsar sites","IUCN categories","Endangered species of Nepal"] }
    ]}
  }},
  "Botany": { emoji: "🌿", total: 40, units: {
    "Basic Components of Life": { marks: 2, chapters: [
      { n: "Carbohydrates, lipids and minerals", m: ["Structure, types and biological role"] },
      { n: "Proteins and enzymes", m: ["Structure, types and biological role"] }
    ]},
    "Biodiversity": { marks: 9, chapters: [
      { n: "Introduction — General concept of classification", m: ["2-Kingdom system","Taxonomic hierarchies & binomial nomenclature","5-Kingdom system","3 Domain system"] },
      { n: "Monera & Virus", m: ["Structure of bacterial cell","Types of bacteria","Mode of nutrition in bacteria","Bacterial growth","General characteristics of Cyanobacteria","Characteristics, structure, chemical composition of viruses","Types of viruses"] },
      { n: "Fungi & Lichens", m: ["Characteristic features: Phycomycetes, Ascomycetes, Basidiomycetes, Deuteromycetes","Structure and reproduction of yeast and Mucor","Introduction and types of lichens"] },
      { n: "Algae", m: ["General introduction","Characteristic features: Chlorophyceae, Rhodophyceae, Phaeophyceae","Structure & reproduction of Spirogyra"] },
      { n: "Bryophytes", m: ["Characteristic features: Hepaticopsida (Liverworts), Anthocerotopsida (Hornworts), Bryopsida (Moss)","Morphological structure and reproduction of Marchantia"] },
      { n: "Pteridophytes", m: ["Characteristic features of Pteridophytes","Morphological structure and reproduction of Dryopteris"] },
      { n: "Gymnosperms", m: ["Characteristic features of Gymnosperms","Morphological structure and reproduction of Pinus"] },
      { n: "Angiosperms", m: ["Morphology of root, stem, leaf, inflorescence, flower and fruit","Diagnostic characters, floral formulae and floral diagram","Families: Brassicaceae, Solanaceae, Fabaceae, Liliaceae"] },
      { n: "Economic Importance & Medicinal Plants", m: ["Economic importance of Virus, Bacteria, Blue-green algae","Economic importance of Fungi, Algae, Bryophytes","Economic importance of Pteridophytes, Gymnosperms and Angiosperms of Nepal","Azadirachta indica (Neem)","Rauwolfia serpentina (Sarpagandha)","Ophiocordyceps sinensis (Yarsagumba)","Ocimum sanctum (Tulasi)","Zingiber officinale (Ginger)"] }
    ]},
    "Ecology & Vegetation": { marks: 4, chapters: [
      { n: "Ecosystem Ecology", m: ["Structural and functional aspects of pond ecosystem","Structural and functional aspects of forest ecosystem","Biotic interactions"] },
      { n: "Biogeochemical Cycles & Ecological Imbalances", m: ["Carbon and nitrogen cycle","Greenhouse effect","Acid rain","Ozone layer depletion","Climate change"] },
      { n: "Vegetation and adaptation", m: ["Forest types of Nepal","Biological invasion","Ecological succession","Ecological adaptation (Hydrosere & Xerosere)"] }
    ]},
    "Cell Biology": { marks: 5, chapters: [
      { n: "Concept of prokaryotic and eukaryotic cells; cell theory", m: ["Prokaryotic vs eukaryotic cells","Cell theory"] },
      { n: "Composition, structure and functions of cell organelles", m: ["Cell wall, cell membrane","Mitochondria, chloroplasts","Endoplasmic reticulum (ER), Golgi body","Lysosome, ribosome","Nucleus, chromosomes","Cilia and flagella","Cell inclusions"] },
      { n: "Cell cycle and cell division", m: ["Concept of cell cycle","Amitosis","Mitosis","Meiosis","Cell division and its significance"] }
    ]},
    "Genetics": { marks: 6, chapters: [
      { n: "Genetic Material", m: ["Composition, structure and functions of DNA and RNA","DNA replication","Central dogma","Genetic code"] },
      { n: "Mendelian Genetics", m: ["General terminology","Laws of inheritance","Incomplete dominance","Co-dominance"] },
      { n: "Linkage and crossing over", m: ["Concept and types of linkage","Complete and incomplete linkage","Concept and significance of crossing over"] },
      { n: "Sex-linked Inheritance", m: ["Concepts and patterns of sex-linked inheritance","Color blindness in humans","Eye color in Drosophila melanogaster"] },
      { n: "Mutation & Polyploidy", m: ["Concept and types — gene and chromosomal mutations","Importance of mutation","Polyploidy (origin, types, significance)"] },
      { n: "Genetic disorders", m: ["Down's syndrome","Turner's syndrome","Edward's syndrome","Klinefelter's syndrome","Albinism","Hemophilia"] }
    ]},
    "Plant Anatomy": { marks: 3, chapters: [
      { n: "Plant tissues", m: ["Concept, characters, classification","Structure and functions of different types of plant tissues"] },
      { n: "Types of vascular bundles", m: ["Types of vascular bundles"] },
      { n: "Anatomy of monocot and dicot — T.S. and L.S.", m: ["Root (monocot & dicot)","Stem (monocot & dicot)","Leaf (monocot & dicot)"] }
    ]},
    "Plant Physiology": { marks: 6, chapters: [
      { n: "Water Relations", m: ["Diffusion, diffusion pressure, diffusion pressure deficit","Osmosis and its types","Plasmolysis, osmotic pressure, osmotic potential","Water potential, wall potential","Turgor pressure and wall pressure","Transpiration, ascent of sap","Absorption, imbibition, guttation, wilting"] },
      { n: "Photosynthesis", m: ["Introduction and significance","Photosynthetic pigments","Photosystem I and II","Light-dependent reactions","Calvin-Benson cycle (C3 cycle)","Hatch-Slack pathway (C4 cycle)","Photorespiration","Factors affecting photosynthesis","Concept of bacterial photosynthesis"] },
      { n: "Respiration", m: ["Introduction and significance","Types of respiration","Mechanism of aerobic and anaerobic respiration","Glycolysis","Oxidative decarboxylation","Krebs (TCA) cycle","Electron transport system and oxidative phosphorylation","Anaerobic respiration and its mechanism","Factors affecting respiration"] },
      { n: "Plant Growth", m: ["Physiological roles and application of plant growth promotors","Auxin, gibberellins and cytokinins","Seed germination and types","Seed dormancy"] }
    ]},
    "Developmental Botany": { marks: 2, chapters: [
      { n: "Asexual reproduction", m: ["Asexual reproduction in angiosperms"] },
      { n: "Sporogenesis and gametogenesis in angiosperms", m: ["Sporogenesis","Gametogenesis"] },
      { n: "Pollination and fertilization", m: ["Pollination and its types","Fertilization"] },
      { n: "Embryo and endosperm", m: ["Structure of monocot and dicot embryo","Types and functions of endosperms"] }
    ]},
    "Applied Botany": { marks: 3, chapters: [
      { n: "Plant tissue culture", m: ["Introduction, concept","Types","Application"] },
      { n: "Genetic engineering", m: ["Introduction, concept","Application"] },
      { n: "Agricultural applications", m: ["Biofertilizers","Green manures","Plant breeding","Bio-engineering","Food safety and security"] }
    ]}
  }},
  "MAT": { emoji: "🧠", total: 20, units: {
    "Verbal Reasoning": { marks: 5, chapters: [
      { n: "Verbal Reasoning", m: ["Analogies","Synonyms & antonyms","Odd one out","Coding & decoding","Direction sense","Blood relations"] }
    ]},
    "Numerical Reasoning": { marks: 5, chapters: [
      { n: "Numerical Reasoning", m: ["Number system & series","Percentage, profit & loss","Ratio & proportion","Time, speed & distance","Time & work","Averages","Simple & compound interest"] }
    ]},
    "Logical Sequencing": { marks: 5, chapters: [
      { n: "Logical Sequencing", m: ["Series completion","Statements & conclusions","Syllogisms","Seating arrangements","Puzzles & ordering"] }
    ]},
    "Spatial Relation / Abstract Reasoning": { marks: 5, chapters: [
      { n: "Spatial Relation / Abstract Reasoning", m: ["Figure series & pattern recognition","Mirror & water images","Paper folding & cutting","Cubes & dice","Venn diagrams"] }
    ]}
  }}
};
