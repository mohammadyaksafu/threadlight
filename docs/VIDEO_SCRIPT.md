# Video script: ThreadLight (174.6 s, limit 181 s)

Structured to the "Vibe to Production in 180 Seconds" standard: Problem, Solution, Demo, AI approach,
Impact. The recorded video (`recordings/threadlight-demo.mp4`) is generated from this script by
`tools/video/record.js`: the narration text is `tools/video/narration.json`, the slides are
`tools/video/slides.html`, and every demo shot is recorded from the live site. A segment label
("1 Problem" ... "5 Impact & next") sits in the top-right corner of every shot so judges can follow
the structure, and captions show the narration.

The narration is a synthetic text-to-speech voice (Windows "Microsoft Zira Desktop"). For more energy,
record your own voice over the same lines and timings; see "Re-recording with your own voice" below.

| Time | Segment | On screen | Mandatory item covered |
|---|---|---|---|
| 0:00-0:28 | 1 Problem | User slide (compliance manager, 30 days before audit) then urgency slide: 83.29% of exports, 49.82% to the EU, CSDDD from 2029, each with its source | Problem, target user, urgency (Bangladesh + global) |
| 0:28-0:53 | 2 Solution | Live Overview page | AI-driven solution and differentiation |
| 0:53-2:00 | 3 Demo | Live app: Documents (Run analysis) > Evidence graph (D1) > R1 detail > Integrity alerts > Simulate > R1 workflow (assign, upload, close blocked, approve, close) > Report in Bangla | Working prototype, Bangla localisation |
| 2:00-2:29 | 4 AI approach | Pipeline slide: Input > AI layer (OCR + LLM extraction, RAG matching, knowledge graph) > Rules > Output > human approval, each tagged live or planned | AI-native approach, system flow input > AI > output |
| 2:29-2:55 | 5 Impact & next | KPI and next-step slide with live demo and code links | Impact KPIs, next step |

## Narration

**1 Problem (0:00-0:28)**
"Meet the compliance manager of an export garment factory in Bangladesh, thirty days before a buyer
audit. The fire safety certificate expires before the auditor arrives, and nobody has noticed yet.
Apparel and home textiles are 83 percent of Bangladesh's exports, and the EU buys about half of its
garments. Buyers demand proof, and EU due-diligence rules raise the bar. Yet the proof lives in
scattered PDFs, and gaps surface during the audit."

**2 Solution (0:28-0:53)**
"ThreadLight is an AI compliance copilot. It reads the factory's documents, links every buyer
requirement to its evidence in a graph, flags gaps and contradictions with a cited source, plans the
fixes, and writes the report in English and Bangla. The difference: rules, not the model, decide dates
and status, and only a named person can close a finding. Everything in this demo uses synthetic data."

**3 Demo (0:53-2:00)**
"Six documents come in. Here, extraction is a pre-computed sample; the rule stages run live.
One fire certificate supports two requirements. If it lapses, both fail.
Every finding cites its source. Integrity alerts catch a certificate number that is not on file, and a
fix marked complete with no proof.
Renew the certificate, and coverage jumps from 29 to 55 percent.
We assign it and upload the renewal. It is pending human review, so coverage stays at 29. The system
cannot close it. A named compliance officer approves, and only then can it close.
The report separates verified from open, in English or Bangla."

**4 AI approach (2:00-2:29)**
"Under the hood: input is certificates, scans and buyer codes, in English or Bangla. OCR and a language
model extract fields as structured data with page citations. Retrieval-augmented matching links each
clause to candidate evidence, and a knowledge graph ties them together. Deterministic rules decide the
status, and a model drafts bilingual explanations for a person to approve. Today the graph, rules and
report run live; extraction and retrieval are next."

**5 Impact & next step (2:29-2:55)**
"The value is fewer audit surprises and faster, provable fixes. In a pilot we will measure
evidence-preparation hours, the share of requirements with cited, in-date evidence, issues found
before the audit, and time to an approved closure. Next: pilot with export factories, real OCR and
retrieval, and Bangla document reading. ThreadLight: evidence you can verify, before the auditor asks."

No KPI targets, prices or interview quotes are stated: those are [FILL] until a pilot provides them.

## Regenerating the video

From the repository root on Windows (needs Chrome, ffmpeg and Node 22+):

```
powershell -File tools/video/tts.ps1
node tools/video/record.js
```

The recorder refuses to build a video longer than 179 seconds.

## Re-recording with your own voice

Record each narration block above as its own audio file (WAV), name it after the `id` in
`tools/video/narration.json` (for example `p1_user.wav`), put the files in `tools/video/audio/`, and run
`node tools/video/record.js` (skip the `tts.ps1` step). Scene lengths follow your recordings; keep the
total under 179 seconds.

## Recording tips

- Record at 1920x1080 (1080p), 30 fps. Browser zoom 110-125% so text is readable on a phone.
- Use a clean browser profile or guest window: hide the bookmarks bar (Ctrl+Shift+B), close
  other tabs, turn off notifications, hide extensions.
- Record the screen first without voice, following the click path; then record the voice
  separately with a headset or USB mic in a quiet room and align it in the editor. It is easier
  to hit the timing.
- Move the cursor slowly; pause half a second after each click so viewers see the result.
- Keep the synthetic-data banner visible in at least the opening and demo shots.
- Check the final length is under 3:01 (181 s) before upload.
- Free tools: OBS Studio for screen capture; Audacity for voice; DaVinci Resolve or Clipchamp to edit.

## Uploading as Unlisted on YouTube

1. YouTube Studio > **Create** > **Upload videos** > select the file.
2. Add title and description (below). Audience: "No, it's not made for kids".
3. Under **Visibility** choose **Unlisted** (anyone with the link can watch; it is not searchable).
4. Click **Save**, copy the link, and open it in a private window to confirm it plays.
5. Paste the link into the submission form. [FILL: YouTube link]

## Title and description

**Title:** ThreadLight: a Verified Evidence Passport for garment factories (prototype demo)

**Description:**
ThreadLight helps garment exporters prove compliance before an audit. This 3-minute demo shows
a synthetic factory 30 days before an audit: an expiring fire certificate that affects two
requirements, an evidence-integrity alert, a what-if simulation, a human-approved closure loop
and a bilingual English/Bangla report.

All data in this demo is synthetic. The demo runs deterministic rules in the browser and makes
no language-model calls; extraction results are pre-computed samples. The risk figure is a
decision-support index, not an audit score.

Built for the International AI Builders Congress (JusticeSphere AI > ComplianceOS).
Code and docs: https://github.com/mohammadyaksafu/threadlight · Live demo: https://mohammadyaksafu.github.io/threadlight/
Sources for the figures quoted: see docs/REFERENCES.md in the repository.
