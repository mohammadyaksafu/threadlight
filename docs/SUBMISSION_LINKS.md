# Submission form: links

Paste-ready values for the link fields of the submission form. Replace each [FILL].

| Field | Value | Access note |
|---|---|---|
| YouTube Video (required) | [FILL: YouTube link after uploading `recordings/threadlight-demo.mp4` as Unlisted] | Unlisted; anyone with the link can watch. |
| Facebook Video (optional) | Not used. | |
| GitHub Repository | https://github.com/mohammadyaksafu/threadlight | Public. |
| Figma / Design Link (optional) | Not used: the design is implemented directly in the live app (design tokens in `web/src/styles/index.css`). | |
| Demo / Live Links (required) | https://mohammadyaksafu.github.io/threadlight/ | Public. Sign in with a demo account below (one click on the sign-in page). All data is synthetic. Works on desktop and mobile. |
| Other Links | https://github.com/mohammadyaksafu/threadlight/blob/main/docs/ARCHITECTURE.md (implemented vs planned) | |
| Other Links | https://github.com/mohammadyaksafu/threadlight/blob/main/docs/EVALUATION.md (what the tests verify) | |

## Test credentials for judges

The live demo opens on a **demo sign-in** page. These are public, throw-away accounts. This is not real
authentication: the check runs in the browser and only decides which demo buttons are enabled. All data is synthetic.

| Role | Email (username) | Password | What it can do |
|---|---|---|---|
| Compliance Officer | `officer@threadlight.demo` | `Officer-Demo-2026` | Everything: assign, upload, approve and close findings |
| Factory staff | `staff@threadlight.demo` | `Staff-Demo-2026` | Assign and upload evidence; approve/close are blocked |
| Guest (read-only) | `guest@threadlight.demo` | `Guest-Demo-2026` | Browse every page; no workflow actions |

Each account also has a one-click "Demo accounts" button on the sign-in page.

## About the video

- File: `recordings/threadlight-demo.mp4` (1920x1080, 174.6 seconds, under the 181-second limit; structured Problem / Solution / Demo / AI approach / Impact). Not committed to git.
- Recorded automatically from the live site by `tools/video/record.js` (headless Chrome). The slides are
  `tools/video/slides.html` and the narration text is `tools/video/narration.json`.
- The voice is the offline Windows text-to-speech voice "Microsoft Zira Desktop". It is a synthetic voice,
  not a person, and is disclosed in SUBMISSION_FIELDS.md. You can replace it with your own voice by
  recording over the same timeline (see VIDEO_SCRIPT.md).
- No KPI targets, prices or quotes are stated; KPIs are named as what a pilot will measure.

## Uploading to YouTube (Unlisted)

1. YouTube Studio > **Create** > **Upload videos** > choose `recordings/threadlight-demo.mp4`.
2. Title: `ThreadLight: a Verified Evidence Passport for garment factories (prototype demo)`.
3. Description: copy it from the "Title and description" section of VIDEO_SCRIPT.md.
4. Audience: "No, it's not made for kids". Under the **Altered or synthetic content** question, answer
   honestly: the narration is a synthetic text-to-speech voice.
5. Visibility: **Unlisted** > Save. Open the link in a private window to check it plays, then paste it above and into the form.
