# AGENTS.md

## Project identity
This is the Togba Legacy ERP project.

This is an **existing Google Apps Script web app**.

Locked technology stack:
- Google Apps Script backend (`Code.gs`)
- Google Sheets database
- HTML frontend (`Index.html`)
- GitHub repository for version control
- Stitch design files as UI/UX references only

Do not rebuild this app in React, Next.js, Node.js, Python, or any other stack.

Do not scaffold a new application.

The task is to **modify and enhance the existing app**.

## Source of truth priority
1. `MASTER_HANDOFF_TOGBA_LEGACY_ERP.md`
2. existing repository code
3. `stitch_refs/` design references

## Non-negotiable rules
- Read the entire project before editing anything.
- Treat `MASTER_HANDOFF_TOGBA_LEGACY_ERP.md` as the main architecture brief.
- Preserve backward compatibility at all times.
- Do not rename Google Sheets tabs.
- Do not rename spreadsheet headers.
- Do not reorder columns unless explicitly instructed.
- Do not delete fields, tabs, or working modules.
- Do not rewrite authentication, dashboard loading, finance aggregation, or admin registry.
- Extend the system; do not rebuild it.
- Prefer complete file replacements over snippets whenever practical.
- Explain changes clearly.
- After each phase, provide:
  1. summary of changes
  2. files changed
  3. tests to run
  4. risks or follow-up notes

## Spreadsheet safety
- Assume the Google Sheets workbook is a live production database.
- Validate sheet existence before reading.
- Validate required headers before reading or writing.
- If a header is missing, support legacy aliases before proposing any schema change.
- Never migrate or restructure the database without explicit approval.

## Coding safety
- Preserve existing interfaces and function names unless explicitly told otherwise.
- Add defensive error handling.
- Ensure frontend calls always use success and failure handlers.
- Avoid regressions.
- Keep business logic in `Code.gs`.
- Keep frontend in `Index.html` unless splitting into Apps Script HTML partials is clearly beneficial.

## Stitch design instructions
The `stitch_refs/` folder contains design references.

These references are organized by:
- mobile
- web
- light
- dark

These are **design references only**, not production code.

Codex must:
- inspect all Stitch references before proposing UI changes
- compare the existing UI against the Stitch references
- modify the existing UI to better match the approved Stitch direction
- not copy Stitch files blindly into production

## Responsive and theme rules
There are four design reference sets:
- mobile/light
- mobile/dark
- web/light
- web/dark

Do **not** build four separate apps.

Build **one responsive system** with:
- mobile layout behavior on small screens
- web layout behavior on large screens
- a unified light/dark theme system

Design priority:
- use **web/light** as the main structural/layout reference
- use **mobile** references for interaction, spacing, and touch behavior
- use **dark** references as styling/theme guidance, not as a separate application

## Workflow
- Phase 0 is always audit only.
- Do not code until the audit is approved.
- Do not start the next phase automatically.
- Before each phase, identify which files will be modified and why.
- Keep diffs scoped to the current phase only.

## First task behavior
Before making any code changes:
1. Read the entire repository.
2. Read `MASTER_HANDOFF_TOGBA_LEGACY_ERP.md`.
3. Inspect the contents of `stitch_refs/`.
4. Return an audit of:
   - current UI structure
   - current backend/frontend coupling points
   - working modules
   - incomplete modules
   - schema mismatches
   - UI mismatches versus Stitch references
   - recommended phased implementation plan
5. Wait for approval before coding.
