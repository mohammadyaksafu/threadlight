# Submission form: draft answers

Draft text for the International AI Builders Congress submission form (deadline 2026-10-31).
Replace every [FILL] before submitting.

## Data & AI Provenance

**Data.** All data in the ThreadLight prototype is synthetic and was generated for this project:
the factory ("Sample Apparel Ltd."), buyer ("Buyer A (synthetic)"), framework ("Buyer A Code of
Conduct v3.2 (synthetic)"), all eight requirements, six documents, reference numbers, dates,
source file names, page numbers and extraction-confidence values. No real company, buyer, standard
or worker data is used. No personal data is collected; the web app runs entirely in the browser and
stores nothing except an optional theme preference in the viewer's own browser.

**Public figures.** Market and regulatory context in our pitch comes from five cited public
sources (Fibre2Fashion and Dhaka Tribune reporting EPB export data, the RMG Sustainability
Council June 2025 monthly report, UNI, and DLA Piper on CSDDD Omnibus I), listed in
docs/REFERENCES.md with their caveats.

**AI in the product.** The demo makes no language-model, OCR or network API calls. All
statuses, alerts, scores, plans and the bilingual report come from deterministic rules
(Python, with a TypeScript port checked for identical output by a parity test). Steps that the
full design would perform with OCR or a language model (reading documents, extracting clauses)
are shown as pre-extracted sample results and labelled as such in the UI. The risk number is a
decision-support index, not an audit score or probability.

**AI used to build it.** AI coding assistants helped write code and documentation:
[FILL: exact tools and models, e.g. the assistant name and model version you used]. All code
was reviewed and run by the team; tests (37 unit tests, a 7-scenario parity test and a
headless-browser UI check) were run locally before submission. [FILL: anything written or
translated by a person, e.g. who reviewed the Bangla text]

## Tooling & IDE

- Editor / IDE: [FILL: e.g. the editor you used]
- AI tools: [FILL: AI assistants and models actually used, and for what]
- Languages: Python 3 (standard library only), TypeScript 5 (strict)
- Frontend: React 18, Tailwind CSS 3, Vite 6, lucide-react icons
- Testing: Python `unittest`; Node.js for the parity test; headless Chrome/Edge via the DevTools protocol for the UI check
- Build: `tsc -b && vite build`; CI on GitHub Actions (tests, parity, build, deploy)
- Hosting: GitHub Pages, https://mohammadyaksafu.github.io/threadlight/
- Fonts: Google Fonts (Schibsted Grotesk, IBM Plex Mono, Noto Sans Bengali), the only external request
- Version control: Git / GitHub, https://github.com/mohammadyaksafu/threadlight
