# Design Spec: Run Integration Tests Conditionally

## Problem Statement

Integration tests in the `hevy-mcp` project interface with the live Hevy API. Running them on every single push or pull request to the `main` branch consumes external API rate limits and causes unnecessary overhead when changes are only made to unit tests, documentation, or other code areas. We want to only run integration tests when integration tests themselves (or the CI workflow) are updated.

## Proposed Solution

We will modify the GitHub Actions workflow `build-and-test.yml` to conditionally run integration tests.

1. Use `dorny/paths-filter@v3` to detect changes under `tests/integration/**` and `.github/workflows/build-and-test.yml`.
2. Split test execution into two conditional steps:
   - **Case A (Integration Tests Updated)**: Run all tests (including integration tests) with coverage.
   - **Case B (Integration Tests NOT Updated)**: Run only unit/other tests (excluding integration tests) with coverage.

## Detailed Design

### Changes to `.github/workflows/build-and-test.yml`

We will insert a path filter step and split the `Run tests with coverage` step:

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

## Verification Plan

### Manual Verification

1. Verify the project builds and runs type check locally:
   ```bash
   npm run build
   npm run check
   npm run check:types
   ```
2. Verify unit tests run successfully when excluding integration tests:
   ```bash
   npx vitest run --exclude tests/integration/**
   ```

### CI Verification

Once pushed, GitHub Actions will:

- Check if `tests/integration/**` or the workflow itself changed (which is true in this PR/push).
- Run the full test suite including integration tests.
