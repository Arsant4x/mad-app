# Work method gates

Gates that guard how the project is run, kept apart from the product tests in
`apps/` and `packages/`. They run in the `process-gates` workflow on every push
and pull request.

| Gate | Guards |
|---|---|
| `registry-decisions-only.test.mjs` | `docs/decisions.md` holds decisions only |
| `registry-numbering.test.mjs` | registry ids are unique; plans and index match |
| `rule-extension-attached.test.mjs` | a decision that extends a rule is attached to it in `CLAUDE.md` |
| `registry-not-with-code.test.mjs` | a branch never mixes the registries with code |

Run locally from the repository root:

```bash
node --test ops/process-gates/*.test.mjs
```

They use `node:test` only, so they need no install.
