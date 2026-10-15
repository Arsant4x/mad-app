# Work method gates

Gates that guard how the project is run, kept apart from the product tests in
`apps/` and `packages/`. They run in the `process-gates` workflow on every push
and pull request.

| Gate | Guards |
|---|---|
| `registry-decisions-only.test.mjs` | `docs/decisions.md` holds decisions only |
| `registry-numbering.test.mjs` | registry ids are unique; plans and index match |
| `rule-extension-attached.test.mjs` | a decision that extends a rule is attached to it in `CLAUDE.md` |
| `decision-research-linked.test.mjs` | every decision from 1705 on names an existing research file under `docs/research/` with the required headings |
| `registry-not-with-code.test.mjs` | a branch never mixes the registries with code |
| `attribution-ci.test.mjs` | no agent signature in a pull request title, description, commits or merge message |
| `commit-msg-attribution.test.mjs` | the commit-msg hook removes signature lines, and the tool signature is off |
| `hooks-present.test.mjs` | the agent's working gates in `.claude/hooks` exist and are wired |
| `edit-while-reading.test.mjs` | the "no edit to a tree while it is read" gate works, proven by running it |

The gates that guard the product itself stay with the product tests in
`apps/api/src/common`: test quality (`no-silent-skip`, `test-budget-declared`,
`test-explicit-timeouts`, `live-guard-precheck`, `guard-reads-declared`), the CI
split (`ci-split`), search locale in scripts (`locale-gate`), secrets on command
lines (`shell-argv-secrets`) and the derived SPEC status (`spec-tags`).

Run locally from the repository root:

```bash
node --test ops/process-gates/*.test.mjs
```

They use `node:test` only, so they need no install.
