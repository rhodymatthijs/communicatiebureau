// State
const state = {
  apiKey: "",
  openaiKey: "",
  logoUrl: null,
  documents: [],
  revisionRound: 0,
  userFeedback: "",
  variantMode: false,
  currentStep: 1,
  results: { plan: "", teksten: "", visuals: "", revision: "", stakeholders: {}, images: [] },
  calendarEvents: {},
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
};

// DOM refs
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ========================
// Template Management
// ========================
function loadTemplateList() {
  const select = $("#templateSelect");
  select.innerHTML = '<option value="">-- Kies template --</option>';
  const templates = JSON.parse(localStorage.getItem("cb-templates") || "{}");
  for (const name of Object.keys(templates)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
}

function saveTemplate() {
  const name = $("#organisatie").value.trim();
  if (!name) return alert("Vul eerst een organisatienaam in");

  const templates = JSON.parse(localStorage.getItem("cb-templates") || "{}");
  templates[name] = {
    organisatie: name,
    primair: $("#colorPrimary").value,
    secundair: $("#colorSecondary").value,
    font: $("#font").value.trim(),
    toneOfVoice: $("#toneOfVoice").value,
    logoUrl: state.logoUrl,
  };
  localStorage.setItem("cb-templates", JSON.stringify(templates));
  loadTemplateList();
  $("#templateSelect").value = name;
}

function loadTemplate(name) {
  if (!name) return;
  const templates = JSON.parse(localStorage.getItem("cb-templates") || "{}");
  const t = templates[name];
  if (!t) return;

  $("#organisatie").value = t.organisatie || "";
  $("#colorPrimary").value = t.primair || "#1a365d";
  $("#colorSecondary").value = t.secundair || "#e53e3e";
  $("#font").value = t.font || "";
  $("#toneOfVoice").value = t.toneOfVoice || "professioneel en warm";

  if (t.logoUrl) {
    state.logoUrl = t.logoUrl;
    $("#logoPreview").innerHTML = `<img src="${t.logoUrl}" alt="Logo">`;
  }
}

function deleteTemplate() {
  const name = $("#templateSelect").value;
  if (!name) return;
  if (!confirm(`Template "${name}" verwijderen?`)) return;

  const templates = JSON.parse(localStorage.getItem("cb-templates") || "{}");
  delete templates[name];
  localStorage.setItem("cb-templates", JSON.stringify(templates));
  loadTemplateList();
}

// Init templates on load
loadTemplateList();

// ========================
// Logo Upload
// ========================
$("#logoUpload").addEventListener("click", () => $("#logoFile").click());
$("#logoFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("logo", file);

  let imageUrl;
  try {
    const res = await fetch("/api/upload-logo", { method: "POST", body: formData });
    const data = await res.json();
    imageUrl = data.url;
  } catch {
    imageUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
  }

  state.logoUrl = imageUrl;
  $("#logoPreview").innerHTML = `<img src="${imageUrl}" alt="Logo">`;

  // Extract dominant colors from logo
  extractColorsFromImage(imageUrl);
});

function extractColorsFromImage(src) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const size = 100;
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);

    const data = ctx.getImageData(0, 0, size, size).data;
    const colorBuckets = {};

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = max / 255;

      if (saturation < 0.15) continue;
      if (brightness < 0.1) continue;
      if (brightness > 0.95 && saturation < 0.2) continue;

      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const key = `${qr},${qg},${qb}`;

      colorBuckets[key] = (colorBuckets[key] || 0) + 1;
    }

    const sorted = Object.entries(colorBuckets).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return;

    const primary = sorted[0][0].split(",").map(Number);
    const primaryHex = rgbToHex(primary[0], primary[1], primary[2]);
    $("#colorPrimary").value = primaryHex;

    if (sorted.length > 1) {
      for (let i = 1; i < sorted.length; i++) {
        const c = sorted[i][0].split(",").map(Number);
        const dist = Math.sqrt(
          (primary[0]-c[0])**2 + (primary[1]-c[1])**2 + (primary[2]-c[2])**2
        );
        if (dist > 60) {
          $("#colorSecondary").value = rgbToHex(c[0], c[1], c[2]);
          break;
        }
      }
    }
  };
  img.src = src;
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v =>
    Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0")
  ).join("");
}

// ========================
// Progress Bar
// ========================
function updateProgressBar(activeStep) {
  state.currentStep = activeStep;
  const steps = $$(".progress-step");
  const lines = $$(".progress-line");

  steps.forEach((step) => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.remove("active", "completed");
    if (stepNum === activeStep) step.classList.add("active");
    else if (stepNum < activeStep) step.classList.add("completed");
  });

  lines.forEach((line) => {
    const lineNum = parseInt(line.dataset.line);
    line.classList.toggle("completed", lineNum < activeStep);
  });
}

// ========================
// Readability Check (Flesch-Douma for Dutch)
// ========================
function countSyllablesDutch(word) {
  word = word.toLowerCase().replace(/[^a-zàáâãäåèéêëìíîïòóôõöùúûüý]/g, "");
  if (word.length <= 2) return 1;

  // Dutch diphthongs and digraphs count as single vowels
  word = word.replace(/oe|ou|ei|ij|ui|au|eu|ie|oo|ee|uu|aa/g, "a");

  let count = 0;
  let prevVowel = false;
  for (const ch of word) {
    const isVowel = "aeiouy".includes(ch);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  return Math.max(1, count);
}

function calculateReadability(text) {
  // Clean text
  const clean = text.replace(/[#*_\[\]()]/g, "").trim();
  if (!clean) return null;

  // Split into sentences
  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 3);
  if (sentences.length === 0) return null;

  // Split into words
  const words = clean.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return null;

  // Count syllables
  const totalSyllables = words.reduce((sum, w) => sum + countSyllablesDutch(w), 0);

  // Flesch-Douma formula (Dutch adaptation)
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;
  const score = 206.835 - (0.93 * avgSentenceLength) - (77 * avgSyllablesPerWord);

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    words: words.length,
    sentences: sentences.length,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
  };
}

function getReadabilityLabel(score) {
  if (score >= 70) return { label: "B1 — Goed leesbaar", level: "easy" };
  if (score >= 50) return { label: "B2 — Redelijk leesbaar", level: "medium" };
  return { label: "C1+ — Moeilijk leesbaar", level: "hard" };
}

// ========================
// Channel Character Limits
// ========================
const CHANNEL_LIMITS = {
  "X (Twitter)": 280,
  "Instagram": 2200,
  "LinkedIn": 3000,
  "Facebook": 500, // recommended
  "TikTok": 2200,
  "Poster/flyer": 300,
};

// ========================
// Auto-save
// ========================
let autosaveTimeout = null;

function triggerAutosave() {
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(() => {
    const saveData = {
      timestamp: Date.now(),
      currentStep: state.currentStep,
      results: state.results,
      calendarEvents: state.calendarEvents,
      revisionRound: state.revisionRound,
      variantMode: state.variantMode,
      logoUrl: state.logoUrl,
      form: {
        titel: $("#casusTitel")?.value || "",
        beschrijving: $("#casusBeschrijving")?.value || "",
        context: $("#casusContext")?.value || "",
        links: $("#casusLinks")?.value || "",
        urgentie: $("#casusUrgentie")?.value || "",
        organisatie: $("#organisatie")?.value || "",
        primair: $("#colorPrimary")?.value || "#1a365d",
        secundair: $("#colorSecondary")?.value || "#e53e3e",
        font: $("#font")?.value || "",
        toneOfVoice: $("#toneOfVoice")?.value || "",
        doelgroepen: $$('.checkbox-inline .checkbox input:checked').map(cb => cb.value),
        kanalen: $$('.channel-grid .checkbox input:checked').map(cb => cb.value),
        stakeholders: $$('input[name="stakeholder"]:checked').map(cb => cb.value),
      },
    };
    localStorage.setItem("cb-autosave", JSON.stringify(saveData));
    showAutosaveIndicator();
  }, 2000);
}

function showAutosaveIndicator() {
  const el = $("#autosaveIndicator");
  if (!el) return;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2000);
}

