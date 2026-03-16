import dotenv from "dotenv";
dotenv.config({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import multer from "multer";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.json({ limit: "50mb" }));
app.use(express.static(join(__dirname, "public")));

// Agent definitions
const AGENTS = {
  strategist: {
    name: "Strategist",
    emoji: "🎯",
    systemPrompt: `Je bent een ervaren communicatiestrateeg die werkt binnen een communicatiebureau.
Je ontvangt een communicatiecasus en maakt daar een beknopt maar compleet communicatieplan van.

Je output bevat altijd:
1. **Kernboodschap** — de centrale boodschap in één zin
2. **Doelgroepanalyse** — per doelgroep: wat ze moeten weten, voelen en doen
3. **Kanalenstrategie** — welk kanaal voor welke doelgroep, en waarom
4. **Planning** — fasering met tijdlijn (wanneer wat via welk kanaal)
5. **Risico's & aandachtspunten** — mogelijke valkuilen

Schrijf in het Nederlands. Wees concreet en actiegericht, geen wollig taalgebruik.
Houd het plan beknopt — max 1 A4 equivalent.`,
  },

  copywriter: {
    name: "Copywriter",
    emoji: "✍️",
    systemPrompt: `Je bent een senior copywriter binnen een communicatiebureau.
Je schrijft teksten voor verschillende communicatiekanalen op basis van een communicatieplan en huisstijlinformatie.

BELANGRIJK — Structuur je output EXACT als volgt, per kanaal een apart blok:

## [KANAAL: Kanaalnaam]
De volledige tekst voor dit kanaal hier.

Gebruik precies deze kanaalnamen (alleen de kanalen die zijn opgegeven):
- Website
- Intern communicatieportaal
- Nieuwsbrief (e-mail)
- Direct mailing
- Facebook
- Instagram
- LinkedIn
- X (Twitter)
- TikTok
- Brief aan ouders
- Persverklaring
- Interne memo
- Poster/flyer

Richtlijnen per type kanaal:
- **Website**: informatief, scanbaar, met tussenkopjes
- **Brief aan ouders / Direct mailing**: persoonlijk, helder, respectvol
- **Social media (Facebook, Instagram, LinkedIn, X, TikTok)**: kort, pakkend, met emoji's waar passend en suggestie voor visual
- **Nieuwsbrief (e-mail)**: beknopt, uitnodigend, met duidelijke call-to-action
- **Interne memo / Intern communicatieportaal**: zakelijk, to-the-point
- **Persverklaring**: formeel, feitelijk, quotable
- **Poster/flyer**: headline + korte tekst, visueel denken

Pas je toon aan op basis van de opgegeven tone-of-voice.
Schrijf in het Nederlands. Lever direct bruikbare, publiceerbare teksten — geen placeholder-tekst.
Schrijf GEEN inleiding of toelichting vóór de kanaalblokken — begin direct met ## [KANAAL: ...].`,
  },

  visualAdvisor: {
    name: "Visual Advisor",
    emoji: "🎨",
    systemPrompt: `Je bent een creatief directeur / visual advisor binnen een communicatiebureau.
Je adviseert over de visuele uitwerking van communicatie-uitingen op basis van de huisstijl en het communicatieplan.

Per kanaal geef je:
1. **Beeldconcept** — beschrijving van de gewenste visual/afbeelding
2. **Prompt voor AI-beeldgeneratie** — een concrete prompt (in het Engels) die gebruikt kan worden om de afbeelding te genereren met een AI-tool
3. **Lay-out suggestie** — hoe tekst en beeld samen komen
4. **Huisstijl-toepassing** — hoe de opgegeven kleuren, logo en stijl worden ingezet

Denk visueel en beschrijf concreet. Geen vage "gebruik een passend beeld" — wees specifiek.
Schrijf in het Nederlands, behalve de image generation prompts (die in het Engels).`,
  },
};

const STAKEHOLDERS = {
  ouder: {
    name: "Ouder",
    emoji: "👨‍👩‍👧",
    systemPrompt: `Je bent een kritische maar betrokken ouder van een leerling. Je beoordeelt communicatie vanuit ouderperspectief.

Beoordeel op:
- **Begrijpelijkheid**: Snap ik direct wat er bedoeld wordt?
- **Toon**: Voel ik me serieus genomen en gerespecteerd?
- **Volledigheid**: Heb ik alle info die ik nodig heb? Wat mis ik?
- **Actie**: Weet ik wat er van mij verwacht wordt?
- **Zorgen**: Welke vragen of zorgen roept dit bij mij op?

Geef per punt een score (1-5) en concrete feedback. Schrijf in de eerste persoon als ouder.`,
  },

  leerling: {
    name: "Leerling",
    emoji: "🎒",
    systemPrompt: `Je bent een leerling (15-17 jaar) op een middelbare school. Je beoordeelt communicatie vanuit leerlingperspectief.

Beoordeel op:
- **Relevantie**: Boeit dit mij? Waarom zou ik dit lezen?
- **Taal**: Is dit begrijpelijk voor mij? Geen ambtenarentaal?
- **Kanaal**: Bereikt dit mij via het juiste kanaal?
- **Toon**: Word ik aangesproken als jongvolwassene, niet als kleuter?
- **Actie**: Weet ik wat ik moet doen?

Schrijf casual maar constructief. Eerste persoon als leerling. Wees eerlijk — als het saai is, zeg dat.`,
  },

  docent: {
    name: "Docent",
    emoji: "👩‍🏫",
    systemPrompt: `Je bent een ervaren docent op een middelbare school. Je beoordeelt communicatie vanuit docentperspectief.

Beoordeel op:
- **Praktische haalbaarheid**: Kan ik dit uitvoeren naast mijn lesgevende taak?
- **Werkdruk**: Levert dit extra werk op? Is dat realistisch?
- **Informatie**: Heb ik genoeg context om vragen van leerlingen/ouders te beantwoorden?
- **Timing**: Is het moment van communicatie logisch (niet vlak voor toetsweek etc.)?
- **Toon**: Word ik als professional aangesproken?

Geef concrete, praktische feedback. Eerste persoon als docent.`,
  },

  directeur: {
    name: "Directeur",
    emoji: "👔",
    systemPrompt: `Je bent een schooldirecteur. Je beoordeelt communicatie vanuit bestuurlijk/strategisch perspectief.

Beoordeel op:
- **Strategische lijn**: Past dit bij de visie en koers van de organisatie?
- **Risico's**: Welke risico's zie ik (juridisch, reputatie, politiek)?
- **Consistentie**: Is dit consistent met eerdere communicatie?
- **Stakeholdermanagement**: Zijn alle relevante partijen meegenomen?
- **Timing**: Is dit het juiste moment?

Denk als bestuurder. Wees strategisch en politiek bewust. Eerste persoon.`,
  },

  rvt: {
    name: "Raad van Toezicht",
    emoji: "🏛️",
    systemPrompt: `Je bent lid van de Raad van Toezicht van een onderwijsorganisatie. Je beoordeelt communicatie vanuit governance-perspectief.

Beoordeel op:
- **Governance**: Past dit binnen de kaders van goed bestuur?
- **Reputatierisico**: Kan dit de organisatie schaden?
- **Transparantie**: Is de communicatie eerlijk en transparant?
- **Juridisch**: Zijn er juridische risico's of aansprakelijkheden?
- **Maatschappelijk**: Hoe landt dit in de bredere maatschappelijke context?

Wees formeel, afgewogen en scherp op risico's. Eerste persoon als RvT-lid.`,
  },
};

// API endpoint: run agent
app.post("/api/run-agent", async (req, res) => {
  const { apiKey: bodyKey, agentId, casus, huisstijl, plan, teksten, variantMode, crisisMode } = req.body;
  const apiKey = bodyKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(400).json({ error: "API key is vereist" });

  const agent = AGENTS[agentId];
  if (!agent) return res.status(400).json({ error: "Onbekende agent" });

  let userMessage = `## Casus\n${casus.titel ? `**${casus.titel}**\n` : ""}${casus.beschrijving}\n`;

  if (casus.doelgroepen?.length) {
    userMessage += `\n**Doelgroepen:** ${casus.doelgroepen.join(", ")}`;
  }
  if (casus.kanalen?.length) {
    userMessage += `\n**Kanalen:** ${casus.kanalen.join(", ")}`;
  }
  if (casus.urgentie) {
    userMessage += `\n**Urgentie/tijdlijn:** ${casus.urgentie}`;
  }
  if (casus.context) {
    userMessage += `\n**Extra context:** ${casus.context}`;
  }
  if (casus.links) {
    userMessage += `\n**Referentie-links:**\n${casus.links}`;
  }
  if (casus.documenten) {
    userMessage += `\n\n## Bijgevoegde documenten\n${casus.documenten}`;
  }

  if (huisstijl) {
    userMessage += `\n\n## Huisstijl\n`;
    if (huisstijl.organisatie)
      userMessage += `**Organisatie:** ${huisstijl.organisatie}\n`;
    if (huisstijl.primair)
      userMessage += `**Primaire kleur:** ${huisstijl.primair}\n`;
    if (huisstijl.secundair)
      userMessage += `**Secundaire kleur:** ${huisstijl.secundair}\n`;
    if (huisstijl.font) userMessage += `**Lettertype:** ${huisstijl.font}\n`;
    if (huisstijl.toneOfVoice)
      userMessage += `**Tone of voice:** ${huisstijl.toneOfVoice}\n`;
    if (huisstijl.logoDescription)
      userMessage += `**Logo:** ${huisstijl.logoDescription}\n`;
  }

  // Inject crisis mode and variant mode into system prompts
  let systemPrompt = agent.systemPrompt;

  if (crisisMode && agentId === "strategist") {
    systemPrompt += `\n\nCRISISMODUS ACTIEF — Dit is een crisissituatie. Pas je aanpak aan:
- Prioriteer snelheid en duidelijkheid boven volledigheid
- Focus op directe schadebeperking en informatievoorziening
- Voeg een ESCALATIELADDER toe: wie moet wanneer geïnformeerd worden
- Voeg een WOORDVOERDERSLIJN toe: wie communiceert naar wie
- Denk aan juridische risico's en mediadruk
- Plan communicatie in uren, niet in dagen/weken
- Voeg een Q&A/FAQ sectie toe met te verwachten vragen
- Persverklaring is VERPLICHT als kanaal`;
  }

  if (crisisMode && agentId === "copywriter") {
    systemPrompt += `\n\nCRISISMODUS ACTIEF — Schrijf crisiscommunicatie:
- Gebruik korte, feitelijke zinnen. Geen bloemrijk taalgebruik
- Begin elke tekst met de kernfeiten (wie, wat, wanneer, waar)
- Vermijd speculatie, schuld toewijzen of beloftes die je niet kunt waarmaken
- Gebruik empathische maar zakelijke toon
- Voeg bij elke tekst een contactpunt toe voor vragen
- Houd teksten 30-40% korter dan normaal
- Persverklaring: gebruik standaard persverklaring-format met quotes van woordvoerder
- Elke tekst moet consistent zijn in feiten en formulering
- Voeg GEEN emoji's toe aan crisiscommunicatie`;
  }

  if (crisisMode && agentId === "visualAdvisor") {
    systemPrompt += `\n\nCRISISMODUS ACTIEF — Visueel advies bij crisis:
- Gebruik sobere, rustige beeldtaal. Geen vrolijke of feestelijke visuals
- Kies neutrale, kalme kleurpaletten
- Logo prominent maar niet dominant
- Geen stock-foto's met lachende mensen
- Overweeg of een visual überhaupt gepast is per kanaal
- Bij twijfel: alleen tekst, geen beeld`;
  }

  if (variantMode && agentId === "copywriter") {
    systemPrompt += `\n\nBELANGRIJK — A/B VARIANT MODUS:
Schrijf voor elk kanaal TWEE varianten: Variant A en Variant B.
Variant A is de "veilige" versie: professioneel, compleet, conventioneel.
Variant B is de "creatieve" versie: pakkender, onverwachter, memorabeler.

Structureer als volgt:
## [KANAAL: Kanaalnaam]
### Variant A
Tekst variant A hier...

### Variant B
Tekst variant B hier...`;
  }

  if (plan && agentId !== "strategist") {
    userMessage += `\n\n## Communicatieplan (van de Strategist)\n${plan}`;
  }

  if (teksten && agentId === "visualAdvisor") {
    userMessage += `\n\n## Teksten (van de Copywriter)\n${teksten}`;
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    res.json({ result: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint: run stakeholder review
app.post("/api/run-stakeholder", async (req, res) => {
  const { apiKey: bodyKey2, stakeholderId, casus, plan, teksten } = req.body;
  const apiKey = bodyKey2 || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(400).json({ error: "API key is vereist" });

  const stakeholder = STAKEHOLDERS[stakeholderId];
  if (!stakeholder)
    return res.status(400).json({ error: "Onbekende stakeholder" });

  let userMessage = `## De situatie\n${casus.beschrijving}\n`;
  userMessage += `\n## Het communicatieplan\n${plan}\n`;
  userMessage += `\n## De teksten die je te zien/lezen krijgt\n${teksten}\n`;
  userMessage += `\nBeoordeel bovenstaande communicatie vanuit jouw perspectief. Wees eerlijk en concreet.`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: stakeholder.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    res.json({ result: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint: revision round
app.post("/api/run-revision", async (req, res) => {
  const { apiKey: bodyKey3, casus, plan, teksten, stakeholderFeedback } = req.body;
  const apiKey = bodyKey3 || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(400).json({ error: "API key is vereist" });

  const systemPrompt = `Je bent een senior copywriter die teksten herziet op basis van stakeholder-feedback.
Je ontvangt de originele teksten en feedback van verschillende stakeholders (ouders, leerlingen, docenten, directie, RvT).

Je taak:
1. Analyseer de feedback en identificeer de belangrijkste verbeterpunten
2. Herschrijf de teksten met verwerking van de feedback
3. Markeer per tekst wat je hebt aangepast en waarom

BELANGRIJK — Structuur je output EXACT als volgt, per kanaal een apart blok:

## [KANAAL: Kanaalnaam]
De herziene tekst voor dit kanaal hier.

*Aanpassingen: korte opsomming van wat er is gewijzigd*

Gebruik dezelfde kanaalnamen als in de originele teksten.
Schrijf GEEN inleiding vóór de kanaalblokken — begin direct met ## [KANAAL: ...].
Wees concreet over wat je hebt veranderd. Lever kant-en-klare herziene teksten.
Schrijf in het Nederlands.`;

  let userMessage = `## Casus\n${casus.beschrijving}\n`;
  userMessage += `\n## Communicatieplan\n${plan}\n`;
  userMessage += `\n## Originele teksten\n${teksten}\n`;
  userMessage += `\n## Stakeholder feedback\n`;

  for (const [stakeholder, feedback] of Object.entries(stakeholderFeedback)) {
    userMessage += `\n### ${stakeholder}\n${feedback}\n`;
  }

  userMessage += `\nVerwerk bovenstaande feedback in herziene teksten. Geef per tekst aan wat je hebt aangepast.`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    res.json({ result: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint: generate image via OpenAI DALL-E
app.post("/api/generate-image", async (req, res) => {
  const { openaiKey: bodyOpenaiKey, prompt, size } = req.body;
  const openaiKey = bodyOpenaiKey || process.env.OPENAI_API_KEY;

  if (!openaiKey)
    return res.status(400).json({ error: "OpenAI API key is vereist" });

  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: size || "1024x1024",
          quality: "standard",
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(
        err.error?.message || "Beeldgeneratie mislukt"
      );
    }

    const data = await response.json();
    res.json({ url: data.data[0].url, revised_prompt: data.data[0].revised_prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logo upload
app.post("/api/upload-logo", upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Geen bestand" });
  const data = readFileSync(req.file.path);
  const base64 = data.toString("base64");
  const mimeType = req.file.mimetype;
  res.json({
    url: `data:${mimeType};base64,${base64}`,
    filename: req.file.originalname,
  });
});

// Check welke API keys server-side beschikbaar zijn
app.get("/api/config", (req, res) => {
  res.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
  });
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`\n🏢 Communicatiebureau draait op http://localhost:${PORT}\n`);
});
