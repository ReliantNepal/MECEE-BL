"""
MBBS 2027 CEE Entrance Syllabus Bot
Based on the Medical Education Commission (MEC), Nepal — CEE pattern.
Total: 200 marks / 200 MCQs (Physics 50 + Chemistry 50 + Zoology 30 + Botany 20 + MAT 50)
Note: Verify exact distribution with the official MEC 2027 syllabus.
"""

import sys

SYLLABUS = {
    "Physics": {
        "total_marks": 50,
        "units": {
            "Mechanics": {
                "marks": 9,
                "chapters": [
                    "Physical quantities, units & dimensions",
                    "Vectors (addition, dot/cross product, resolution)",
                    "Kinematics (1D & 2D motion, projectile)",
                    "Laws of motion (Newton's laws, friction)",
                    "Work, energy & power",
                    "Circular motion & gravitation",
                    "Elasticity",
                    "Rotational dynamics (torque, moment of inertia)",
                    "Simple harmonic motion (SHM)",
                    "Fluid statics & dynamics (Bernoulli, viscosity, surface tension)",
                ],
            },
            "Heat & Thermodynamics": {
                "marks": 6,
                "chapters": [
                    "Heat & temperature, thermal expansion",
                    "Quantity of heat (specific heat, latent heat)",
                    "Hygrometry (saturated vapour, humidity)",
                    "Transfer of heat (conduction, convection, radiation)",
                    "First & second laws of thermodynamics",
                    "Kinetic theory of gases",
                ],
            },
            "Waves & Optics": {
                "marks": 9,
                "chapters": [
                    "Wave motion & properties",
                    "Mechanical & sound waves (Doppler effect, beats)",
                    "Reflection & refraction at plane and curved surfaces",
                    "Lenses & lens maker's equation",
                    "Dispersion, spectra, chromatic aberration",
                    "Interference (Young's double slit)",
                    "Diffraction & polarization",
                ],
            },
            "Electricity & Magnetism": {
                "marks": 12,
                "chapters": [
                    "Electric charge & Coulomb's law",
                    "Electric field, potential & Gauss's law",
                    "Capacitors (series/parallel, dielectric)",
                    "DC circuits (Ohm's law, Kirchhoff's laws)",
                    "Thermoelectric effect",
                    "Magnetic field due to current (Biot-Savart, Ampere)",
                    "Force on conductor / moving charge",
                    "Electromagnetic induction (Faraday, Lenz)",
                    "Alternating current (RLC circuits, resonance)",
                ],
            },
            "Modern Physics": {
                "marks": 14,
                "chapters": [
                    "Electrons & photons (photoelectric effect)",
                    "Atomic structure & Bohr's model",
                    "X-rays (production, properties, uses)",
                    "Nuclear physics (radioactivity, fission, fusion)",
                    "Solids & semiconductors (diodes, transistors, logic gates)",
                    "Quantization of energy, de Broglie waves",
                    "Universe (cosmology basics, particles)",
                    "Recent trends in physics",
                ],
            },
        },
    },
    "Chemistry": {
        "total_marks": 50,
        "units": {
            "General & Physical Chemistry": {
                "marks": 18,
                "chapters": [
                    "Language of chemistry (mole concept, stoichiometry)",
                    "Atomic structure (quantum numbers, orbitals)",
                    "Periodic table & periodicity",
                    "Chemical bonding (ionic, covalent, hybridization, VSEPR)",
                    "Oxidation & reduction (redox, equivalent concept)",
                    "States of matter (gas, liquid, solid)",
                    "Solutions (colligative properties)",
                    "Chemical equilibrium",
                    "Ionic equilibrium (pH, buffer, solubility product)",
                    "Chemical kinetics",
                    "Thermochemistry & thermodynamics",
                    "Electrochemistry",
                ],
            },
            "Inorganic Chemistry": {
                "marks": 16,
                "chapters": [
                    "Non-metals: Hydrogen, Oxygen, Ozone",
                    "Halogens (group 17) & their compounds",
                    "Nitrogen family (group 15) — NH3, HNO3",
                    "Sulfur family — H2SO4 contact process",
                    "Alkali metals (Na, K)",
                    "Alkaline earth metals (Mg, Ca)",
                    "Transition metals (general properties)",
                    "Heavy metals — Cu, Ag, Au, Zn, Hg, Fe",
                    "Extraction of metals (metallurgy)",
                    "Bio-inorganic chemistry",
                    "Compounds of metals (carbonates, oxides, etc.)",
                ],
            },
            "Organic Chemistry": {
                "marks": 13,
                "chapters": [
                    "Sources & purification of organic compounds",
                    "Classification, nomenclature (IUPAC), isomerism",
                    "Hydrocarbons (alkanes, alkenes, alkynes)",
                    "Aromatic hydrocarbons (benzene, electrophilic substitution)",
                    "Haloalkanes & haloarenes",
                    "Alcohols, phenols & ethers",
                    "Aldehydes & ketones",
                    "Carboxylic acids & derivatives",
                    "Nitro compounds & amines",
                    "Carbohydrates, proteins, lipids, nucleic acids",
                    "Polymers & drugs",
                ],
            },
            "Applied Chemistry": {
                "marks": 3,
                "chapters": [
                    "Fundamentals of applied chemistry",
                    "Chemistry in the service of mankind (fertilizers, cement, glass)",
                    "Environmental pollution",
                    "Nuclear chemistry & radioactivity",
                ],
            },
        },
    },
    "Zoology": {
        "total_marks": 30,
        "units": {
            "Introduction to Biology": {
                "marks": 1,
                "chapters": [
                    "Branches of biology",
                    "Relevance of biology",
                ],
            },
            "Evolutionary Biology": {
                "marks": 3,
                "chapters": [
                    "Life & its origin",
                    "Theories of evolution (Lamarckism, Darwinism)",
                    "Evidences of evolution",
                    "Human evolution",
                ],
            },
            "Animal Diversity": {
                "marks": 6,
                "chapters": [
                    "Protozoa — Paramecium",
                    "Porifera, Coelenterata",
                    "Platyhelminthes, Nemathelminthes",
                    "Annelida (Earthworm), Arthropoda",
                    "Mollusca (Pila), Echinodermata",
                    "Protochordata & Chordata",
                    "Pisces, Amphibia (Frog), Reptilia, Aves, Mammalia",
                ],
            },
            "Biota & Environment": {
                "marks": 3,
                "chapters": [
                    "Ecosystem, ecological factors",
                    "Wildlife of Nepal",
                    "Environmental pollution",
                    "Conservation biology",
                ],
            },
            "Human Biology (Anatomy & Physiology of Frog/Human)": {
                "marks": 12,
                "chapters": [
                    "Digestive system",
                    "Respiratory system",
                    "Circulatory system (heart, blood)",
                    "Excretory system",
                    "Nervous system & sense organs",
                    "Endocrine system",
                    "Reproductive system & embryology",
                    "Skeletal & muscular system",
                ],
            },
            "Developmental & Applied Biology": {
                "marks": 5,
                "chapters": [
                    "Animal tissues",
                    "Embryonic development (gametogenesis, fertilization, cleavage)",
                    "Human diseases (communicable & non-communicable)",
                    "Adolescence & related issues",
                    "Aging",
                ],
            },
        },
    },
    "Botany": {
        "total_marks": 20,
        "units": {
            "Biomolecules & Cell Biology": {
                "marks": 4,
                "chapters": [
                    "Biomolecules (carbs, proteins, lipids, nucleic acids)",
                    "Cell — structure & function",
                    "Cell division (mitosis & meiosis)",
                ],
            },
            "Plant Diversity (Floral)": {
                "marks": 5,
                "chapters": [
                    "Monera (bacteria, cyanobacteria)",
                    "Protista (algae — Spirogyra)",
                    "Fungi (Mucor, Yeast)",
                    "Lichen",
                    "Bryophyta (Riccia)",
                    "Pteridophyta (Dryopteris)",
                    "Gymnosperms (Pinus)",
                    "Angiosperms — families (Cruciferae, Solanaceae, Liliaceae)",
                ],
            },
            "Genetics": {
                "marks": 3,
                "chapters": [
                    "Mendelism (mono- & di-hybrid cross)",
                    "Linkage, crossing over",
                    "Sex determination & sex-linked inheritance",
                    "Mutation",
                ],
            },
            "Ecology": {
                "marks": 2,
                "chapters": [
                    "Ecosystem (biotic & abiotic)",
                    "Energy flow & nutrient cycle",
                    "Vegetation of Nepal",
                ],
            },
            "Plant Anatomy & Physiology": {
                "marks": 5,
                "chapters": [
                    "Plant tissues",
                    "Photosynthesis & respiration",
                    "Plant water relations (transpiration, absorption)",
                    "Plant growth & hormones",
                    "Reproduction in flowering plants",
                ],
            },
            "Applied Botany": {
                "marks": 1,
                "chapters": [
                    "Biotechnology & tissue culture",
                    "Plants as a source of food / medicine",
                ],
            },
        },
    },
    "MAT (Mental Agility Test)": {
        "total_marks": 50,
        "units": {
            "Verbal Reasoning": {
                "marks": 15,
                "chapters": [
                    "Analogies",
                    "Synonyms & antonyms",
                    "Odd one out",
                    "Coding & decoding",
                    "Series completion",
                    "Direction sense",
                    "Blood relations",
                ],
            },
            "Quantitative Aptitude": {
                "marks": 15,
                "chapters": [
                    "Number system",
                    "Percentage, profit & loss",
                    "Ratio & proportion",
                    "Time, speed & distance",
                    "Time & work",
                    "Averages",
                    "Simple & compound interest",
                ],
            },
            "Logical & Abstract Reasoning": {
                "marks": 10,
                "chapters": [
                    "Statements & conclusions",
                    "Syllogisms",
                    "Figure series & pattern recognition",
                    "Mirror & water images",
                    "Cubes & dice",
                    "Venn diagrams",
                ],
            },
            "Data Interpretation & General Awareness": {
                "marks": 10,
                "chapters": [
                    "Tables, bar graphs, pie charts",
                    "Line graphs interpretation",
                    "Basic current affairs",
                    "General medical/science awareness",
                ],
            },
        },
    },
}


