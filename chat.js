/* ===== CONFIG ===== */
/* Source key strings from the central MeceeKeys registry (mecee_keys.js). The
   local consts here are kept as readable aliases so the rest of this file
   reads naturally. */
const KEY_API    = MeceeKeys.CHAT_API;
const KEY_MODEL  = MeceeKeys.CHAT_MODEL;
const KEY_PROMPT = MeceeKeys.CHAT_PROMPT;
const KEY_CHATS  = MeceeKeys.CHATS;
const KEY_ACTIVE = MeceeKeys.CHAT_ACTIVE;
const THEME_KEY  = MeceeKeys.THEME;

const DEFAULT_PROMPT = `You are a focused, friendly study tutor for MECEE-BL 2027 — Nepal's medical entrance exam (MBBS/BDS/BSc Nursing).

Subjects: Physics (50), Chemistry (50), Zoology (40), Botany (40), MAT (20). Total 200 MCQs, 3 hours, 0.25 negative marking.

When the student asks about a topic:
1. Give a concise concept summary (2–4 short bullets).
2. List "Key things to memorise" (formulae, dates, named scientists, etc.).
3. Suggest a study approach (e.g. flowchart, mnemonic, spaced repetition).
4. Flag common exam traps or frequently-asked sub-points.
5. End with 2–3 sample MCQs at varying difficulty (only if the student wants).

Be concise. Use bullet points. Prefer plain language over jargon. If the student is confused, slow down and rebuild from basics.`;

let chats = JSON.parse(localStorage.getItem(KEY_CHATS) || "[]");
let activeChatId = localStorage.getItem(KEY_ACTIVE);

/* ===== File-sourced OpenAI key =====
   The permanent source of truth is .mecee-secrets/OPENAIAPI.txt, served by
   the launcher at /api/openai-key. We fetch it on every page load so a hard
   refresh always re-reads from disk — the user only edits the file to rotate
   the key. localStorage is a fallback for offline / no-launcher use. */
let FILE_OPENAI_KEY = null;
(async function loadFileOpenAIKey() {
  try {
    const r = await fetch('/api/openai-key', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.enabled && j.key) {
      FILE_OPENAI_KEY = j.key;
      try { localStorage.setItem(KEY_API, j.key); } catch (_) {}
      /* If the settings modal is open, refresh the displayed value so the
         user sees the file-loaded key instead of whatever was there before. */
      const f = document.getElementById('apiKeyInput');
      if (f && !f.value) f.value = j.key;
    }
  } catch (_) { /* launcher unreachable — fall back to localStorage */ }
})();
function getEffectiveApiKey() {
  return FILE_OPENAI_KEY || localStorage.getItem(KEY_API);
}

/* ===== THEME — handled by wallpaper.js ===== */
(function () {
  var t = localStorage.getItem(THEME_KEY);
  if (t) document.documentElement.setAttribute('data-theme', t);
})();

