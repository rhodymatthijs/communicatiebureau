// State
const state = {
  apiKey: "",
  openaiKey: "",
  logoUrl: null,
  documents: [],
  revisionRound: 0,
  userFeedback: "",
  results: { plan: "", teksten: "", visuals: "", revision: "", stakeholders: {}, images: [] },
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
    const size = 100; // downsample for speed
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);

    const data = ctx.getImageData(0, 0, size, size).data;
    const colorBuckets = {};

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue; // skip transparent

      // Skip near-white, near-black, and grey
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = max / 255;

      if (saturation < 0.15) continue; // skip greys/whites/blacks
      if (brightness < 0.1) continue;  // skip very dark
      if (brightness > 0.95 && saturation < 0.2) continue; // skip near-white

      // Quantize to reduce noise (round to nearest 16)
      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const key = `${qr},${qg},${qb}`;

      colorBuckets[key] = (colorBuckets[key] || 0) + 1;
    }

    // Sort by frequency
    const sorted = Object.entries(colorBuckets)
      .sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) return;

    // Primary = most common color
    const primary = sorted[0][0].split(",").map(Number);
    const primaryHex = rgbToHex(primary[0], primary[1], primary[2]);
    $("#colorPrimary").value = primaryHex;

    // Secondary = second most common, but sufficiently different from primary
    if (sorted.length > 1) {
      let secondaryHex = primaryHex;
      for (let i = 1; i < sorted.length; i++) {
        const c = sorted[i][0].split(",").map(Number);
        const dist = Math.sqrt(
          (primary[0]-c[0])**2 + (primary[1]-c[1])**2 + (primary[2]-c[2])**2
        );
        if (dist > 60) { // sufficiently different
          secondaryHex = rgbToHex(c[0], c[1], c[2]);
          break;
        }
      }
      $("#colorSecondary").value = secondaryHex;
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

  // Eigen feedback van de gebruiker toevoegen
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
    bio: "Skipt alles wat langer is dan een Instagram-caption. Maar als het hem raakt, leest hij wél.",
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

  // Update count in team bar
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
// Extract image prompts from Visual Advisor output
// ========================
function extractImagePrompts(visualsText) {
  const prompts = [];
  // Look for English prompts typically in quotes or after "Prompt:"
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

  // Fallback: look for lines that are clearly English prompts
  if (prompts.length === 0) {
    const lines = visualsText.split("\n");
    for (const line of lines) {
      const cleaned = line.replace(/^[\s*-]+/, "").trim();
      // Heuristic: English prompt with descriptive terms
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

  // Show image section
  $("#imagesArrow").classList.remove("hidden");
  $("#card-images").classList.remove("hidden");
  setAgentStatus("card-images", "active", `0/${prompts.length} gereed`);

  const grid = $("#imageGrid");
  grid.innerHTML = "";

  // Create placeholder cards
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

  // Generate images (sequentially with pauze om rate limits te voorkomen)
  let completed = 0;
  for (let i = 0; i < prompts.length; i++) {
    // Wacht 65 seconden tussen requests (OpenAI rate limit: 1/min)
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

  // Show revision section
  $("#revisionArrow").classList.remove("hidden");
  $("#card-revision").classList.remove("hidden");

  // Update revision count badge
  const countEl = $("#revisionCount");
  if (countEl) countEl.textContent = state.revisionRound > 1 ? `#${state.revisionRound}` : "";

  try {
    setAgentStatus("card-revision", "active", `Revisieronde ${state.revisionRound}...`);
    const revision = await runRevision();
    state.results.revision = revision;
    // Update teksten zodat volgende revisie op de laatste versie werkt
    state.results.teksten = revision;
    setAgentStatus("card-revision", "done", `Ronde ${state.revisionRound} klaar`);
    setAgentOutput("card-revision", mdToHtml(revision));

    // Clear user feedback na verwerking
    const feedbackEl = $("#userFeedbackText");
    if (feedbackEl) feedbackEl.value = "";
    state.userFeedback = "";
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
  // Als er server-side keys zijn, hoef je ze niet in de UI in te vullen
  if (!state.apiKey && !state.serverHasAnthropicKey) return alert("Vul je Anthropic API key in");

  const casus = getCasus();
  if (!casus.beschrijving) return alert("Beschrijf de casus voordat je het bureau start");

  const stakeholders = getSelectedStakeholders();

  // Switch to war room
  $("#stepCasus").classList.add("hidden");
  $("#stepWarRoom").classList.remove("hidden");
  $("#casusTitle").textContent = casus.titel || "";

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
  // Show user feedback section
  $("#userFeedbackSection").classList.remove("hidden");
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
    // Strip markdown formatting
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
  doc.text(`Organisatie: ${huisstijl.organisatie || "—"}`, margin, y);
  y += 5;
  doc.text(`Datum: ${new Date().toLocaleDateString("nl-NL")}`, margin, y);
  y += 10;
  addSeparator();

  // Casus
  addSubtitle("Casus");
  addBody(casus.beschrijving);
  addSeparator();

  // Plan
  if (state.results.plan) {
    addSubtitle("Communicatieplan");
    addBody(state.results.plan);
    addSeparator();
  }

  // Teksten
  if (state.results.teksten) {
    addSubtitle("Teksten");
    addBody(state.results.teksten);
    addSeparator();
  }

  // Visueel advies
  if (state.results.visuals) {
    addSubtitle("Visueel advies");
    addBody(state.results.visuals);
    addSeparator();
  }

  // Stakeholder reviews
  const stakeholderNames = {
    ouder: "Ouder", leerling: "Leerling", docent: "Docent",
    directeur: "Directeur", rvt: "Raad van Toezicht",
  };
  for (const [id, review] of Object.entries(state.results.stakeholders)) {
    addSubtitle(`Review: ${stakeholderNames[id]}`);
    addBody(review);
    addSeparator();
  }

  // Revisie
  if (state.results.revision) {
    addSubtitle("Herziene teksten (na stakeholder feedback)");
    addBody(state.results.revision);
  }

  doc.save(`communicatieplan-${casus.titel?.replace(/\s+/g, "-").toLowerCase() || "export"}.pdf`);
}

// ========================
// Channel Icons
// ========================
const CHANNEL_ICONS = {
  "Website": { icon: "🌐", type: "Digitaal" },
  "Intern communicatieportaal": { icon: "🏢", type: "Digitaal" },
  "Nieuwsbrief (e-mail)": { icon: "📧", type: "Digitaal" },
  "Direct mailing": { icon: "📬", type: "Digitaal" },
  "Facebook": { icon: "📘", type: "Social media" },
  "Instagram": { icon: "📷", type: "Social media" },
  "LinkedIn": { icon: "💼", type: "Social media" },
  "X (Twitter)": { icon: "🐦", type: "Social media" },
  "TikTok": { icon: "🎵", type: "Social media" },
  "Brief aan ouders": { icon: "✉️", type: "Traditioneel" },
  "Persverklaring": { icon: "📰", type: "Traditioneel" },
  "Interne memo": { icon: "📝", type: "Traditioneel" },
  "Poster/flyer": { icon: "🖼️", type: "Traditioneel" },
};

// ========================
// Parse channel blocks from copywriter output
// ========================
function parseChannelBlocks(text) {
  const blocks = [];
  // Match ## [KANAAL: Name] pattern
  const regex = /##\s*\[KANAAL:\s*([^\]]+)\]\s*\n([\s\S]*?)(?=##\s*\[KANAAL:|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const channelName = match[1].trim();
    const content = match[2].trim();
    if (content) {
      blocks.push({ channel: channelName, content });
    }
  }

  // Fallback: try ## Kanaalnaam pattern if no [KANAAL:] markers found
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
function showPublicatieklaar() {
  // Use revision text if available, otherwise copywriter text
  const sourceText = state.results.revision || state.results.teksten;
  if (!sourceText) return alert("Er zijn nog geen teksten gegenereerd");

  const blocks = parseChannelBlocks(sourceText);
  if (blocks.length === 0) return alert("Kon geen kanaalblokken herkennen in de output. Probeer de revisieronde eerst.");

  // Switch views
  $("#stepWarRoom").classList.add("hidden");
  $("#stepPublicatie").classList.remove("hidden");

  const grid = $("#pubGrid");
  grid.innerHTML = "";

  blocks.forEach((block, i) => {
    const meta = CHANNEL_ICONS[block.channel] || { icon: "📄", type: "Overig" };
    // Strip markdown formatting for clean copyable text
    const cleanContent = block.content
      .replace(/^\*Aanpassingen:.*$/gm, "")  // Remove revision notes
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .trim();

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
          📋 Kopiëren
        </button>
      </div>
      <div class="pub-card-body">
        <textarea class="pub-textarea" id="pub-text-${i}" spellcheck="true">${cleanContent}</textarea>
        <div class="pub-char-count"><span id="pub-count-${i}">${cleanContent.length}</span> tekens</div>
      </div>
    `;
    grid.appendChild(card);

    // Copy button handler
    card.querySelector(".pub-copy-btn").addEventListener("click", (e) => {
      const textarea = $(`#pub-text-${i}`);
      navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = e.currentTarget;
        btn.innerHTML = "✅ Gekopieerd!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerHTML = "📋 Kopiëren";
          btn.classList.remove("copied");
        }, 2000);
      });
    });

    // Character count updater
    card.querySelector(`#pub-text-${i}`).addEventListener("input", (e) => {
      $(`#pub-count-${i}`).textContent = e.target.value.length;
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
    btn.textContent = "✅ Alles gekopieerd!";
    setTimeout(() => { btn.textContent = "📋 Alles kopiëren"; }, 2000);
  });
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

// Eigen feedback toggle
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
      // Binary file — read as base64 description
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
      <span class="doc-item-name">📄 ${d.name}</span>
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
$("#btnExportMd").addEventListener("click", exportMarkdown);
$("#btnExportPdf").addEventListener("click", exportPdf);

// Publicatieklaar buttons
$("#btnBackToWarRoom").addEventListener("click", () => {
  $("#stepPublicatie").classList.add("hidden");
  $("#stepWarRoom").classList.remove("hidden");
});
$("#btnBackToWarRoom2").addEventListener("click", () => {
  $("#stepPublicatie").classList.add("hidden");
  $("#stepWarRoom").classList.remove("hidden");
});
$("#btnExportMd2").addEventListener("click", exportMarkdown);
$("#btnExportPdf2").addEventListener("click", exportPdf);
$("#btnCopyAll").addEventListener("click", copyAllChannels);

// Template buttons
$("#btnSaveTemplate").addEventListener("click", saveTemplate);
$("#templateSelect").addEventListener("change", (e) => loadTemplate(e.target.value));
$("#btnDeleteTemplate").addEventListener("click", deleteTemplate);

// Check server-side API keys bij laden
(async () => {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    state.serverHasAnthropicKey = config.hasAnthropicKey;
    state.serverHasOpenaiKey = config.hasOpenaiKey;

    if (config.hasAnthropicKey) {
      const el = $("#apiKey").closest(".sidebar-section");
      if (el) el.innerHTML = '<label class="label">Anthropic API Key</label><div style="color: var(--success); font-size: 0.85rem;">✅ Geconfigureerd via .env</div>';
    }
    if (config.hasOpenaiKey) {
      const el = $("#openaiKey").closest(".sidebar-section");
      if (el) el.innerHTML = '<label class="label">OpenAI API Key (voor visuals)</label><div style="color: var(--success); font-size: 0.85rem;">✅ Geconfigureerd via .env</div>';
    }
  } catch (e) {
    // Server niet bereikbaar, velden blijven zichtbaar
  }
})();
