# 003 Live web mode

The React app keeps the offline demo (GitHub Pages) and adds a Live mode when built with `VITE_API_BASE`:
real sign-in (JWT, refresh), the API's file set in every existing page, an Upload page with pipeline progress,
a Review queue (fields, approvals, mapping proposals) and a System page (architecture, health, usage, eval numbers).

## Acceptance checks
1. Offline build: all existing UI checks pass (`tests/ui_check.js`).
2. Live build: sign in as officer, upload `synth/out/v1/fire_certificate_renewal.pdf` replacing D1, approve it in the
   review queue, and the Overview shows coverage 55.