/* ===== FULL SYLLABUS TREE (Subject → Unit → Chapter → Micro) ===== */
const SYLLABUS_TREE = {
  "Physics ⚛️": {
    "Mechanics": {
      "Physical quantities, vectors and scalars": ["Precision, accuracy, significant figures","Dimensional analysis","Vectors & scalars"],
      "Kinematics": ["Linear motion","Projectile motion","Motion with resistive force"],
      "Dynamics": ["Newton's laws","Force, impulse, momentum, torque","Work, energy & power","Collisions, friction"],
      "Rotational dynamics": ["Moment of inertia","Radius of gyration","Torque, work, energy"],
      "Fluid statics and dynamics": ["Pressure, surface tension","Capillary action","Newton, Stokes, Poiseuille, Bernoulli"],
      "Circular and Periodic motion": ["Horizontal & vertical circular motion","Centripetal force","SHM","Forced oscillations"],
      "Gravity": ["Gravitational force, acceleration","Field strength, potential, energy"],
      "Elasticity": ["Strain, stress","Moduli, Poisson ratio","Energy density"]
    },
    "Heat and thermodynamics": {
      "Thermal energy, heat & thermometers": ["Zeroth law, Stefan-Boltzmann","Liquid/resistance/radiation thermometers"],
      "Thermal expansion": ["Linear, cubical, superficial","Real vs apparent"],
      "Quantity of heat": ["Heat capacity","Specific heat","Latent heat","Triple point"],
      "Ideal gas": ["Kinetic theory","rms speed, energy"],
      "First law of thermodynamics": ["Adiabatic, isothermal","Isochoric, isobaric"],
      "Second law of thermodynamics": ["Heat engines","Refrigerator","Entropy"]
    },
    "Waves and optics": {
      "Wave motion": ["Progressive waves","Sound velocity in solid/liquid/gas"],
      "Stationary waves": ["Harmonics in pipes","Harmonics in strings"],
      "Acoustic phenomena": ["Intensity, loudness, pitch","Doppler effect"],
      "Reflection, refraction & dispersion": ["Curved mirrors","Lens refraction","Chromatic aberration, achromatism"],
      "Interference": ["Conditions","Young's double slit"],
      "Diffraction and polarization": ["Single slit, grating","Resolving power","Brewster's law"]
    },
    "Current electricity and magnetism": {
      "Electrical quantities": ["Ohm's law","Joule's law","emf, p.d., energy, power"],
      "Electrical circuits": ["Kirchhoff's laws","Wheatstone bridge","Potentiometer","Galvanometer"],
      "Thermoelectric effect": ["Seebeck & Peltier","Thermocouple"],
      "Alternating currents": ["Peak & rms AC","LRC circuits, Q-factor","Diode bridge rectification"],
      "Magnetic properties of materials": ["Permeability, hysteresis","Dia/para/ferromagnetic"],
      "Magnetic field": ["B-field around wire/coil/solenoid","Hall effect"],
      "Electromagnetic induction": ["Faraday's & Lenz's laws","AC generator, transformer","Self & mutual inductance"]
    },
    "Electrostatics and capacitors": {
      "Electric charge & field": ["Point charges","Electrostatic induction","Coulomb's law"],
      "Field strength, potential, energy": ["Gauss's law","Graphical analysis"],
      "Capacitors": ["Parallel plate","Combinations","Energy density","Dielectric effect"]
    },
    "Modern physics": {
      "Nuclear physics": ["Mass defect","Binding energy per nucleon","Mass-energy relation","Fusion & fission"],
      "Electron": ["Motion in E & B fields","Millikan oil drop","J.J. Thomson"],
      "Photon": ["Photo-electric effect","Threshold frequency"],
      "Wave particle duality": ["Bohr's hydrogen atom","Spectral series","De Broglie wave","Uncertainty principle","X-rays, Bragg's law"],
      "Radioactivity": ["Alpha, beta, gamma rays","Half-life, mean life","Carbon dating","Medical uses"],
      "Solid and semiconductor device": ["Energy bands","Intrinsic/extrinsic","p-n diode rectifier","Logic gates"],
      "Particle physics & recent trends": ["Leptons, quarks","Higgs boson","Big bang, Hubble law","Nanotechnology"]
    }
  },
  "Chemistry 🧪": {
    "Physical Chemistry": {
      "Basic concepts": ["Atoms, molecules, valency","Atomic & molecular mass","Empirical formula"],
      "Stoichiometry": ["Dalton's theory","Avogadro's law","Mole concept","Limiting reactant"],
      "Atomic Structure": ["Rutherford & Bohr models","Hydrogen spectrum","de-Broglie","Heisenberg","Quantum numbers","Aufbau, Pauli, Hund's"],
      "Classification & Periodicity": ["Modern periodic table","s/p/d/f blocks","Atomic & ionic size","IE, EN, EA"],
      "Chemical Bonding": ["Ionic, covalent, coordinate","Lewis structures","VSEPR","Hybridization, sigma/pi","Hydrogen bond, metallic, vdW"],
      "Redox Reaction": ["Oxidation number","Ion-electron method","Applications"],
      "States of Matter": ["Gas: kinetic theory, real vs ideal","Liquid: vapour pressure, viscosity","Solid: crystalline, Bravais lattices"],
      "Chemical Equilibrium": ["Law of mass action","Kp, Kc","Reaction quotient","Le Chatelier"],
      "Volumetric Analysis": ["Equivalent weight","Normality, molarity, ppm","Standards","Normality equation"],
      "Ionic Equilibrium": ["Arrhenius, Brønsted, Lewis acids/bases","Ostwald's law","pH, pOH, Ksp","Buffer, hydrolysis"],
      "Chemical Kinetics": ["Rate, order, molecularity","Zero & first order half-life","Collision theory","Catalysis"],
      "Electrochemistry": ["Electrolysis","SHE, calomel electrode","Electrochemical series","Galvanic cell, fuel cell"],
      "Chemical Thermodynamics": ["1st law, enthalpy types","Hess's law","Entropy, 2nd law","Gibbs free energy"],
      "Nuclear Chemistry": ["Radioactivity","Nuclear reaction types","Radio-carbon dating"]
    },
    "Inorganic Chemistry": {
      "Chemistry of Non-metals": ["Hydrogen, isotopes, heavy water","Ozone, depletion","Ammonia, phosphine, HNO3","Halogens, HX acids","Carbon allotropes, CO","H2S, SO2, H2SO4"],
      "Chemistry of Metals": ["Metallurgy principles","Ores, gangue, flux, slag","Alkali & alkaline earth metals","3d transition metals","Complex shapes, CFT","Cu, Zn, Hg, Ag, Fe","Steel manufacture","Corrosion"],
      "Bio-inorganic Chemistry": ["Micro/macro nutrients","Bio role of metal ions","Na-K & Na-glucose pump","Heavy metal toxicity"]
    },
    "Organic Chemistry": {
      "General Organic Chemistry": ["Tetra-covalency, catenation","Functional groups","IUPAC nomenclature","Isomerism","Electrophile, nucleophile","Inductive & resonance effects"],
      "Hydrocarbons": ["Cracking, pyrolysis","Octane number","Alkane, alkene, alkyne preparation","Ethane properties","Alkene addition","Alkyne acidity"],
      "Aromatic Hydrocarbons": ["Aromaticity","Resonance","Benzene preparation & properties"],
      "Haloalkanes & Haloarenes": ["Monohaloalkane preparation","SN1 & SN2","Chloroform, chlorobenzene"],
      "Alcohols & Phenols": ["Monohydric alcohols","Oxo-process, hydroboration","Fermentation, ethanol types","Phenol properties"],
      "Ethers": ["Williamson's synthesis","Diethyl ether"],
      "Aldehydes & Ketones": ["Aliphatic carbonyls","Benzaldehyde"],
      "Carboxylic Acid & Derivatives": ["Monocarboxylic acids","Acid halide, anhydride, amide, ester","Relative reactivity"],
      "Nitro-compounds": ["Nitroalkanes","Nitrobenzene"],
      "Amines": ["Primary amine preparation","Basicity","Hoffmann's method","Aniline"],
      "Organometallic Compounds": ["Organo-Li/Cu/Cd","Metal-carbon bonding","Grignard's reagent"]
    },
    "Applied Chemistry": {
      "Manufacturing Processes": ["Ostwald, Haber, Contact","Diaphragm cell, Solvay","Ammonium carbamate (urea)","Cement, paper, pulp"],
      "Applications of compounds": ["Non-metals & oxides","Sodium, calcium, magnesium compounds","Copper, zinc, mercury, iron compounds","Organic compounds in industry"],
      "Chemistry in Service to Mankind": ["Polymer, dyes, drugs","Pesticides, fertilizer","Colloid, osmotic pressure, buffer","Radioisotopes in medicine"]
    },
    "Analytical Chemistry": {
      "Chemical Tests": ["Acid/basic radicals","Functional groups","Lassaigne's test","Biomolecule tests"],
      "Separation Techniques": ["Filtration, sublimation, evaporation","Crystallization","Distillation","Paper chromatography","Atmolysis"],
      "Types of Titration": ["Acid-base","Permanganometric, iodometric","Complexometric","Indicators"]
    }
  },
  "Zoology 🦋": {
    "Evolutionary Biology": {
      "Origin of life": ["Oparin-Haldane theory","Miller-Urey experiment"],
      "Evidences of evolution": ["Morphological","Anatomical","Paleontological","Embryological","Biochemical"],
      "Theories": ["Lamarckism","Darwinism","Neo-Darwinism"],
      "Human evolution": ["From Ramapithecus to modern man"]
    },
    "Animal Diversity & Classification": {
      "Protozoa to Chordata": ["Diagnostic features","Classification scheme"]
    },
    "Animal Tissues & Histology": {
      "Epithelial tissue": ["Structure, location, function"],
      "Connective tissue": ["Blood, bone, cartilage"],
      "Muscular tissue": ["Skeletal, smooth, cardiac"],
      "Nervous tissue": ["Neurons, neuroglia"]
    },
    "Study of Selected Animals": {
      "Plasmodium": ["Habitat, structure","Life cycle","Malaria types"],
      "Earthworm (Pheretima)": ["Morphology","Body systems & physiology","Economic importance"],
      "Frog (Rana)": ["External morphology","Body systems & physiology"]
    },
    "Human Biology & Physiology": {
      "Digestive System": ["Alimentary canal, glands","Physiology of digestion"],
      "Respiratory System": ["Organs, gas exchange","Regulation","Disorders"],
      "Circulatory System": ["Heart, cardiac cycle","Blood groups, BP","CVDs"],
      "Excretory System": ["Kidney, urine formation","Renal disorders"],
      "Nervous System": ["CNS, PNS, autonomic","Nerve impulse"],
      "Sense Organs": ["Eye","Ear"],
      "Endocrinology": ["Glands, hormones","Endocrine disorders"],
      "Reproductive System": ["Male & female organs","Gametogenesis","Ovarian & menstrual cycle"]
    },
    "Microbial Diseases & Immunology": {
      "Diseases": ["Typhoid, TB, HIV","Cholera, Influenza","Hepatitis, Candidiasis"],
      "Immunity": ["Innate & acquired","Antigens & antibodies"],
      "Vaccines": ["Live attenuated","Inactivated","Toxoid"]
    },
    "Medical Technology & Applied Biology": {
      "Medical technology": ["Transplantation","IVF, Amniocentesis","Transgenic animals"],
      "Applied microbiology": ["Dairy/beverage microbes","Sewage treatment","Bio-control agents"]
    },
    "Biota, Environment & Conservation": {
      "Animal Behavior": ["Reflexes","Taxis","Migration"],
      "Environmental pollution": ["Air, water, soil","Pesticides"],
      "Adaptations": ["Aquatic","Terrestrial","Volant"],
      "Conservation Biology": ["Protected areas","Hotspots, Ramsar","IUCN categories","Endangered species of Nepal"]
    }
  },
  "Botany 🌿": {
    "Basic Components of Life": {
      "Carbohydrates, lipids, minerals": ["Structure & types","Biological role"],
      "Proteins & enzymes": ["Structure & types","Biological role"]
    },
    "Biodiversity": {
      "Classification systems": ["2-Kingdom","5-Kingdom","3 Domain","Binomial nomenclature"],
      "Monera & Virus": ["Bacterial cell","Cyanobacteria","Virus structure & types"],
      "Fungi & Lichens": ["Phycomycetes-Deuteromycetes","Yeast & Mucor","Lichen types"],
      "Algae": ["Chlorophyceae, Rhodophyceae, Phaeophyceae","Spirogyra"],
      "Bryophytes": ["Hepatic/Anthocero/Bryopsida","Marchantia"],
      "Pteridophytes": ["Dryopteris structure & reproduction"],
      "Gymnosperms": ["Pinus structure & reproduction"],
      "Angiosperms": ["Morphology of root/stem/leaf/flower","Brassicaceae, Solanaceae","Fabaceae, Liliaceae","Floral formulae"],
      "Economic & Medicinal plants": ["Neem, Sarpagandha","Yarsagumba","Tulasi, Ginger"]
    },
    "Ecology & Vegetation": {
      "Ecosystem Ecology": ["Pond ecosystem","Forest ecosystem","Biotic interactions"],
      "Biogeochemical Cycles": ["Carbon, nitrogen cycle","Greenhouse, acid rain","Ozone depletion, climate change"],
      "Vegetation & adaptation": ["Forest types of Nepal","Biological invasion","Ecological succession","Hydrosere & Xerosere"]
    },
    "Cell Biology": {
      "Prokaryotic vs eukaryotic": ["Cell theory","Differences"],
      "Cell organelles": ["Cell wall, membrane","Mitochondria, chloroplast","ER, Golgi, lysosome","Ribosome, nucleus","Cilia, flagella, inclusions"],
      "Cell cycle & division": ["Amitosis, mitosis, meiosis","Significance"]
    },
    "Genetics": {
      "Genetic Material": ["DNA & RNA structure","DNA replication","Central dogma","Genetic code"],
      "Mendelian Genetics": ["Laws of inheritance","Incomplete dominance","Co-dominance"],
      "Linkage & crossing over": ["Complete & incomplete linkage","Significance of crossing over"],
      "Sex-linked Inheritance": ["Color blindness","Drosophila eye color"],
      "Mutation & Polyploidy": ["Gene/chromosomal mutations","Polyploidy types"],
      "Genetic disorders": ["Down's, Turner's","Klinefelter's, Edward's","Albinism, hemophilia"]
    },
    "Plant Anatomy": {
      "Plant tissues": ["Meristematic & permanent","Functions"],
      "Vascular bundles": ["Types"],
      "Monocot vs dicot anatomy": ["Root","Stem","Leaf"]
    },
    "Plant Physiology": {
      "Water Relations": ["Diffusion, DPD, osmosis","Plasmolysis, water potential","Transpiration, ascent of sap","Imbibition, guttation"],
      "Photosynthesis": ["Pigments","Photosystem I & II","Calvin-Benson (C3)","Hatch-Slack (C4)","Photorespiration","Bacterial photosynthesis"],
      "Respiration": ["Glycolysis","Oxidative decarboxylation","Krebs cycle","ETC & oxidative phosphorylation","Anaerobic respiration"],
      "Plant Growth": ["Auxin, gibberellin, cytokinin","Seed germination","Seed dormancy"]
    },
    "Developmental Botany": {
      "Asexual reproduction": ["Methods"],
      "Sporogenesis & gametogenesis": ["Microsporogenesis","Megasporogenesis"],
      "Pollination & fertilization": ["Types of pollination","Double fertilization"],
      "Embryo & endosperm": ["Monocot vs dicot embryo","Endosperm types"]
    },
    "Applied Botany": {
      "Plant tissue culture": ["Concept, types","Application"],
      "Genetic engineering": ["Concept, application"],
      "Agricultural applications": ["Biofertilizers, green manures","Plant breeding","Food safety"]
    }
  },
  "MAT 🧠": {
    "Verbal Reasoning": {
      "Topics": ["Analogies","Synonyms & antonyms","Odd one out","Coding & decoding","Direction sense","Blood relations"]
    },
    "Numerical Reasoning": {
      "Topics": ["Number system & series","Percentage, profit & loss","Ratio & proportion","Time, speed & distance","Time & work","Averages","Interest"]
    },
    "Logical Sequencing": {
      "Topics": ["Series completion","Statements & conclusions","Syllogisms","Seating arrangements","Puzzles"]
    },
    "Spatial / Abstract Reasoning": {
      "Topics": ["Figure series","Mirror & water images","Paper folding & cutting","Cubes & dice","Venn diagrams"]
    }
  }
};