# ---------- UI helpers ----------
def line(char="=", n=60):
    print(char * n)


def header(text):
    line()
    print(f"  {text}")
    line()


def show_overview():
    header("MBBS 2027 CEE — SYLLABUS OVERVIEW")
    total = 0
    for subject, data in SYLLABUS.items():
        marks = data["total_marks"]
        total += marks
        print(f"  {subject:<35} {marks:>3} marks")
    line("-")
    print(f"  {'TOTAL':<35} {total:>3} marks / MCQs")
    line()
    print("  Exam duration: 3 hours | Negative marking: usually none")
    print("  Conducted by: Medical Education Commission (MEC), Nepal")
    line()


def show_subject(subject):
    data = SYLLABUS[subject]
    header(f"{subject.upper()}  —  Total: {data['total_marks']} marks")
    for i, (unit, info) in enumerate(data["units"].items(), 1):
        pct = (info["marks"] / data["total_marks"]) * 100
        print(f"  [{i}] {unit}")
        print(f"      Marks: {info['marks']}  ({pct:.1f}% of {subject})")
        print(f"      Chapters: {len(info['chapters'])}")
        print()


def show_unit(subject, unit_index):
    data = SYLLABUS[subject]
    unit_list = list(data["units"].items())
    if unit_index < 1 or unit_index > len(unit_list):
        print("  Invalid unit number.")
        return
    unit, info = unit_list[unit_index - 1]
    header(f"{subject}  >  {unit}")
    print(f"  Marks weight: {info['marks']} / {data['total_marks']}")
    print(f"  Number of chapters: {len(info['chapters'])}")
    line("-")
    print("  CHAPTERS / TOPICS COVERED:")
    for i, ch in enumerate(info["chapters"], 1):
        print(f"    {i:>2}. {ch}")
    line()


