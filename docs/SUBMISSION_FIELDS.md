# Submission form: draft answers

Draft text for the International AI Builders Congress submission form (deadline 2026-10-31).
Replace every [FILL] before submitting.

## Data & AI Provenance

**Data.** All data in the ThreadLight prototype is synthetic and was generated for this project:
the factory ("Sample Apparel Ltd."), buyer ("Buyer A (synthetic)"), framework ("Buyer A Code of
Conduct v3.2 (synthetic)"), all eight requirements, six documents, reference numbers, dates,
source file names, page numbers and extraction-confidence values. No real company, buyer, standard
or worker data is used. No personal data is collected; the web app runs entirely in the browser and
stores only an optional theme preference and the chosen demo role (for the current tab) in the viewer's
own browser.

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

**AI used to build it.** The code, tests, documentation and video tooling were written with Claude Code
(Anthropic's agentic coding tool) running Claude Opus 5.5, directed by the team through a written
specification and follow-up prompts. The agent ran the test suites itself: 37 Python unit tests, a
7-scenario Python/TypeScript parity test, and an 80-check headless-browser UI test. The same tests run in
GitHub Actions on every push before deployment. The Bangla report text was generated from templates and
still needs review by a native speaker. [FILL: any other AI tool you used, and any manual review or edits
the team made.] Full detail: docs/AI_USAGE.md.

**Demo video.** The pitch video was recorded automatically from the live site with a headless-browser
script (`tools/video/record.js`). Its narration is a synthetic text-to-speech voice (the offline Windows
voice "Microsoft Zira Desktop"), not a recorded person. Figures quoted in it come from docs/REFERENCES.md.

## Tooling & IDE

- Editor / IDE: Claude Code (terminal CLI) on Windows. [FILL: add any editor you also used, e.g. VS Code]
- AI tools: Claude Code with Claude Opus 5.5 for code, tests, docs and the video script. [FILL: any other AI tool you used]
- Languages: Python 3 (standard library only), TypeScript 5 (strict)
- Frontend: React 18, Tailwind CSS 3, Vite 6, lucide-react icons
- Testing: Python `unittest`; Node.js for the parity test; headless Chrome/Edge via the DevTools protocol for the UI check
- Build: `tsc -b && vite build`; CI on GitHub Actions (tests, parity, build, deploy)
- Video: headless Chrome (DevTools protocol) + FFmpeg; offline Windows text-to-speech narration
- Hosting: GitHub Pages, https://mohammadyaksafu.github.io/threadlight/
- Fonts: Google Fonts (Schibsted Grotesk, IBM Plex Mono, Noto Sans Bengali), the only external request
- Version control: Git / GitHub, https://github.com/mohammadyaksafu/threadlight