const pickSubject = document.getElementById('pickSubject');
const pickUnit = document.getElementById('pickUnit');
const pickChapter = document.getElementById('pickChapter');
const pickMicro = document.getElementById('pickMicro');
const clearTopicBtn = document.getElementById('clearTopic');

// populate subject
Object.keys(SYLLABUS_TREE).forEach(s => {
  const o = document.createElement('option');
  o.value = s; o.textContent = s;
  pickSubject.appendChild(o);
});

function resetPicker(level) {
  if (level <= 1) { pickUnit.innerHTML = '<option value="">📖 Unit…</option>'; pickUnit.disabled = true; }
  if (level <= 2) { pickChapter.innerHTML = '<option value="">🔖 Sub-topic…</option>'; pickChapter.disabled = true; }
  if (level <= 3) { pickMicro.innerHTML = '<option value="">🎯 Micro-topic…</option>'; pickMicro.disabled = true; }
}

pickSubject.addEventListener('change', () => {
  resetPicker(1);
  const s = pickSubject.value;
  if (!s) return;
  const units = SYLLABUS_TREE[s];
  Object.keys(units).forEach(u => {
    const o = document.createElement('option');
    o.value = u; o.textContent = u;
    pickUnit.appendChild(o);
  });
  pickUnit.disabled = false;
});