def show_full_subject(subject):
    data = SYLLABUS[subject]
    header(f"FULL DETAILS — {subject.upper()}  ({data['total_marks']} marks)")
    for unit, info in data["units"].items():
        pct = (info["marks"] / data["total_marks"]) * 100
        print(f"\n  >> {unit}  [{info['marks']} marks | {pct:.1f}%]")
        for i, ch in enumerate(info["chapters"], 1):
            print(f"      {i:>2}. {ch}")
    line()


def search_topic(keyword):
    keyword = keyword.lower().strip()
    if not keyword:
        return
    header(f"SEARCH RESULTS for '{keyword}'")
    found = 0
    for subject, data in SYLLABUS.items():
        for unit, info in data["units"].items():
            matches = [ch for ch in info["chapters"] if keyword in ch.lower()]
            if matches or keyword in unit.lower():
                print(f"\n  {subject} > {unit}  [{info['marks']} marks]")
                for ch in matches:
                    print(f"      - {ch}")
                found += len(matches) if matches else 1
    if not found:
        print("  No matches found.")
    line()


def study_priority():
    header("STUDY PRIORITY — HIGH-WEIGHT UNITS")
    rows = []
    for subject, data in SYLLABUS.items():
        for unit, info in data["units"].items():
            rows.append((info["marks"], subject, unit))
    rows.sort(reverse=True)
    print(f"  {'Marks':<7}{'Subject':<15}{'Unit'}")
    line("-")
    for marks, subject, unit in rows[:15]:
        print(f"  {marks:<7}{subject:<15}{unit}")
    line()
    print("  Tip: master these 15 units first — they carry the bulk of marks.")
    line()


