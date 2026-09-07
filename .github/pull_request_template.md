## What

<!-- One paragraph: behavior change, reason, linked issue. -->

## Validation

- [ ] `pnpm run check`, `check:types`, `build`, `test:pr`, `test:performance`, `check:changeset`
- [ ] Narrow lanes for the touched area (see CONTRIBUTING.md)

## Release impact

<!-- Changeset cascade: client change bumps client+operations+core+node+worker+cli;
core change bumps core+node+worker+cli; adapter-only bumps its package.
Delete the rows that do not apply. -->

- [ ] Changeset added naming every affected package (or `--empty` with justification)
- [ ] Live canary run (`test:live`), or why it is not appropriate
- [ ] Token budget measured (`measure:tokens`), or why schemas/text are unaffected