pickUnit.addEventListener('change', () => {
  resetPicker(2);
  const s = pickSubject.value, u = pickUnit.value;
  if (!s || !u) return;
  const chapters = SYLLABUS_TREE[s][u];
  Object.keys(chapters).forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    pickChapter.appendChild(o);
  });
  pickChapter.disabled = false;
});

pickChapter.addEventListener('change', () => {
  resetPicker(3);
  const s = pickSubject.value, u = pickUnit.value, c = pickChapter.value;
  if (!s || !u || !c) return;
  const micros = SYLLABUS_TREE[s][u][c] || [];
  micros.forEach(m => {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    pickMicro.appendChild(o);
  });
  pickMicro.disabled = micros.length === 0;
});

clearTopicBtn.addEventListener('click', () => {
  pickSubject.value = '';
  resetPicker(1);
});

function getSelectedTopic() {
  const parts = [pickSubject.value, pickUnit.value, pickChapter.value, pickMicro.value].filter(Boolean);
  return parts.length ? parts.join(' → ') : '';
}

/* ===== SUGGESTIONS ===== */
const SUGGESTIONS = [
  { t: "Explain photosynthesis", q: "Explain photosynthesis like I'm preparing for MECEE-BL. Cover Photosystem I & II, Calvin-Benson cycle, and Hatch-Slack pathway." },
  { t: "How to study Genetics", q: "How should I study Genetics for MECEE-BL? What are the most-asked sub-topics and what's the best memorization strategy?" },
  { t: "Bohr's model + de Broglie", q: "Walk me through Bohr's hydrogen atom model, spectral series, and how de Broglie waves connect. Give me 3 MCQ-style practice questions." },
  { t: "Le Chatelier's principle", q: "Teach me Le Chatelier's principle with 4 real exam-style applications and tricks examiners use." },
  { t: "Frog circulatory system", q: "Quick deep-dive on the frog circulatory system — heart chambers, double circulation differences from humans, common MCQ traps." },
  { t: "MAT — coding/decoding tricks", q: "Show me the fastest pattern-recognition tricks for coding-decoding MAT questions." }
];
const sugBox = document.getElementById('suggestions');
SUGGESTIONS.forEach(s => {
  const b = document.createElement('button');
  b.className = 'suggestion';
  b.innerHTML = `<b>${s.t}</b><span>${s.q.slice(0, 70)}…</span>`;
  b.addEventListener('click', () => {
    document.getElementById('input').value = s.q;
    sendMessage();
  });
  sugBox.appendChild(b);
});

