# Video script: ThreadLight live demo (122 s, limit 180 s)

Recorded from the **deployed system** at http://165.99.219.251:8095 by `tools/video/record.js`: it signs in through the real
API, uploads a real PDF (`synth/out/v1/fire_certificate_renewal.pdf`), lets the Gemini pipeline run on the server, approves
the document as the Compliance Officer and shows the passport change. Nothing in the demo part is pre-computed. The pipeline
scene is recorded in real time and fast-forwarded to fit its narration; an on-screen label says so. The narration is the
offline Windows voice (Microsoft Zira, `tools/video/tts.ps1`); captions show every line. All data is synthetic.

Re-record: on the server `docker exec threadlight-api-1 python -m backend.db.reset_demo` and
`docker exec threadlight-redis-1 redis-cli FLUSHDB` (so Gemini really runs, not the response cache), then
`powershell -File tools/video/tts.ps1` and `node tools/video/record.js` -> `recordings/threadlight-demo.mp4`.

| Time | Segment | On screen | Narration |
|---|---|---|---|
| 0:00-0:11 | Problem | Problem slide: compliance manager, 30 days before the audit | A garment factory in Bangladesh, thirty days before a buyer audit. Its fire safety certificate expires before the auditor arrives, and the proof sits in scattered P D Fs. |
| 0:11-0:20 | Live demo | Live site http://165.99.219.251:8095: "Live API" selected, sign in as Compliance Officer | This is ThreadLight, running live on our server. We sign in to the real A P I as the compliance officer. All data is synthetic. |
| 0:20-0:30 | Live demo | Overview from the database: coverage 29%, risk index 63 | The passport comes from the database: coverage is 29 percent, and the risk index is 63. The fire certificate expires before the audit. |
| 0:30-0:38 | Live demo | Upload page: "Replaces document: D1", choose `fire_certificate_renewal.pdf` | Now we upload a real P D F: the renewed fire certificate, replacing D 1. |
| 0:38-0:57 | Live demo | Pipeline progress chips (stored, parse, PII redaction, classify, extract, validate, index, map clauses, rules engine, awaiting approval); real run fast-forwarded, labelled on screen | The pipeline runs live. It reads the text, hides personal data, classifies the document, and Gemini extracts the fields, each with a quote and page number. Every field is checked against the page. Then it is indexed for search, and the rules engine runs again. Fast forward. |
| 0:57-1:08 | Live demo | Review queue: extracted type, reference, entity, dates; proposed clause mappings; click Approve | The document now waits for a person. The officer sees exactly what was extracted, and approves it. The A I can never approve or close anything. |
| 1:08-1:17 | Live demo | Overview after approval: coverage 55%, then Findings | After approval, the rules re-run: the fire safety requirements are supported, and coverage rises from 29 to 55 percent. |
| 1:17-1:35 | AI approach | System page: live service health, data flow, stack, evaluation numbers | Under the hood: OCR for scans and Bangla, Gemini for extraction and bilingual drafts, hybrid search with pgvector, a LangGraph pipeline with human approval steps, and an MCP server for buyers and auditors. Every model call is logged, and the evaluation results are shown here. |
| 1:35-1:48 | AI approach | AI approach slide: input -> AI -> decide -> output, every stage live | Models read. Rules decide. People approve. Models only extract cited fields and draft text; deterministic rules decide every status; and a named person approves the evidence. |
| 1:48-2:01 | Impact | Impact KPIs, next steps, live address and code link | The result: fewer audit surprises, and fixes you can prove. Next, a pilot with export factories on real documents. ThreadLight: evidence you can verify, before the auditor asks. |

Recorded 2026-10-27: the real pipeline took 37 s from upload to the approval step (extraction by `gemini-3.5-flash-lite`),
shown in 19 s; coverage went 29% -> 55% after approval. The demo was reset to its starting state afterwards.