function checkAutosave() {
  const saved = localStorage.getItem("cb-autosave");
  if (!saved) return;

  try {
    const data = JSON.parse(saved);
    // Only show if less than 24 hours old and has actual results
    const age = Date.now() - data.timestamp;
    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem("cb-autosave");
      return;
    }
    if (!data.results?.plan) return;

    const banner = $("#autosaveBanner");
    if (banner) banner.classList.remove("hidden");
  } catch {
    localStorage.removeItem("cb-autosave");
  }
}

function restoreAutosave() {
  const saved = localStorage.getItem("cb-autosave");
  if (!saved) return;

  try {
    const data = JSON.parse(saved);

    // Restore form
    if (data.form) {
      if (data.form.titel) $("#casusTitel").value = data.form.titel;
      if (data.form.beschrijving) $("#casusBeschrijving").value = data.form.beschrijving;
      if (data.form.context) $("#casusContext").value = data.form.context;
      if (data.form.links) $("#casusLinks").value = data.form.links;
      if (data.form.urgentie) $("#casusUrgentie").value = data.form.urgentie;
      if (data.form.organisatie) $("#organisatie").value = data.form.organisatie;
      if (data.form.primair) $("#colorPrimary").value = data.form.primair;
      if (data.form.secundair) $("#colorSecondary").value = data.form.secundair;
      if (data.form.font) $("#font").value = data.form.font;
      if (data.form.toneOfVoice) $("#toneOfVoice").value = data.form.toneOfVoice;

      $$('.checkbox-inline .checkbox input').forEach(cb => {
        cb.checked = data.form.doelgroepen?.includes(cb.value) || false;
      });
      $$('.channel-grid .checkbox input').forEach(cb => {
        cb.checked = data.form.kanalen?.includes(cb.value) || false;
      });
      $$('input[name="stakeholder"]').forEach(cb => {
        cb.checked = data.form.stakeholders?.includes(cb.value) || false;
      });
    }

    // Restore state
    state.results = data.results || state.results;
    state.calendarEvents = data.calendarEvents || {};
    state.revisionRound = data.revisionRound || 0;
    state.variantMode = data.variantMode || false;
    state.logoUrl = data.logoUrl || null;

    if (state.logoUrl) {
      $("#logoPreview").innerHTML = `<img src="${state.logoUrl}" alt="Logo">`;
    }

    if ($("#variantMode")) {
      $("#variantMode").checked = state.variantMode;
    }

    // Show war room with results
    if (state.results.plan) {
      $("#stepCasus").classList.add("hidden");
      $("#stepWarRoom").classList.remove("hidden");
      $("#casusTitle").textContent = data.form?.titel || "";
      updateProgressBar(2);

      createStakeholderCards(data.form?.stakeholders || []);

      setAgentStatus("card-strategist", "done", "Klaar");
      setAgentOutput("card-strategist", mdToHtml(state.results.plan));

      if (state.results.teksten) {
        setAgentStatus("card-copywriter", "done", "Klaar");
        setAgentOutput("card-copywriter", mdToHtml(state.results.teksten));
      }
      if (state.results.visuals) {
        setAgentStatus("card-visualAdvisor", "done", "Klaar");
        setAgentOutput("card-visualAdvisor", mdToHtml(state.results.visuals));
      }
      for (const [id, review] of Object.entries(state.results.stakeholders)) {
        setAgentStatus(`card-stakeholder-${id}`, "done", "Klaar");
        setAgentOutput(`card-stakeholder-${id}`, mdToHtml(review));
      }
      if (state.results.revision) {
        $("#revisionArrow").classList.remove("hidden");
        $("#card-revision").classList.remove("hidden");
        setAgentStatus("card-revision", "done", `Ronde ${state.revisionRound} klaar`);
        setAgentOutput("card-revision", mdToHtml(state.results.revision));
      }

      $("#actionsBar").classList.remove("hidden");
      $("#userFeedbackSection").classList.remove("hidden");
    }

    // Hide banner
    $("#autosaveBanner").classList.add("hidden");
  } catch {
    localStorage.removeItem("cb-autosave");
  }
}

function dismissAutosave() {
  localStorage.removeItem("cb-autosave");
  $("#autosaveBanner").classList.add("hidden");
}

// Check for autosave on load
checkAutosave();

// ========================
// Form Data
// ========================
function getCasus() {
  const links = $("#casusLinks")?.value.trim();
  const docTexts = state.documents.map(d => `[Document: ${d.name}]\n${d.content}`).join("\n\n");

  return {
    titel: $("#casusTitel").value.trim(),
    beschrijving: $("#casusBeschrijving").value.trim(),
    context: $("#casusContext").value.trim(),
    links: links || "",
    documenten: docTexts || "",
    urgentie: $("#casusUrgentie").value.trim(),
    doelgroepen: $$(
      '.checkbox-inline .checkbox input:checked'
    ).map((cb) => cb.value),
    kanalen: $$(
      '.channel-grid .checkbox input:checked'
    ).map((cb) => cb.value),
  };
}

function getHuisstijl() {
  return {
    organisatie: $("#organisatie").value.trim(),
    primair: $("#colorPrimary").value,
    secundair: $("#colorSecondary").value,
    font: $("#font").value.trim(),
    toneOfVoice: $("#toneOfVoice").value,
    logoDescription: state.logoUrl ? "Logo is geupload" : "",
  };
}

function getSelectedStakeholders() {
  return $$('input[name="stakeholder"]:checked').map((cb) => cb.value);
}

// ========================
// Markdown to HTML
// ========================
function mdToHtml(md) {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/(<li>.*<\/li>)/s, (match) => `<ul>${match}</ul>`)
    .replace(/^---$/gm, "<hr>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

// ========================
// Agent Card UI
// ========================
function setAgentStatus(cardId, status, label) {
  const card = $(`#${cardId}`);
  if (!card) return;
  card.className = "agent-card";
  if (status !== "waiting") card.classList.add(status);

  const statusEl = card.querySelector(".agent-status");
  statusEl.className = `agent-status status-${status}`;
  statusEl.textContent = label;
}

function setAgentOutput(cardId, html) {
  const card = $(`#${cardId}`);
  if (!card) return;
  const output = card.querySelector(".agent-output");
  output.innerHTML = html;
  output.classList.add("visible");

  const existing = card.querySelector(".agent-toggle");
  if (!existing) {
    const toggle = document.createElement("button");
    toggle.className = "agent-toggle";
    toggle.textContent = "Inklappen";
    toggle.addEventListener("click", () => {
      const isVisible = output.classList.contains("visible");
      output.classList.toggle("visible");
      toggle.textContent = isVisible ? "Uitklappen" : "Inklappen";
    });
    card.querySelector(".agent-header").appendChild(toggle);
  }
}

// ========================
// API Calls
// ========================
async function runAgent(agentId, extras = {}) {
  const payload = {
    apiKey: state.apiKey,
    agentId,
    casus: getCasus(),
    huisstijl: getHuisstijl(),
    variantMode: state.variantMode && agentId === "copywriter",
    ...extras,
  };

  const res = await fetch("/api/run-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Agent fout");
  }
  return (await res.json()).result;
}