/* ===== CHATS MANAGEMENT ===== */
function saveChats() {
  /* Diff against the previous persisted chat ids so sync stamps reflect
     additions / updates / deletions in one place. */
  let prevIds = new Set();
  try {
    const prev = JSON.parse(localStorage.getItem(KEY_CHATS) || '[]');
    if (Array.isArray(prev)) prev.forEach(c => c && c.id && prevIds.add(c.id));
  } catch (_) {}
  localStorage.setItem(KEY_CHATS, JSON.stringify(chats));
  localStorage.setItem(KEY_ACTIVE, activeChatId || "");
  try {
    if (window.MeceeSync) {
      const newIds = new Set(chats.map(c => c && c.id).filter(Boolean));
      newIds.forEach(id => MeceeSync.stamp('chats', id, 'updated'));
      prevIds.forEach(id => { if (!newIds.has(id)) MeceeSync.stamp('chats', id, 'deleted'); });
    }
  } catch (_) {}
  renderChatList();
}

/* When the shell's AI queue (queue.js) finishes a question, it writes a new
   chat to localStorage. The `storage` event fires here (we're a different
   window than the shell) so we can pick it up live without reloading. */
window.addEventListener('storage', (e) => {
  if (e.key === KEY_CHATS) {
    try { chats = JSON.parse(e.newValue || "[]") || []; } catch (_) { chats = []; }
    renderChatList();
    /* If the just-added chat is now active, render its messages. */
    const newActive = localStorage.getItem(KEY_ACTIVE);
    if (newActive && newActive !== activeChatId) {
      activeChatId = newActive;
      renderMessages();
    }
  } else if (e.key === KEY_ACTIVE && e.newValue && e.newValue !== activeChatId) {
    activeChatId = e.newValue;
    renderMessages();
  }
});

