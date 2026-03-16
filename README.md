# AI Communicatiebureau

Multi-agent communicatietool. Beschrijf een casus en laat AI-collega's samenwerken aan een communicatieplan, teksten, visuals en stakeholder-reviews.

## Installatie

```bash
git clone https://github.com/rhodymatthijs/communicatiebureau.git
cd communicatiebureau
npm install
cp .env.example .env
```

Vul je API keys in in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-jouw-key-hier
OPENAI_API_KEY=sk-jouw-key-hier
```

- **Anthropic** — voor alle tekstgeneratie → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- **OpenAI** — voor beeldgeneratie (DALL-E 3) → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

## Starten

```bash
npm start
```

Open [http://localhost:3456](http://localhost:3456)

## Het team

| Agent | Rol |
|-------|-----|
| Rhody Matthijs | Strategist — communicatieplan & planning |
| Joost Bakker | Copywriter — teksten per kanaal |
| Sophie de Groot | Visual Advisor — beeldrichting & prompts |

## Stakeholders

Synthetische reviewers die de output beoordelen vanuit hun perspectief:

- **Annemarie Kuiper** — ouder/verzorger
- **Thomas Jansen** — leerling
- **Linda Peters** — docent
- **Robert van der Helm** — directeur/rector
- **Elisabeth Brouwer** — Raad van Toezicht
