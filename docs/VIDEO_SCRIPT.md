# Video script: ThreadLight (target 170 s, hard limit 181 s)

Speaking pace assumed: about 2.5 words per second. Word counts are given per segment so you can
check timing; the voiceover totals about 400 words (about 160 s) plus pauses.

Before recording: run `npm run build && npm run preview` in `web/` (or use the GitHub Pages URL),
open the printed URL, click **Reset to baseline** on the R1 workflow page, then reload so it opens on the Overview page with theme "auto" in light mode. Browser window 1920x1080.

---

## 0:00-0:15 Hook (about 35 words)

**On screen:** Findings tab, header visible: "Days to audit 30", "Evidence coverage 29%". Slow zoom on R1 card ("Likely gap").

**Voiceover:**
"This is a garment factory thirty days before a buyer audit. Its fire safety certificate
expires eleven days before the auditor arrives. Nobody has noticed yet. Two requirements will
fail because of one document."

## 0:15-0:35 Problem (about 50 words)

**On screen:** Title card, two numbers with source names in small text underneath:
- "83.29% of Bangladesh's $48.28B exports in FY2024-25 were apparel and home textiles" (Source: EPB data via Fibre2Fashion)
- "800 of 1,875 RSC-covered factories had completed structural remediation by June 2025" (Source: RMG Sustainability Council, June 2025 report; structural remediation only)

**Voiceover:**
"Apparel and home textiles were 83.29 percent of Bangladesh's exports in fiscal year 2024-25. Buyers
demand proof of safety, wages and remediation. By June 2025, 800 of 1,875 factories covered by
the RMG Sustainability Council had completed structural remediation. The evidence lives in
scattered PDFs, and gaps surface during the audit."

## 0:35-0:50 Solution (about 37 words)

**On screen:** Header with banner "Synthetic data. Rules run live in your browser...". Cursor points at the banner.

**Voiceover:**
"ThreadLight builds a Verified Evidence Passport. Every buyer requirement is linked to its
evidence in a graph, every finding cites its source, and nothing is closed until a named
person approves it. Everything you see uses synthetic data."

## 0:50-2:05 Live demo (about 180 words, 75 s)

| Time | Click path (exact) | Voiceover |
|---|---|---|
| 0:50 | In the sidebar click **Documents**. Click **Run analysis**. Wait for all 7 agents to light (about 3 s). | "Six documents. The two extraction steps are pre-computed samples here; the five rule stages run live in the browser." |
| 1:00 | Sidebar **Evidence graph**. Click node **D1 Fire Safety Certificate**. | "One certificate, two requirements: if it lapses, both fail together." |
| 1:08 | Sidebar **Findings**. Click the **R1** row (detail page), go back, then click **Integrity alerts** and point at **A2**, then **A3**. | "R1: the certificate expires before the audit. A2: the safety minutes cite a certificate number that is not on file. A3: an emergency-exit fix marked complete, with no proof. These are integrity alerts to check, not accusations." |
| 1:25 | Sidebar **Simulate**. Drag the slider right to about 2026-12-31, then click preset **Day before audit**, then **Audit day**. | "What if the certificate is renewed? Coverage jumps from 29 to 55. One day short of the audit, it drops back." |
| 1:38 | Sidebar **Actions**, then the **Finding R1 workflow** card. Click **Assign to Safety & Maintenance**. Click **Upload renewed certificate (sample file)**. | "The plan ranks the work by owner and due date. We assign it, and upload the renewal. The rules recheck: R1 and R5 are now pending human review. Coverage stays at 29." |
| 1:50 | Click **Close finding** (it is locked). Pause on the red message "AI cannot close this finding". | "Can the system close it on its own? No." |
| 1:55 | Click **Approve as Compliance Officer**. Then click **Close finding**. | "A named compliance officer approves. Now coverage is 55, and the officer closes it." |
| 2:00 | Sidebar **Report**. Click **বাংলা**. Scroll to the footer line. | "The report separates verified from open, in English or Bangla. It is a draft for human review, not an audit result." |

## 2:05-2:30 How the AI decides (about 60 words)

**On screen:** Simple slide with four lines, then a two-column slide "Implemented now" / "Planned" (copy from docs/ARCHITECTURE.md).

**Voiceover:**
"How does it decide? Rules decide dates, coverage and status. Models only read text. Every
finding is cited to a file and page, and humans approve every closure. Today, the rules engine,
graph, risk index, what-if, approval loop and bilingual report are implemented and tested. OCR,
language-model extraction, retrieval and drafting are planned next."

## 2:30-2:50 Business model and pilot (about 45 words)

**On screen:** Slide: "Who pays: [FILL]", "Price: [FILL]", "Pilot: [FILL number] factories, [FILL] weeks". Optional interview quote: [FILL: real quote with permission and attribution, or remove].

**Voiceover:**
"Factories pay [FILL: pricing model] per [FILL: unit]. Our pilot plan: [FILL: number] factories
over [FILL: weeks], measuring extraction accuracy, missed issues and preparation time against a
compliance officer's own review. [FILL: one sentence from a real interview, with permission, or delete.]"

## 2:50-3:00 Close and ask (about 25 words)

**On screen:** ThreadLight logo, https://github.com/mohammadyaksafu/threadlight, contact [FILL].

**Voiceover:**
"We are looking for pilot factories and NRB advisors who know compliance. ThreadLight: evidence
you can verify, before the auditor asks."

---

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