function newChat() {
  const id = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
  const chat = { id, title: "New chat", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  chats.unshift(chat);
  activeChatId = id;
  saveChats();
  renderMessages();
}

function deleteChat(id) {
  if (!confirm("Delete this chat?")) return;
  chats = chats.filter(c => c.id !== id);
  if (activeChatId === id) activeChatId = chats[0]?.id || null;
  saveChats();
  renderMessages();
}

function selectChat(id) {
  activeChatId = id;
  saveChats();
  renderMessages();
  if (window.innerWidth <= 700) document.getElementById('sidebar').classList.remove('open');
}

function getActiveChat() {
  return chats.find(c => c.id === activeChatId);
}

function renderChatList() {
  const list = document.getElementById('chatList');
  if (!chats.length) {
    list.innerHTML = '<div class="chat-list-empty">No chats yet. Start a new one!</div>';
    return;
  }
  list.innerHTML = chats.map(c => `
    <div class="chat-item ${c.id === activeChatId ? 'active' : ''}" data-id="${c.id}">
      <span class="title">${escapeHtml(c.title)}</span>
      <button class="del" data-id="${c.id}" title="Delete">🗑️</button>
    </div>
  `).join('');
  list.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.del')) return;
      selectChat(el.dataset.id);
    });
  });
  list.querySelectorAll('.del').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); deleteChat(el.dataset.id); });
  });
}