async function runStakeholder(stakeholderId) {
  const payload = {
    apiKey: state.apiKey,
    stakeholderId,
    casus: getCasus(),
    plan: state.results.plan,
    teksten: state.results.teksten,
  };

  const res = await fetch("/api/run-stakeholder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Stakeholder fout");
  }
  return (await res.json()).result;
}

async function runRevision() {
  const stakeholderNames = {
    ouder: "Ouder", leerling: "Leerling", docent: "Docent",
    directeur: "Directeur", rvt: "Raad van Toezicht",
  };

  const feedbackMap = {};
  for (const [id, text] of Object.entries(state.results.stakeholders)) {
    feedbackMap[stakeholderNames[id] || id] = text;
  }

  if (state.userFeedback.trim()) {
    feedbackMap["Opdrachtgever (Rhody)"] = state.userFeedback;
  }

  const payload = {
    apiKey: state.apiKey,
    casus: getCasus(),
    plan: state.results.plan,
    teksten: state.results.teksten,
    stakeholderFeedback: feedbackMap,
  };

  const res = await fetch("/api/run-revision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Revisie fout");
  }
  return (await res.json()).result;
}

async function generateImage(prompt) {
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      openaiKey: state.openaiKey,
      prompt,
      size: "1024x1024",
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Beeldgeneratie fout");
  }
  return await res.json();
}

// ========================
// Stakeholder Personas
// ========================
const STAKEHOLDER_PERSONAS = {
  ouder: {
    name: "Annemarie Kuiper",
    role: "43 jaar, twee kinderen op school, werkt parttime in de zorg, actief MR-lid",
    bio: "Leest elke brief twee keer. Wil weten wat het voor haar kinderen betekent.",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=AnnemarieKuiper22",
  },
  leerling: {
    name: "Thomas Jansen",
    role: "16 jaar, 4 havo, gamert graag, leest alleen z'n telefoon",
    bio: "Skipt alles wat langer is dan een Instagram-caption. Maar als het hem raakt, leest hij wel.",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=ThomasJansen4&top=shortRound&hairColor=2c1b18&facialHairProbability=0&skinColor=ffdbb4&clothing=hoodie&clothingColor=3b82f6&accessoriesProbability=0",
  },
  docent: {
    name: "Linda Peters",
    role: "47 jaar, docent Nederlands, sectievoorzitter, pragmatisch",
    bio: "Heeft al 200 veranderingen overleefd. Wil weten: wat moet ik morgen anders doen?",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=LindaPeters33",
  },
  directeur: {
    name: "Robert van der Helm",
    role: "54 jaar, rector, politiek bewust, denkt in scenario's",
    bio: "Vraagt altijd: en wat als dit in de krant komt? Weegt elk woord op een goudschaaltje.",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=RobertVanDerHelm8&top=shortWaved&hairColor=4a312c&facialHair=beardMedium&facialHairColor=4a312c&skinColor=ffdbb4&clothing=blazerAndShirt&clothingColor=64748b&accessoriesProbability=0",
  },
  rvt: {
    name: "Elisabeth Brouwer",
    role: "61 jaar, oud-bestuurder, governance-expert, scherp op risico's",
    bio: "Ziet dingen die anderen missen. Stelt de vragen die niemand durft te stellen.",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=ElisabethBrouwer44",
  },
};

function createStakeholderCards(stakeholders) {
  const grid = $("#stakeholderGrid");
  grid.innerHTML = "";

  const countEl = $("#stakeholderCount");
  if (countEl) countEl.textContent = stakeholders.length;

  stakeholders.forEach((id) => {
    const p = STAKEHOLDER_PERSONAS[id];
    if (!p) return;

    const card = document.createElement("div");
    card.className = "agent-card";
    card.id = `card-stakeholder-${id}`;
    card.innerHTML = `
      <div class="agent-header">
        <img class="avatar-img avatar-lg" src="${p.avatar}" alt="${p.name}">
        <div class="agent-identity">
          <span class="agent-name">${p.name}</span>
          <span class="agent-role">${p.role}</span>
        </div>
        <span class="agent-status status-waiting">Wacht...</span>
      </div>
      <div class="agent-bio">${p.bio}</div>
      <div class="agent-output"></div>
    `;
    grid.appendChild(card);
  });
}

