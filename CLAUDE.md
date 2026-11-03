# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

`issue-ops-lab` is an operations lab, not an application: no server, no frontend, no tests. It demonstrates issue hygiene where the **native GitHub Project is the single source of truth** for status. Canonical board: https://github.com/users/DataManagement666/projects/1 (owned by the user, not the repo). All issue data is synthetic.

The repo owns only:

- `.github/labels.json` — manifest for type/domain labels
- `.github/ISSUE_TEMPLATE/` — bug and verification forms
- `scripts/sync-labels.mjs` + `scripts/lib/github.mjs` — label sync
- `README.md` and `docs/PROJECT.md` — status model, field/view config, migration steps (written in Chinese)

## Commands

Node 20 in CI; no dependencies to install and no build/lint/test steps.

```bash
export GITHUB_TOKEN="$(gh auth token)"
export GITHUB_REPOSITORY="DataManagement666/issue-ops-lab"
npm run labels    # node scripts/sync-labels.mjs
```

- Run from the repo root — the script resolves `.github/labels.json` relative to the cwd.
- `.github/workflows/sync-labels.yml` runs the same script on pushes to `main` that touch the manifest, script, or workflow, and via `workflow_dispatch`; it uses the built-in `GITHUB_TOKEN` with `issues: write`.
- The script only creates/updates labels. It never deletes labels (including ones removed from the manifest); deletes are manual.

## Architecture / data flow

`.github/labels.json` → `scripts/sync-labels.mjs` → `scripts/lib/github.mjs` → GitHub REST.

`scripts/lib/github.mjs` is a dependency-free `fetch` wrapper (`api`, `paginate` following `Link: rel="next"`, `requireEnv`). `labelsOf`/`hasLabel` are exported but unused — leftovers from the retired label state machine.

Issue templates capture type/domain labels and push status decisions to the Project: `bug.yml` requires environment, repro steps, expected/acceptance criteria, and evidence; `verification.yml` records pass/fail evidence only. `config.yml` disables blank issues and links the Project.

## Domain rules to preserve

State lives in Project fields, never in issue labels:

- Status: Open / Partial / Blocked / Verifying / Closed / Not planned
- Priority: P1 / P2 / P3
- Next owner, Waiting on: Frontend / Backend / Product / Data / Tester
- Scope: User API / Admin API / User UI / Admin UI / Docs / Data
- Next step, Evidence: free text

Semantics:

- **Closed means verification passed**, not merged. The `Pull request merged` workflow was deliberately removed; a merged PR is not acceptance, and `Closed` is set by the tester/acceptance owner, not by developer self-test.
- **Partial** = one side done, the other missing (set `Waiting on`); **Blocked** = external dependency (explain in `Next step`); **Verifying** = development done and self-checked, awaiting acceptance; **Not planned** = product decision/duplicate/invalid, with rationale in an issue comment.
- Closing an issue auto-sets Status to Closed (Item closed workflow). There is no Item reopened workflow, so reopening requires manually setting Status back to Open / Partial / Verifying.
- Auto-add to project is **not yet enabled**; it must be added/configured in the Project UI.
- Built-in Project workflows and view grouping/sorting are UI-only configuration, not in git. The public Projects API cannot set grouping/sorting, and `GITHUB_TOKEN` cannot read/write Projects v2; custom automation would need a PAT/GitHub App — deliberately avoided.

Never reintroduce `status/*`, `priority/*`, `owner/*`, `scope/*`, or `verified` labels, and do not resurrect the retired Pages dashboard, generated dashboard, label-based state machine, or `issue-ops` workflow (removed in `2d515cc`).

## Keeping docs consistent

`README.md` and `docs/PROJECT.md` both document the fields, views, workflows, and verification results, and are updated together. Keep user-facing docs in Chinese; update both files when a field, view, workflow, or status rule changes. `docs/PROJECT.md` is the canonical migration reference: Projects belong to a user/org, so a Project cannot be moved into a repository — fields, views, and workflows must be recreated, and the repo files listed there copied over.
