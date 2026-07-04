# Run Integration Tests Conditionally Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the GitHub Actions workflow to run integration tests only when integration test files or the workflow itself are updated.

**Architecture:** Use `dorny/paths-filter@v3` inside the `build-and-test.yml` workflow to check for changes to `tests/integration/**` and the workflow itself, then run unit tests only or unit + integration tests accordingly.

**Tech Stack:** GitHub Actions, Vitest, YAML

## Global Constraints

- Conventional commit messages (e.g. `ci: run integration tests conditionally`).
- Create an empty changeset file since this is a CI change and does not require a release.

---

### Task 1: Update GitHub Actions Workflow `build-and-test.yml`

**Files:**

- Modify: `.github/workflows/build-and-test.yml:63-67`

**Interfaces:**

- Consumes: Existing `.github/workflows/build-and-test.yml`
- Produces: Updated workflow with conditional integration testing.

- [ ] **Step 1: Edit the workflow file**
      Update the test execution steps in `.github/workflows/build-and-test.yml` to:

  ```yaml
  - name: Check if integration tests changed
    uses: dorny/paths-filter@v3
    id: filter
    with:
      filters: |
        integration:
          - 'tests/integration/**'
          - '.github/workflows/build-and-test.yml'

  - name: Run tests with coverage (including integration)
    if: steps.filter.outputs.integration == 'true'
    run: npx vitest run --coverage
    env:
      HEVY_API_KEY: ${{ secrets.HEVY_API_KEY }}

  - name: Run tests with coverage (unit only)
    if: steps.filter.outputs.integration != 'true'
    run: npx vitest run --coverage --exclude tests/integration/**
  ```

- [ ] **Step 2: Verify linting and types locally**
      Run commands:

  ```bash
  npm run check
  npm run check:types
  ```

  Expected: Both commands complete successfully without errors.

- [ ] **Step 3: Verify vitest unit tests run locally**
      Run command:
  ```bash
  npx vitest run --coverage --exclude tests/integration/**
  ```
  Expected: All 18 unit/other test files pass (excluding the 2 integration files).

---

### Task 2: Create Changeset and Commit Changes

**Files:**

- Create: `.changeset/<random-name>.md` (via CLI)

**Interfaces:**

- Consumes: Project changes
- Produces: Empty changeset file.

- [ ] **Step 1: Create an empty changeset**
      Run command:

  ```bash
  npx changeset --empty
  ```

  Expected: An empty changeset file is generated in `.changeset/`.

- [ ] **Step 2: Validate the changeset status**
      Run command:

  ```bash
  npm run check:changeset
  ```

  Expected: Command completes successfully.

- [ ] **Step 3: Stage and commit the changes**
      Run commands:

  ```bash
  git add .github/workflows/build-and-test.yml docs/superpowers/specs/2026-07-04-run-integration-tests-conditionally-design.md .changeset/
  git commit -m "ci: run integration tests conditionally in github action"
  ```

  Expected: Commit succeeds with conventional commit format.

- [ ] **Step 4: Push the branch**
      Run command:
  ```bash
  git push origin test/extend-integration-tests
  ```
  Expected: Push succeeds.