// ========================
// Extract image prompts
// ========================
function extractImagePrompts(visualsText) {
  const prompts = [];
  const patterns = [
    /[Pp]rompt[^:]*:\s*["""]([^"""]+)["""]/g,
    /[Pp]rompt[^:]*:\s*`([^`]+)`/g,
    /[Pp]rompt[^:]*:\s*\*([^*]+)\*/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(visualsText)) !== null) {
      const prompt = match[1].trim();
      if (prompt.length > 20) prompts.push(prompt);
    }
  }

  if (prompts.length === 0) {
    const lines = visualsText.split("\n");
    for (const line of lines) {
      const cleaned = line.replace(/^[\s*-]+/, "").trim();
      if (
        cleaned.length > 30 &&
        /\b(photo|image|illustration|design|graphic|showing|depicting|with)\b/i.test(cleaned)
      ) {
        prompts.push(cleaned);
      }
    }
  }

  return prompts;
}

// ========================
// Image Generation Pipeline
// ========================
async function runImageGeneration() {
  const openaiInput = document.querySelector("#openaiKey");
  state.openaiKey = openaiInput ? openaiInput.value.trim() : "";
  if (!state.openaiKey && !state.serverHasOpenaiKey) return alert("Vul je OpenAI API key in voor beeldgeneratie");

  if (!state.results.visuals) return alert("Geen visueel advies beschikbaar");

  const prompts = extractImagePrompts(state.results.visuals);
  if (prompts.length === 0) return alert("Geen image prompts gevonden in het visueel advies");

  $("#imagesArrow").classList.remove("hidden");
  $("#card-images").classList.remove("hidden");
  setAgentStatus("card-images", "active", `0/${prompts.length} gereed`);

  const grid = $("#imageGrid");
  grid.innerHTML = "";

  prompts.forEach((prompt, i) => {
    const card = document.createElement("div");
    card.className = "image-card";
    card.id = `image-card-${i}`;
    card.innerHTML = `
      <div class="image-placeholder">Genereren...</div>
      <div class="image-caption">Visual ${i + 1}</div>
      <div class="image-prompt">${prompt.substring(0, 100)}...</div>
    `;
    grid.appendChild(card);
  });

  let completed = 0;
  for (let i = 0; i < prompts.length; i++) {
    if (i > 0) {
      for (let s = 65; s > 0; s--) {
        setAgentStatus("card-images", "active", `${completed}/${prompts.length} gereed — volgende over ${s}s`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    try {
      setAgentStatus("card-images", "active", `${completed}/${prompts.length} gereed — visual ${i + 1} genereren...`);
      const result = await generateImage(prompts[i]);
      const card = $(`#image-card-${i}`);
      const placeholder = card.querySelector(".image-placeholder");
      placeholder.outerHTML = `<img src="${result.url}" alt="Generated visual ${i + 1}">`;
      card.querySelector(".image-prompt").textContent = result.revised_prompt || prompts[i];

      state.results.images.push({ url: result.url, prompt: prompts[i] });
      completed++;
      setAgentStatus("card-images", "active", `${completed}/${prompts.length} gereed`);
    } catch (err) {
      const card = $(`#image-card-${i}`);
      const placeholder = card.querySelector(".image-placeholder");
      placeholder.textContent = `Fout: ${err.message}`;
      placeholder.style.color = "var(--error)";
      completed++;
    }
  }

  setAgentStatus("card-images", "done", `${completed} visuals`);
}

// ========================
// Revision Pipeline
// ========================
async function runRevisionPipeline() {
  const hasStakeholderFeedback = Object.keys(state.results.stakeholders).length > 0;
  const hasUserFeedback = state.userFeedback.trim().length > 0;

  if (!hasStakeholderFeedback && !hasUserFeedback) {
    return alert("Er is nog geen feedback om te verwerken. Geef eigen feedback of wacht op stakeholder-reviews.");
  }

  state.revisionRound++;

  $("#revisionArrow").classList.remove("hidden");
  $("#card-revision").classList.remove("hidden");

  const countEl = $("#revisionCount");
  if (countEl) countEl.textContent = state.revisionRound > 1 ? `#${state.revisionRound}` : "";

  try {
    setAgentStatus("card-revision", "active", `Revisieronde ${state.revisionRound}...`);
    const revision = await runRevision();
    state.results.revision = revision;
    state.results.teksten = revision;
    setAgentStatus("card-revision", "done", `Ronde ${state.revisionRound} klaar`);
    setAgentOutput("card-revision", mdToHtml(revision));

    const feedbackEl = $("#userFeedbackText");
    if (feedbackEl) feedbackEl.value = "";
    state.userFeedback = "";
    triggerAutosave();
  } catch (err) {
    setAgentStatus("card-revision", "error", "Fout");
    setAgentOutput("card-revision", `<p style="color:var(--error)">${err.message}</p>`);
  }
}

// ========================
// Main Pipeline
// ========================
async function runPipeline() {
  const apiKeyInput = document.querySelector("#apiKey");
  const openaiInput = document.querySelector("#openaiKey");
  state.apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
  state.openaiKey = openaiInput ? openaiInput.value.trim() : "";
  if (!state.apiKey && !state.serverHasAnthropicKey) return alert("Vul je Anthropic API key in");

  state.variantMode = $("#variantMode")?.checked || false;

  const casus = getCasus();
  if (!casus.beschrijving) return alert("Beschrijf de casus voordat je het bureau start");

  const stakeholders = getSelectedStakeholders();

  // Switch to war room
  $("#stepCasus").classList.add("hidden");
  $("#stepWarRoom").classList.remove("hidden");
  $("#casusTitle").textContent = casus.titel || "";
  updateProgressBar(2);

  createStakeholderCards(stakeholders);

  // Hide revision & images (reset)
  $("#revisionArrow").classList.add("hidden");
  $("#card-revision").classList.add("hidden");
  $("#imagesArrow").classList.add("hidden");
  $("#card-images").classList.add("hidden");

  // Step 1: Strategist
  try {
    setAgentStatus("card-strategist", "active", "Bezig...");
    const plan = await runAgent("strategist");
    state.results.plan = plan;
    setAgentStatus("card-strategist", "done", "Klaar");
    setAgentOutput("card-strategist", mdToHtml(plan));
    triggerAutosave();
  } catch (err) {
    setAgentStatus("card-strategist", "error", "Fout");
    setAgentOutput("card-strategist", `<p style="color:var(--error)">${err.message}</p>`);
    return;
  }

  // Step 2: Copywriter & Visual Advisor in parallel
  try {
    setAgentStatus("card-copywriter", "active", "Bezig...");
    setAgentStatus("card-visualAdvisor", "active", "Bezig...");

    const [teksten, visuals] = await Promise.all([
      runAgent("copywriter", { plan: state.results.plan }),
      runAgent("visualAdvisor", { plan: state.results.plan }),
    ]);

    state.results.teksten = teksten;
    state.results.visuals = visuals;

    setAgentStatus("card-copywriter", "done", "Klaar");
    setAgentOutput("card-copywriter", mdToHtml(teksten));

    setAgentStatus("card-visualAdvisor", "done", "Klaar");
    setAgentOutput("card-visualAdvisor", mdToHtml(visuals));
    triggerAutosave();
  } catch (err) {
    setAgentStatus("card-copywriter", "error", "Fout");
    setAgentStatus("card-visualAdvisor", "error", "Fout");
    setAgentOutput("card-copywriter", `<p style="color:var(--error)">${err.message}</p>`);
    return;
  }

  // Step 3: Stakeholder reviews in parallel
  if (stakeholders.length > 0) {
    await Promise.all(
      stakeholders.map(async (id) => {
        const cardId = `card-stakeholder-${id}`;
        try {
          setAgentStatus(cardId, "active", "Bezig...");
          const review = await runStakeholder(id);
          state.results.stakeholders[id] = review;
          setAgentStatus(cardId, "done", "Klaar");
          setAgentOutput(cardId, mdToHtml(review));
        } catch (err) {
          setAgentStatus(cardId, "error", "Fout");
          setAgentOutput(cardId, `<p style="color:var(--error)">${err.message}</p>`);
        }
      })
    );
  }

  // Show actions
  $("#actionsBar").classList.remove("hidden");
  $("#userFeedbackSection").classList.remove("hidden");
  triggerAutosave();
}

// ========================
// Export: Markdown
// ========================
function exportMarkdown() {
  const casus = getCasus();
  let output = `# Communicatiebureau AI — ${casus.titel || "Casus"}\n\n`;
  output += `**Organisatie:** ${getHuisstijl().organisatie || "Onbekend"}\n`;
  output += `**Datum:** ${new Date().toLocaleDateString("nl-NL")}\n\n`;
  output += `---\n\n## Casus\n${casus.beschrijving}\n\n`;

  if (state.results.plan)
    output += `---\n\n## Communicatieplan\n\n${state.results.plan}\n\n`;
  if (state.results.teksten)
    output += `---\n\n## Teksten\n\n${state.results.teksten}\n\n`;
  if (state.results.visuals)
    output += `---\n\n## Visueel advies\n\n${state.results.visuals}\n\n`;

  const stakeholderNames = {
    ouder: "Ouder", leerling: "Leerling", docent: "Docent",
    directeur: "Directeur", rvt: "Raad van Toezicht",
  };
  for (const [id, review] of Object.entries(state.results.stakeholders)) {
    output += `---\n\n## Review: ${stakeholderNames[id]}\n\n${review}\n\n`;
  }

  if (state.results.revision)
    output += `---\n\n## Herziene teksten\n\n${state.results.revision}\n\n`;

  // Calendar events
  if (Object.keys(state.calendarEvents).length > 0) {
    output += `---\n\n## Contentkalender\n\n`;
    const sorted = Object.entries(state.calendarEvents).sort(([a], [b]) => a.localeCompare(b));
    for (const [date, channels] of sorted) {
      output += `**${date}:** ${channels.join(", ")}\n`;
    }
    output += "\n";
  }

  const blob = new Blob([output], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `communicatieplan-${casus.titel?.replace(/\s+/g, "-").toLowerCase() || "export"}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========================
// Export: PDF
// ========================
function exportPdf() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) return alert("PDF library niet geladen");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const casus = getCasus();
  const huisstijl = getHuisstijl();
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = 20;

  function checkPage(needed = 20) {
    if (y + needed > 280) {
      doc.addPage();
      y = 20;
    }
  }

  function addTitle(text) {
    checkPage(15);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += 10;
  }

  function addSubtitle(text) {
    checkPage(12);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += 8;
  }

  function addBody(text) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/^[-*]\s/gm, "  - ");

    const lines = doc.splitTextToSize(clean, contentWidth);
    for (const line of lines) {
      checkPage(6);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 4;
  }

  function addSeparator() {
    checkPage(10);
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
  }

  // Header
  addTitle(`Communicatieplan: ${casus.titel || "Casus"}`);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Organisatie: ${huisstijl.organisatie || "\u2014"}`, margin, y);
  y += 5;
  doc.text(`Datum: ${new Date().toLocaleDateString("nl-NL")}`, margin, y);
  y += 10;
  addSeparator();

  addSubtitle("Casus");
  addBody(casus.beschrijving);
  addSeparator();

  if (state.results.plan) {
    addSubtitle("Communicatieplan");
    addBody(state.results.plan);
    addSeparator();
  }

  if (state.results.teksten) {
    addSubtitle("Teksten");
    addBody(state.results.teksten);
    addSeparator();
  }

  if (state.results.visuals) {
    addSubtitle("Visueel advies");
    addBody(state.results.visuals);
    addSeparator();
  }

  const stakeholderNames = {
    ouder: "Ouder", leerling: "Leerling", docent: "Docent",
    directeur: "Directeur", rvt: "Raad van Toezicht",
  };
  for (const [id, review] of Object.entries(state.results.stakeholders)) {
    addSubtitle(`Review: ${stakeholderNames[id]}`);
    addBody(review);
    addSeparator();
  }

  if (state.results.revision) {
    addSubtitle("Herziene teksten (na stakeholder feedback)");
    addBody(state.results.revision);
    addSeparator();
  }

  // Calendar
  if (Object.keys(state.calendarEvents).length > 0) {
    addSubtitle("Contentkalender");
    const sorted = Object.entries(state.calendarEvents).sort(([a], [b]) => a.localeCompare(b));
    const calText = sorted.map(([date, channels]) => `${date}: ${channels.join(", ")}`).join("\n");
    addBody(calText);
  }

  doc.save(`communicatieplan-${casus.titel?.replace(/\s+/g, "-").toLowerCase() || "export"}.pdf`);
}

// ========================
// Channel Icons
// ========================
const CHANNEL_ICONS = {
  "Website": { icon: "\uD83C\uDF10", type: "Digitaal" },
  "Intern communicatieportaal": { icon: "\uD83C\uDFE2", type: "Digitaal" },
  "Nieuwsbrief (e-mail)": { icon: "\uD83D\uDCE7", type: "Digitaal" },
  "Direct mailing": { icon: "\uD83D\uDCEC", type: "Digitaal" },
  "Facebook": { icon: "\uD83D\uDCD8", type: "Social media" },
  "Instagram": { icon: "\uD83D\uDCF7", type: "Social media" },
  "LinkedIn": { icon: "\uD83D\uDCBC", type: "Social media" },
  "X (Twitter)": { icon: "\uD83D\uDC26", type: "Social media" },
  "TikTok": { icon: "\uD83C\uDFB5", type: "Social media" },
  "Brief aan ouders": { icon: "\u2709\uFE0F", type: "Traditioneel" },
  "Persverklaring": { icon: "\uD83D\uDCF0", type: "Traditioneel" },
  "Interne memo": { icon: "\uD83D\uDCDD", type: "Traditioneel" },
  "Poster/flyer": { icon: "\uD83D\uDDBC\uFE0F", type: "Traditioneel" },
};

// ========================
// Parse channel blocks
// ========================
function parseChannelBlocks(text) {
  const blocks = [];
  const regex = /##\s*\[KANAAL:\s*([^\]]+)\]\s*\n([\s\S]*?)(?=##\s*\[KANAAL:|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const channelName = match[1].trim();
    const content = match[2].trim();
    if (content) {
      blocks.push({ channel: channelName, content });
    }
  }

  if (blocks.length === 0) {
    const fallbackRegex = /##\s+(.+?)\s*\n([\s\S]*?)(?=##\s+|$)/g;
    while ((match = fallbackRegex.exec(text)) !== null) {
      const channelName = match[1].trim().replace(/^\*\*|\*\*$/g, "");
      const content = match[2].trim();
      if (content && channelName.length < 60) {
        blocks.push({ channel: channelName, content });
      }
    }
  }

  return blocks;
}

// ========================
// Publicatieklaar UI
// ========================
function parseVariants(content) {
  const variantA = content.match(/###\s*Variant A\s*\n([\s\S]*?)(?=###\s*Variant B|$)/);
  const variantB = content.match(/###\s*Variant B\s*\n([\s\S]*?)$/);

  if (variantA && variantB) {
    return {
      a: variantA[1].trim(),
      b: variantB[1].trim(),
    };
  }
  return null;
}

function cleanContent(text) {
  return text
    .replace(/^\*Aanpassingen:.*$/gm, "")
    .replace(/###\s*Variant [AB]\s*\n?/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}

function formatCharCount(length, channel) {
  const limit = CHANNEL_LIMITS[channel];
  if (!limit) return `<span class="char-limit-ok">${length} tekens</span>`;
  if (length > limit) {
    return `<span class="char-limit-warning">${length} / ${limit} tekens (${length - limit} te veel)</span>`;
  }
  return `<span class="char-limit-ok">${length} / ${limit} tekens</span>`;
}

function showPublicatieklaar() {
  const sourceText = state.results.revision || state.results.teksten;
  if (!sourceText) return alert("Er zijn nog geen teksten gegenereerd");

  const blocks = parseChannelBlocks(sourceText);
  if (blocks.length === 0) return alert("Kon geen kanaalblokken herkennen in de output. Probeer de revisieronde eerst.");

  $("#stepWarRoom").classList.add("hidden");
  $("#stepPublicatie").classList.remove("hidden");
  updateProgressBar(3);

  const grid = $("#pubGrid");
  grid.innerHTML = "";

  blocks.forEach((block, i) => {
    const meta = CHANNEL_ICONS[block.channel] || { icon: "\uD83D\uDCC4", type: "Overig" };
    const variants = parseVariants(block.content);
    const mainContent = cleanContent(variants ? variants.a : block.content);
    const altContent = variants ? cleanContent(variants.b) : null;

    // Readability
    const readability = calculateReadability(mainContent);
    const readLabel = readability ? getReadabilityLabel(readability.score) : null;

    let variantTabsHtml = "";
    if (altContent) {
      variantTabsHtml = `
        <div class="variant-tabs">
          <button class="variant-tab active" data-variant="a" data-index="${i}">Variant A — Veilig</button>
          <button class="variant-tab" data-variant="b" data-index="${i}">Variant B — Creatief</button>
        </div>
      `;
    }

    const card = document.createElement("div");
    card.className = "pub-card";
    card.innerHTML = `
      <div class="pub-card-header">
        <div class="pub-channel-info">
          <span class="pub-channel-icon">${meta.icon}</span>
          <div>
            <div class="pub-channel-name">${block.channel}</div>
            <div class="pub-channel-type">${meta.type}</div>
          </div>
        </div>
        <button class="pub-copy-btn" data-index="${i}">
          Kopieren
        </button>
      </div>
      <div class="pub-card-body">
        ${variantTabsHtml}
        <textarea class="pub-textarea" id="pub-text-${i}" spellcheck="true">${mainContent}</textarea>
        ${altContent ? `<textarea class="pub-textarea hidden" id="pub-text-${i}-b" spellcheck="true">${altContent}</textarea>` : ""}
        <div class="pub-card-meta">
          ${readLabel ? `<span class="readability-badge level-${readLabel.level}">${readLabel.label} (${readability.score})</span>` : ""}
          <span class="pub-char-count" id="pub-count-${i}">${formatCharCount(mainContent.length, block.channel)}</span>
        </div>
      </div>
    `;
    grid.appendChild(card);

    // Variant tab switching
    if (altContent) {
      card.querySelectorAll(".variant-tab").forEach(tab => {
        tab.addEventListener("click", () => {
          card.querySelectorAll(".variant-tab").forEach(t => t.classList.remove("active"));
          tab.classList.add("active");

          const textareaA = card.querySelector(`#pub-text-${i}`);
          const textareaB = card.querySelector(`#pub-text-${i}-b`);

          if (tab.dataset.variant === "a") {
            textareaA.classList.remove("hidden");
            textareaB.classList.add("hidden");
          } else {
            textareaA.classList.add("hidden");
            textareaB.classList.remove("hidden");
          }

          // Update readability and char count for visible textarea
          const visible = tab.dataset.variant === "a" ? textareaA : textareaB;
          const r = calculateReadability(visible.value);
          const rl = r ? getReadabilityLabel(r.score) : null;
          const metaEl = card.querySelector(".pub-card-meta");
          const badge = metaEl.querySelector(".readability-badge");
          if (badge && rl) {
            badge.className = `readability-badge level-${rl.level}`;
            badge.textContent = `${rl.label} (${r.score})`;
          }
          card.querySelector(`#pub-count-${i}`).innerHTML = formatCharCount(visible.value.length, block.channel);
        });
      });
    }

    // Copy button
    card.querySelector(".pub-copy-btn").addEventListener("click", (e) => {
      const visibleTextarea = card.querySelector(".pub-textarea:not(.hidden)");
      navigator.clipboard.writeText(visibleTextarea.value).then(() => {
        const btn = e.currentTarget;
        btn.textContent = "Gekopieerd!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Kopieren";
          btn.classList.remove("copied");
        }, 2000);
      });
    });

    // Update counts on input
    card.querySelectorAll(".pub-textarea").forEach(ta => {
      ta.addEventListener("input", () => {
        const visibleTA = card.querySelector(".pub-textarea:not(.hidden)");
        card.querySelector(`#pub-count-${i}`).innerHTML = formatCharCount(visibleTA.value.length, block.channel);

        // Update readability
        const r = calculateReadability(visibleTA.value);
        const rl = r ? getReadabilityLabel(r.score) : null;
        const badge = card.querySelector(".readability-badge");
        if (badge && rl) {
          badge.className = `readability-badge level-${rl.level}`;
          badge.textContent = `${rl.label} (${r.score})`;
        }
      });
    });
  });
}

function copyAllChannels() {
  const textareas = $$("#pubGrid .pub-textarea");
  const allText = textareas.map(ta => {
    const card = ta.closest(".pub-card");
    const name = card.querySelector(".pub-channel-name").textContent;
    return `=== ${name} ===\n\n${ta.value}`;
  }).join("\n\n---\n\n");

  navigator.clipboard.writeText(allText).then(() => {
    const btn = $("#btnCopyAll");
    btn.textContent = "Alles gekopieerd!";
    setTimeout(() => { btn.textContent = "Alles kopieren"; }, 2000);
  });
}

// ========================
// Project Library (Campaign Memory)
// ========================
function getProjects() {
  return JSON.parse(localStorage.getItem("cb-projects") || "[]");
}

function saveProjects(projects) {
  localStorage.setItem("cb-projects", JSON.stringify(projects));
  updateProjectCount();
}

function updateProjectCount() {
  const count = getProjects().length;
  const el = $("#projectCount");
  if (el) el.textContent = count;
}

function saveCurrentProject() {
  const casus = getCasus();
  const titel = casus.titel || "Naamloos project";
  const huisstijl = getHuisstijl();

  const project = {
    id: Date.now().toString(),
    titel,
    organisatie: huisstijl.organisatie || "",
    datum: new Date().toISOString(),
    casus,
    huisstijl,
    results: JSON.parse(JSON.stringify(state.results)),
    calendarEvents: JSON.parse(JSON.stringify(state.calendarEvents)),
    revisionRound: state.revisionRound,
    logoUrl: state.logoUrl,
    selectedStakeholders: getSelectedStakeholders(),
  };

  const projects = getProjects();
  // Update existing if same title+org, otherwise add new
  const existingIdx = projects.findIndex(p => p.titel === titel && p.organisatie === project.organisatie);
  if (existingIdx >= 0) {
    project.id = projects[existingIdx].id;
    projects[existingIdx] = project;
  } else {
    projects.unshift(project);
  }

  saveProjects(projects);
  alert(`Project "${titel}" opgeslagen.`);
}

function loadProject(projectId) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // Restore casus form
  $("#casusTitel").value = project.casus.titel || "";
  $("#casusBeschrijving").value = project.casus.beschrijving || "";
  $("#casusContext").value = project.casus.context || "";
  $("#casusLinks").value = project.casus.links || "";
  $("#casusUrgentie").value = project.casus.urgentie || "";

  // Restore doelgroepen
  $$('.checkbox-inline .checkbox input').forEach(cb => {
    cb.checked = project.casus.doelgroepen?.includes(cb.value) || false;
  });

  // Restore kanalen
  $$('.channel-grid .checkbox input').forEach(cb => {
    cb.checked = project.casus.kanalen?.includes(cb.value) || false;
  });

  // Restore stakeholders
  $$('input[name="stakeholder"]').forEach(cb => {
    cb.checked = project.selectedStakeholders?.includes(cb.value) || false;
  });

  // Restore huisstijl
  $("#organisatie").value = project.huisstijl?.organisatie || "";
  $("#colorPrimary").value = project.huisstijl?.primair || "#1a365d";
  $("#colorSecondary").value = project.huisstijl?.secundair || "#e53e3e";
  $("#font").value = project.huisstijl?.font || "";
  if (project.huisstijl?.toneOfVoice) {
    $("#toneOfVoice").value = project.huisstijl.toneOfVoice;
  }

  // Restore logo
  if (project.logoUrl) {
    state.logoUrl = project.logoUrl;
    $("#logoPreview").innerHTML = `<img src="${project.logoUrl}" alt="Logo">`;
  }

  // Restore results
  state.results = project.results || { plan: "", teksten: "", visuals: "", revision: "", stakeholders: {}, images: [] };
  state.calendarEvents = project.calendarEvents || {};
  state.revisionRound = project.revisionRound || 0;

  // Close modal
  closeProjectModal();

  // If there are results, show the war room
  if (state.results.plan) {
    $("#stepCasus").classList.add("hidden");
    $("#stepWarRoom").classList.remove("hidden");
    $("#casusTitle").textContent = project.casus.titel || "";

    // Recreate stakeholder cards
    createStakeholderCards(project.selectedStakeholders || []);

    // Restore agent outputs
    setAgentStatus("card-strategist", "done", "Klaar");
    setAgentOutput("card-strategist", mdToHtml(state.results.plan));

    if (state.results.teksten) {
      setAgentStatus("card-copywriter", "done", "Klaar");
      setAgentOutput("card-copywriter", mdToHtml(state.results.teksten));
    }

    if (state.results.visuals) {
      setAgentStatus("card-visualAdvisor", "done", "Klaar");
      setAgentOutput("card-visualAdvisor", mdToHtml(state.results.visuals));
    }

    // Restore stakeholder reviews
    for (const [id, review] of Object.entries(state.results.stakeholders)) {
      const cardId = `card-stakeholder-${id}`;
      setAgentStatus(cardId, "done", "Klaar");
      setAgentOutput(cardId, mdToHtml(review));
    }

    // Restore revision
    if (state.results.revision) {
      $("#revisionArrow").classList.remove("hidden");
      $("#card-revision").classList.remove("hidden");
      setAgentStatus("card-revision", "done", `Ronde ${state.revisionRound} klaar`);
      setAgentOutput("card-revision", mdToHtml(state.results.revision));
    }

    // Show actions
    $("#actionsBar").classList.remove("hidden");
    $("#userFeedbackSection").classList.remove("hidden");
  }
}

function deleteProject(projectId) {
  if (!confirm("Dit project verwijderen?")) return;
  const projects = getProjects().filter(p => p.id !== projectId);
  saveProjects(projects);
  renderProjectList();
}

function renderProjectList() {
  const list = $("#projectList");
  const projects = getProjects();

  if (projects.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\uD83D\uDCC2</div>
        <p>Nog geen opgeslagen projecten.<br>Start een casus en sla het op om het hier terug te vinden.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = projects.map(p => {
    const date = new Date(p.datum).toLocaleDateString("nl-NL", {
      day: "numeric", month: "short", year: "numeric"
    });
    const hasResults = !!p.results?.plan;
    const channels = p.casus?.kanalen?.length || 0;
    return `
      <div class="project-item" data-id="${p.id}">
        <div class="project-icon">${hasResults ? "\u2705" : "\uD83D\uDCC4"}</div>
        <div class="project-info">
          <h4>${p.titel}</h4>
          <div class="project-meta">
            <span>${p.organisatie || "Geen organisatie"}</span>
            <span>${date}</span>
            <span>${channels} kanalen</span>
          </div>
        </div>
        <div class="project-actions">
          <button class="project-delete" data-id="${p.id}" title="Verwijderen">&times;</button>
        </div>
      </div>
    `;
  }).join("");

  // Event handlers
  list.querySelectorAll(".project-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".project-delete")) return;
      loadProject(item.dataset.id);
    });
  });

  list.querySelectorAll(".project-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProject(btn.dataset.id);
    });
  });
}

function openProjectModal() {
  renderProjectList();
  $("#projectModal").classList.add("visible");
}

function closeProjectModal() {
  $("#projectModal").classList.remove("visible");
}

// Init project count
updateProjectCount();

// ========================
// Content Calendar
// ========================
const MONTH_NAMES = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December"
];

const DAY_NAMES = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function getChannelType(channel) {
  const meta = CHANNEL_ICONS[channel];
  if (!meta) return "digitaal";
  if (meta.type === "Social media") return "social";
  if (meta.type === "Traditioneel") return "traditioneel";
  return "digitaal";
}

function renderCalendar() {
  const grid = $("#calendarGrid");
  if (!grid) return;

  const year = state.calendarYear;
  const month = state.calendarMonth;

  // Update month label
  $("#calendarMonth").textContent = `${MONTH_NAMES[month]} ${year}`;

  // Calculate calendar grid
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let html = DAY_NAMES.map(d => `<div class="calendar-day-header">${d}</div>`).join("");

  // Prev month days
  for (let i = startDow - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    html += renderCalendarDay(day, dateStr, true, false);
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = dateStr === todayStr;
    html += renderCalendarDay(day, dateStr, false, isToday);
  }

  // Next month days to fill grid
  const totalCells = startDow + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let day = 1; day <= remaining; day++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    html += renderCalendarDay(day, dateStr, true, false);
  }

  grid.innerHTML = html;

  // Add click handlers
  grid.querySelectorAll(".calendar-day").forEach(cell => {
    cell.addEventListener("click", (e) => {
      if (e.target.closest(".calendar-event")) return;
      toggleCalendarPopover(cell, cell.dataset.date);
    });
  });

  // Add event remove handlers
  grid.querySelectorAll(".calendar-event").forEach(ev => {
    ev.addEventListener("click", (e) => {
      e.stopPropagation();
      const date = ev.dataset.date;
      const channel = ev.dataset.channel;
      removeCalendarEvent(date, channel);
    });
  });
}

function renderCalendarDay(day, dateStr, isOtherMonth, isToday) {
  const events = state.calendarEvents[dateStr] || [];
  const classes = ["calendar-day"];
  if (isOtherMonth) classes.push("other-month");
  if (isToday) classes.push("today");

  let eventsHtml = events.map(ch => {
    const type = getChannelType(ch);
    const icon = CHANNEL_ICONS[ch]?.icon || "";
    return `<div class="calendar-event type-${type}" data-date="${dateStr}" data-channel="${ch}" title="Klik om te verwijderen">${icon} ${ch}</div>`;
  }).join("");

  return `
    <div class="${classes.join(" ")}" data-date="${dateStr}">
      <div class="calendar-day-number">${isToday ? `<span>${day}</span>` : day}</div>
      ${eventsHtml}
    </div>
  `;
}

function toggleCalendarPopover(cell, dateStr) {
  // Remove existing popovers
  document.querySelectorAll(".calendar-popover").forEach(p => p.remove());

  // Get available channels
  const casus = getCasus();
  const channels = casus.kanalen?.length > 0 ? casus.kanalen : Object.keys(CHANNEL_ICONS);
  const currentEvents = state.calendarEvents[dateStr] || [];

  const popover = document.createElement("div");
  popover.className = "calendar-popover";
  popover.innerHTML = `
    <h4>Kanaal inplannen op ${dateStr}</h4>
    ${channels.map(ch => {
      const isSelected = currentEvents.includes(ch);
      const icon = CHANNEL_ICONS[ch]?.icon || "";
      return `<div class="channel-option ${isSelected ? "selected" : ""}" data-channel="${ch}">${icon} ${ch}</div>`;
    }).join("")}
  `;

  cell.style.position = "relative";
  cell.appendChild(popover);

  // Channel option click handlers
  popover.querySelectorAll(".channel-option").forEach(opt => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const channel = opt.dataset.channel;
      if (opt.classList.contains("selected")) {
        removeCalendarEvent(dateStr, channel);
      } else {
        addCalendarEvent(dateStr, channel);
      }
      popover.remove();
    });
  });

  // Close on outside click
  const closeHandler = (e) => {
    if (!popover.contains(e.target)) {
      popover.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

function addCalendarEvent(dateStr, channel) {
  if (!state.calendarEvents[dateStr]) {
    state.calendarEvents[dateStr] = [];
  }
  if (!state.calendarEvents[dateStr].includes(channel)) {
    state.calendarEvents[dateStr].push(channel);
  }
  renderCalendar();
}

function removeCalendarEvent(dateStr, channel) {
  if (!state.calendarEvents[dateStr]) return;
  state.calendarEvents[dateStr] = state.calendarEvents[dateStr].filter(ch => ch !== channel);
  if (state.calendarEvents[dateStr].length === 0) {
    delete state.calendarEvents[dateStr];
  }
  renderCalendar();
}

function showCalendar() {
  $("#stepPublicatie").classList.add("hidden");
  $("#stepCalendar").classList.remove("hidden");
  updateProgressBar(4);
  renderCalendar();
}

function exportCalendar() {
  const events = state.calendarEvents;
  if (Object.keys(events).length === 0) return alert("Geen kalender-items om te exporteren");

  let ical = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Communicatiebureau AI//NL\n";

  for (const [date, channels] of Object.entries(events)) {
    for (const channel of channels) {
      const dateClean = date.replace(/-/g, "");
      ical += `BEGIN:VEVENT\n`;
      ical += `DTSTART;VALUE=DATE:${dateClean}\n`;
      ical += `DTEND;VALUE=DATE:${dateClean}\n`;
      ical += `SUMMARY:Publicatie: ${channel}\n`;
      ical += `DESCRIPTION:${getCasus().titel || "Communicatiecasus"} - ${channel}\n`;
      ical += `END:VEVENT\n`;
    }
  }

  ical += "END:VCALENDAR";

  const blob = new Blob([ical], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contentkalender-${getCasus().titel?.replace(/\s+/g, "-").toLowerCase() || "export"}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========================
// Event Listeners
// ========================
$("#btnStart").addEventListener("click", runPipeline);

$("#btnNewCasus").addEventListener("click", () => {
  $("#stepWarRoom").classList.add("hidden");
  $("#stepCasus").classList.remove("hidden");
  state.results = { plan: "", teksten: "", visuals: "", revision: "", stakeholders: {}, images: [] };
  state.revisionRound = 0;
  state.userFeedback = "";
  state.calendarEvents = {};
  localStorage.removeItem("cb-autosave");
  updateProgressBar(1);
  const feedbackEl = $("#userFeedbackText");
  if (feedbackEl) feedbackEl.value = "";
  $("#userFeedbackSection").classList.add("hidden");
  const countEl = $("#revisionCount");
  if (countEl) countEl.textContent = "";

  ["card-strategist", "card-copywriter", "card-visualAdvisor"].forEach((id) => {
    setAgentStatus(id, "waiting", "Wacht...");
    const output = $(`#${id} .agent-output`);
    output.innerHTML = "";
    output.classList.remove("visible");
    const toggle = $(`#${id} .agent-toggle`);
    if (toggle) toggle.remove();
  });

  $("#actionsBar").classList.add("hidden");
  $("#revisionArrow").classList.add("hidden");
  $("#card-revision").classList.add("hidden");
  $("#imagesArrow").classList.add("hidden");
  $("#card-images").classList.add("hidden");
});

$("#btnRevision").addEventListener("click", runRevisionPipeline);
$("#btnGenerateImages").addEventListener("click", runImageGeneration);
$("#btnPublicatieklaar").addEventListener("click", showPublicatieklaar);

// User feedback toggle
$("#btnUserFeedback").addEventListener("click", () => {
  const section = $("#userFeedbackSection");
  section.classList.toggle("hidden");
  if (!section.classList.contains("hidden")) {
    $("#userFeedbackText").focus();
  }
});

// Track user feedback
$("#userFeedbackText").addEventListener("input", (e) => {
  state.userFeedback = e.target.value;
});

// Document upload
$("#btnUploadDocs").addEventListener("click", () => $("#docFiles").click());
$("#docFiles").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    try {
      const text = await file.text();
      state.documents.push({ name: file.name, size: file.size, content: text });
      renderDocList();
    } catch {
      state.documents.push({ name: file.name, size: file.size, content: `[Binair bestand: ${file.name}, ${(file.size/1024).toFixed(0)}KB]` });
      renderDocList();
    }
  }
  e.target.value = "";
});

function renderDocList() {
  const list = $("#docList");
  list.innerHTML = state.documents.map((d, i) => `
    <div class="doc-item">
      <span class="doc-item-name">\uD83D\uDCC4 ${d.name}</span>
      <span class="doc-item-size">${(d.size/1024).toFixed(0)} KB</span>
      <button class="doc-remove" data-index="${i}">&times;</button>
    </div>
  `).join("");

  list.querySelectorAll(".doc-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      state.documents.splice(parseInt(e.target.dataset.index), 1);
      renderDocList();
    });
  });
}

// Export buttons
$("#btnExportMd").addEventListener("click", exportMarkdown);
$("#btnExportPdf").addEventListener("click", exportPdf);

// Publicatieklaar buttons
$("#btnBackToWarRoom").addEventListener("click", () => {
  $("#stepPublicatie").classList.add("hidden");
  $("#stepWarRoom").classList.remove("hidden");
  updateProgressBar(2);
});
$("#btnBackToWarRoom2").addEventListener("click", () => {
  $("#stepPublicatie").classList.add("hidden");
  $("#stepWarRoom").classList.remove("hidden");
  updateProgressBar(2);
});
$("#btnExportMd2").addEventListener("click", exportMarkdown);
$("#btnExportPdf2").addEventListener("click", exportPdf);
$("#btnCopyAll").addEventListener("click", copyAllChannels);

// Calendar buttons
$("#btnToCalendar").addEventListener("click", showCalendar);
$("#btnBackToPub").addEventListener("click", () => {
  $("#stepCalendar").classList.add("hidden");
  $("#stepPublicatie").classList.remove("hidden");
  updateProgressBar(3);
});
$("#btnBackToPub2").addEventListener("click", () => {
  $("#stepCalendar").classList.add("hidden");
  $("#stepPublicatie").classList.remove("hidden");
  updateProgressBar(3);
});
$("#btnPrevMonth").addEventListener("click", () => {
  state.calendarMonth--;
  if (state.calendarMonth < 0) {
    state.calendarMonth = 11;
    state.calendarYear--;
  }
  renderCalendar();
});
$("#btnNextMonth").addEventListener("click", () => {
  state.calendarMonth++;
  if (state.calendarMonth > 11) {
    state.calendarMonth = 0;
    state.calendarYear++;
  }
  renderCalendar();
});
$("#btnExportCalendar").addEventListener("click", exportCalendar);
$("#btnExportMd3").addEventListener("click", exportMarkdown);
$("#btnExportPdf3").addEventListener("click", exportPdf);

// Project buttons
$("#btnSaveProject").addEventListener("click", saveCurrentProject);
$("#btnSaveProject2").addEventListener("click", saveCurrentProject);
$("#btnOpenProjects").addEventListener("click", openProjectModal);
$("#btnCloseModal").addEventListener("click", closeProjectModal);
$("#projectModal").addEventListener("click", (e) => {
  if (e.target === $("#projectModal")) closeProjectModal();
});

// Autosave buttons
$("#btnRestoreAutosave")?.addEventListener("click", restoreAutosave);
$("#btnDismissAutosave")?.addEventListener("click", dismissAutosave);

// Template buttons
$("#btnSaveTemplate").addEventListener("click", saveTemplate);
$("#templateSelect").addEventListener("change", (e) => loadTemplate(e.target.value));
$("#btnDeleteTemplate").addEventListener("click", deleteTemplate);

// Check server-side API keys
(async () => {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    state.serverHasAnthropicKey = config.hasAnthropicKey;
    state.serverHasOpenaiKey = config.hasOpenaiKey;

    if (config.hasAnthropicKey) {
      const el = $("#apiKey")?.closest(".sidebar-section");
      if (el) el.innerHTML = '<label class="label">Anthropic API Key</label><div style="color: var(--success); font-size: 0.85rem; font-weight: 500;">Geconfigureerd via .env</div>';
    }
    if (config.hasOpenaiKey) {
      const el = $("#openaiKey")?.closest(".sidebar-section");
      if (el) el.innerHTML = '<label class="label">OpenAI API Key (voor visuals)</label><div style="color: var(--success); font-size: 0.85rem; font-weight: 500;">Geconfigureerd via .env</div>';
    }
  } catch (e) {
    // Server not available, fields stay visible
  }
})();