# ---------- main loop ----------
def main_menu():
    while True:
        print()
        header("MBBS 2027 CEE SYLLABUS BOT")
        print("  1. Overview (marks distribution)")
        print("  2. Physics")
        print("  3. Chemistry")
        print("  4. Zoology")
        print("  5. Botany")
        print("  6. MAT (Mental Agility Test)")
        print("  7. Search a topic")
        print("  8. Show top high-weight units (study priority)")
        print("  9. Show EVERYTHING (full syllabus dump)")
        print("  0. Exit")
        line()
        choice = input("  Choose an option: ").strip()

        if choice == "0":
            print("\n  All the best for CEE 2027! Study smart. ")
            sys.exit(0)
        elif choice == "1":
            show_overview()
        elif choice in {"2", "3", "4", "5", "6"}:
            subj_map = {
                "2": "Physics",
                "3": "Chemistry",
                "4": "Zoology",
                "5": "Botany",
                "6": "MAT (Mental Agility Test)",
            }
            subject = subj_map[choice]
            subject_menu(subject)
        elif choice == "7":
            kw = input("  Enter keyword (e.g. 'heart', 'photosynthesis', 'optics'): ")
            search_topic(kw)
        elif choice == "8":
            study_priority()
        elif choice == "9":
            for s in SYLLABUS:
                show_full_subject(s)
        else:
            print("  Invalid choice, try again.")


def subject_menu(subject):
    while True:
        show_subject(subject)
        print("  Options:")
        print("    [number] -> view that unit's chapters")
        print("    F        -> full detailed view of this subject")
        print("    B        -> back to main menu")
        line()
        choice = input("  Choose: ").strip().lower()
        if choice == "b":
            return
        elif choice == "f":
            show_full_subject(subject)
            input("  Press Enter to continue...")
        elif choice.isdigit():
            show_unit(subject, int(choice))
            input("  Press Enter to continue...")
        else:
            print("  Invalid choice.")


if __name__ == "__main__":
    try:
        main_menu()
    except KeyboardInterrupt:
        print("\n  Exited. Good luck!")