/* ===== MESSAGES ===== */
function renderMessages() {
  const box = document.getElementById('messages');
  const chat = getActiveChat();
  const welcome = document.getElementById('welcome');

  if (!chat || chat.messages.length === 0) {
    welcome.style.display = 'block';
    [...box.querySelectorAll('.messages-inner')].forEach(el => el.remove());
    renderChatList();
    return;
  }

  welcome.style.display = 'none';
  let inner = box.querySelector('.messages-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'messages-inner';
    box.appendChild(inner);
  }
  inner.innerHTML = chat.messages.map(m => renderMsg(m)).join('');
  box.scrollTop = box.scrollHeight;
  renderChatList();
}

function renderMsg(m) {
  const isUser = m.role === 'user';
  const avatar = isUser ? '🧑‍🎓' : '🤖';
  const body = isUser ? escapeHtml(m.content) : mdToHtml(m.content);
  return `
    <div class="msg ${isUser ? 'user' : 'ai'}">
      <div class="avatar">${avatar}</div>
      <div class="bubble">${body}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// minimal markdown: **bold**, *italic*, `code`, lists, headings, paragraphs
function mdToHtml(text) {
  let t = escapeHtml(text);
  t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // unordered lists
  t = t.replace(/(?:^[-*] .+\n?)+/gm, m => {
    const items = m.trim().split('\n').map(line => `<li>${line.replace(/^[-*] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  // numbered lists
  t = t.replace(/(?:^\d+\. .+\n?)+/gm, m => {
    const items = m.trim().split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  // paragraphs
  t = t.split(/\n{2,}/).map(p => {
    if (/^<(h3|ul|ol|p|pre)/.test(p.trim())) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return t;
}

/* ===== STREAMING HELPER =====
   Async generator over OpenAI's Server-Sent Events response. Yields each
   token (delta) as it arrives. Throws on HTTP error so the caller's catch
   can surface the message. */
async function* streamChatCompletion({ apiKey, model, messages, temperature }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature, stream: true })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    /* SSE frames are separated by blank lines; each frame is one or more
       `field: value` lines. OpenAI uses single `data:` lines. */
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const obj = JSON.parse(data);
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch (_) { /* malformed chunk — skip */ }
    }
  }
}

/* ===== SEND ===== */
async function sendMessage() {
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const apiKey = getEffectiveApiKey();
  const model = localStorage.getItem(KEY_MODEL) || 'gpt-4o-mini';
  const sysPrompt = localStorage.getItem(KEY_PROMPT) || DEFAULT_PROMPT;

  if (!apiKey) {
    openSettings();
    alert("No OpenAI API key found.\n\nEither put your key in .mecee-secrets/OPENAIAPI.txt (one line, starts with sk-…) and refresh, or paste it here in the settings modal.");
    return;
  }

  let userText = inputEl.value.trim();
  if (!userText) return;

  const topic = getSelectedTopic();
  if (topic) userText = `[Topic: ${topic}]\n\n${userText}`;
  // reset pickers
  pickSubject.value = '';
  resetPicker(1);
  inputEl.value = '';
  inputEl.style.height = 'auto';

  if (!getActiveChat()) newChat();
  const chat = getActiveChat();
  chat.messages.push({ role: 'user', content: userText });
  if (chat.title === "New chat") {
    chat.title = userText.replace(/^\[Topic:[^\]]+\]\s*/, '').slice(0, 40);
  }
  chat.updatedAt = Date.now();
  saveChats();
  renderMessages();

  // typing indicator — replaced by the real bubble on the first chunk
  const inner = document.querySelector('.messages-inner');
  const typingEl = document.createElement('div');
  typingEl.className = 'msg ai';
  typingEl.innerHTML = `<div class="avatar">🤖</div><div class="bubble typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
  inner.appendChild(typingEl);
  const msgBox = document.getElementById('messages');
  msgBox.scrollTop = msgBox.scrollHeight;
  sendBtn.disabled = true;

  /* Build the request payload BEFORE we push the empty assistant message,
     otherwise the API sees a trailing empty turn. */
  const apiMessages = [
    { role: 'system', content: sysPrompt },
    ...chat.messages.map(m => ({ role: m.role, content: m.content }))
  ];

  const aiMsg = { role: 'assistant', content: '' };
  let firstChunk = true;
  let bubbleEl = null;

  try {
    for await (const chunk of streamChatCompletion({ apiKey, model, messages: apiMessages, temperature: 0.6 })) {
      if (firstChunk) {
        firstChunk = false;
        /* Replace the dots with a real bubble — we then mutate that bubble
           directly on each chunk instead of re-rendering the whole list,
           which keeps the stream snappy. */
        typingEl.remove();
        chat.messages.push(aiMsg);
        renderMessages();
        bubbleEl = inner.querySelector('.msg.ai:last-child .bubble');
      }
      aiMsg.content += chunk;
      if (bubbleEl) bubbleEl.innerHTML = mdToHtml(aiMsg.content);
      /* Only auto-scroll if the user is already near the bottom — otherwise
         we'd hijack their manual scroll-up to read earlier replies. */
      const nearBottom = msgBox.scrollHeight - msgBox.scrollTop - msgBox.clientHeight < 80;
      if (nearBottom) msgBox.scrollTop = msgBox.scrollHeight;
    }
    if (firstChunk) {
      /* Stream closed without any tokens. */
      typingEl.remove();
      aiMsg.content = '(no reply)';
      chat.messages.push(aiMsg);
      renderMessages();
    }
    chat.updatedAt = Date.now();
    saveChats();
  } catch (e) {
    if (firstChunk) {
      typingEl.remove();
      chat.messages.push(aiMsg);
    }
    aiMsg.content = `⚠️ Error: ${e.message}\n\nCheck your API key (⚙️ Settings) and internet connection.`;
    chat.updatedAt = Date.now();
    saveChats();
    renderMessages();
  } finally {
    sendBtn.disabled = false;
  }
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
const inp = document.getElementById('input');
inp.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
inp.addEventListener('input', () => {
  inp.style.height = 'auto';
  inp.style.height = Math.min(200, inp.scrollHeight) + 'px';
});
document.getElementById('newChatBtn').addEventListener('click', () => {
  activeChatId = null;
  renderMessages();
});

/* ===== SETTINGS ===== */
const modal = document.getElementById('settingsModal');
function openSettings() {
  /* Prefer the file-loaded key — what the user sees in the modal matches
     what the request actually uses. They can still type a different value
     to override for this browser only (saved to localStorage). */
  document.getElementById('apiKeyInput').value = getEffectiveApiKey() || '';
  document.getElementById('modelSelect').value = localStorage.getItem(KEY_MODEL) || 'gpt-4o-mini';
  document.getElementById('systemPromptInput').value = localStorage.getItem(KEY_PROMPT) || DEFAULT_PROMPT;
  modal.classList.add('show');
}
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('cancelSettings').addEventListener('click', () => modal.classList.remove('show'));
document.getElementById('saveSettings').addEventListener('click', () => {
  const k = document.getElementById('apiKeyInput').value.trim();
  const m = document.getElementById('modelSelect').value;
  const p = document.getElementById('systemPromptInput').value.trim() || DEFAULT_PROMPT;
  if (k) localStorage.setItem(KEY_API, k);
  localStorage.setItem(KEY_MODEL, m);
  localStorage.setItem(KEY_PROMPT, p);
  /* Mark settings as updated so the next sync pushes them to R2. The
     'chat_settings' category stores everything under a single 'self' item;
     stamping 'self' updates the timestamp the sync engine reads. */
  if (window.MeceeSync && window.MeceeSync.stamp) {
    window.MeceeSync.stamp('chat_settings', 'self', 'updated');
  }
  modal.classList.remove('show');
});

/* ===== MOBILE MENU ===== */
document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ===== INIT ===== */
if (!localStorage.getItem(KEY_API)) {
  setTimeout(() => {
    openSettings();
  }, 300);
}
if (activeChatId && !getActiveChat()) activeChatId = null;
renderMessages();
