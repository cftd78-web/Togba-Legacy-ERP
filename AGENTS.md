# AGENTS.md

## Project identity
This is the Togba Legacy ERP project.

## Non-negotiable rules
- Read the entire project folder before editing anything.
- Treat MASTER_HANDOFF_TOGBA_LEGACY_ERP.md as the primary architecture brief.
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
- If a header is missing, add support for legacy aliases before proposing any schema change.
- Never migrate or restructure the database without explicit approval.

## Coding safety
- Preserve existing interfaces and function names unless explicitly told otherwise.
- Add defensive error handling.
- Ensure frontend calls always use success and failure handlers.
- Avoid regressions.

## Workflow
- Phase 0 is always audit only.
- Do not code until the audit is approved.
- Do not start the next phase automatically.