import { spawnSync } from "node:child_process";

const USAGE =
  "Usage: bun .agents/daemons/pr-merge-conflict-repair/scripts/find-conflicted-pulls.ts [--repo <owner/repo>] [--unknown-retries N] [--unknown-retry-delay-ms N] [--max-pages N]";

const HELP_TEXT = `Find open non-draft pull requests with merge conflicts.

${USAGE}

Options:
  --repo <owner/repo>              Optional repository identity. Defaults to the current GitHub repository.
  --unknown-retries N             Optional retries when mergeability is UNKNOWN (default: 2).
  --unknown-retry-delay-ms N       Optional delay between UNKNOWN retries (default: 1500).
  --max-pages N                   Optional open-PR page cap, 100 PRs per page (default: 25).
  -h, --help                      Show this help text.

Notes:
  - Requires: gh.
  - This script is read-only.
  - Candidate discovery includes open PRs targeting any base branch.
`;

const DEFAULT_UNKNOWN_RETRIES = 2;
const DEFAULT_UNKNOWN_RETRY_DELAY_MS = 1500;
const DEFAULT_MAX_PAGES = 25;

const CONFLICTED_PULLS_QUERY = `
query ConflictedPulls($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    nameWithOwner
    defaultBranchRef {
      name
      target {
        oid
      }
    }
    pullRequests(first: 100, after: $cursor, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        number
        title
        url
        isDraft
        baseRefName
        baseRefOid
        headRefName
        headRefOid
        isCrossRepository
        mergeable
        mergeStateStatus
        headRepositoryOwner {
          login
        }
      }
    }
  }
}
`;

type ParsedArgs = Readonly<{
  owner: string;
  repo: string;
  unknownRetries: number;
  unknownRetryDelayMs: number;
  maxPages: number;
}>;

type PullRequestNode = Readonly<{
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRefName: string;
  baseRefOid: string;
  headRefName: string;
  headRefOid: string;
  isCrossRepository: boolean;
  mergeable: string;
  mergeStateStatus: string;
  headRepositoryOwner: string | null;
}>;

type FetchResult = Readonly<{
  repo: string;
  defaultBranch: string;
  defaultBranchOid: string;
  pagesFetched: number;
  pullRequests: readonly PullRequestNode[];
}>;

type OutputPullRequest = Readonly<{
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRefName: string;
  baseRefOid: string;
  headRefName: string;
  headRefOid: string;
  isCrossRepository: boolean;
  headRepositoryOwner: string | null;
  mergeable: string;
  mergeStateStatus: string;
}>;

function parseArgs(argv: readonly string[]): ParsedArgs {
  let repoRaw: string | null = null;
  let unknownRetries = DEFAULT_UNKNOWN_RETRIES;
  let unknownRetryDelayMs = DEFAULT_UNKNOWN_RETRY_DELAY_MS;
  let maxPages = DEFAULT_MAX_PAGES;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (
      token === "--repo" ||
      token === "--unknown-retries" ||
      token === "--unknown-retry-delay-ms" ||
      token === "--max-pages"
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new TypeError(`Missing value for ${token}.\n${USAGE}`);
      }

      if (token === "--repo") {
        repoRaw = value;
      } else if (token === "--unknown-retries") {
        unknownRetries = parseNonNegativeInteger(value, token);
      } else if (token === "--unknown-retry-delay-ms") {
        unknownRetryDelayMs = parseNonNegativeInteger(value, token);
      } else {
        maxPages = parsePositiveInteger(value, token);
      }

      index += 1;
      continue;
    }

    if (token === "-h" || token === "--help") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }

    throw new TypeError(`Unknown argument: ${token}\n${USAGE}`);
  }

  if (!repoRaw) {
    repoRaw = inferCurrentRepository();
  }

  const [owner, repo, extra] = repoRaw.split("/");
  if (!owner || !repo || extra) {
    throw new TypeError(
      `Invalid --repo value: ${repoRaw}. Expected owner/repo.`,
    );
  }

  return {
    owner,
    repo,
    unknownRetries,
    unknownRetryDelayMs,
    maxPages,
  };
}

function inferCurrentRepository(): string {
  const result = spawnSync(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.error) {
    throw new TypeError(
      `Failed to infer repository with gh repo view: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new TypeError(
      stderr.length > 0
        ? `Failed to infer repository with gh repo view: ${stderr}`
        : `Failed to infer repository with gh repo view; pass --repo <owner/repo>.`,
    );
  }

  const repo = result.stdout.trim();
  if (!repo) {
    throw new TypeError(
      `Failed to infer repository with gh repo view; pass --repo <owner/repo>.`,
    );
  }
  return repo;
}

function parseIntegerString(value: string, flag: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new RangeError(`${flag} must be an integer.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new RangeError(`${flag} must be an integer.`);
  }

  return parsed;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = parseIntegerString(value, flag);
  if (parsed <= 0) {
    throw new RangeError(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = parseIntegerString(value, flag);
  if (parsed < 0) {
    throw new RangeError(`${flag} must be a non-negative integer.`);
  }
  return parsed;
}

function runGraphql(args: {
  owner: string;
  repo: string;
  cursor: string | null;
}): string {
  const commandArgs = [
    "api",
    "graphql",
    "-f",
    `query=${CONFLICTED_PULLS_QUERY}`,
    "-F",
    `owner=${args.owner}`,
    "-F",
    `repo=${args.repo}`,
  ];

  if (args.cursor !== null) {
    commandArgs.push("-F", `cursor=${args.cursor}`);
  }

  const result = spawnSync("gh", commandArgs, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw new TypeError(
      `Failed to run gh api graphql: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new TypeError(
      stderr.length > 0
        ? `gh api graphql failed: ${stderr}`
        : `gh api graphql failed with exit code ${String(result.status)}`,
    );
  }

  return result.stdout;
}

function fetchOpenPullRequests(args: ParsedArgs): FetchResult {
  const pullRequests: PullRequestNode[] = [];
  let cursor: string | null = null;
  let pagesFetched = 0;
  let repoNameWithOwner: string | null = null;
  let defaultBranch: string | null = null;
  let defaultBranchOid: string | null = null;

  for (;;) {
    if (pagesFetched >= args.maxPages) {
      throw new RangeError(
        `Open PR scan exceeded --max-pages=${String(args.maxPages)}. Increase --max-pages to scan more than ${String(args.maxPages * 100)} open PRs.`,
      );
    }

    const page = parseGraphqlResponse(
      runGraphql({
        owner: args.owner,
        repo: args.repo,
        cursor,
      }),
    );

    repoNameWithOwner = page.repo;
    defaultBranch = page.defaultBranch;
    defaultBranchOid = page.defaultBranchOid;
    pullRequests.push(...page.pullRequests);
    pagesFetched += 1;

    if (!page.hasNextPage) {
      break;
    }

    cursor = page.endCursor;
    if (cursor === null) {
      throw new TypeError(
        "GitHub reported hasNextPage=true without endCursor.",
      );
    }
  }

  if (
    repoNameWithOwner === null ||
    defaultBranch === null ||
    defaultBranchOid === null
  ) {
    throw new TypeError("GitHub response did not include repository metadata.");
  }

  return {
    repo: repoNameWithOwner,
    defaultBranch,
    defaultBranchOid,
    pagesFetched,
    pullRequests,
  };
}

function parseGraphqlResponse(raw: string): FetchResult &
  Readonly<{
    hasNextPage: boolean;
    endCursor: string | null;
  }> {
  const parsed: unknown = JSON.parse(raw);
  const root = expectRecord(parsed, "response");

  const errors = root.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new TypeError(`GitHub GraphQL errors: ${JSON.stringify(errors)}`);
  }

  const data = expectRecord(root.data, "response.data");
  const repository = expectRecord(data.repository, "response.data.repository");
  const defaultBranchRef = expectRecord(
    repository.defaultBranchRef,
    "repository.defaultBranchRef",
  );
  const defaultBranchTarget = expectRecord(
    defaultBranchRef.target,
    "repository.defaultBranchRef.target",
  );
  const pullRequestsConnection = expectRecord(
    repository.pullRequests,
    "repository.pullRequests",
  );
  const pageInfo = expectRecord(
    pullRequestsConnection.pageInfo,
    "repository.pullRequests.pageInfo",
  );
  const nodes = expectArray(
    pullRequestsConnection.nodes,
    "repository.pullRequests.nodes",
  );

  return {
    repo: expectString(repository.nameWithOwner, "repository.nameWithOwner"),
    defaultBranch: expectString(defaultBranchRef.name, "defaultBranchRef.name"),
    defaultBranchOid: expectString(
      defaultBranchTarget.oid,
      "defaultBranchRef.target.oid",
    ),
    pagesFetched: 1,
    pullRequests: nodes
      .filter((node) => node !== null)
      .map((node, index) =>
        parsePullRequestNode(
          node,
          `repository.pullRequests.nodes[${String(index)}]`,
        ),
      ),
    hasNextPage: expectBoolean(pageInfo.hasNextPage, "pageInfo.hasNextPage"),
    endCursor: expectNullableString(pageInfo.endCursor, "pageInfo.endCursor"),
  };
}

function parsePullRequestNode(value: unknown, path: string): PullRequestNode {
  const record = expectRecord(value, path);
  const ownerRecord =
    record.headRepositoryOwner === null
      ? null
      : expectRecord(record.headRepositoryOwner, `${path}.headRepositoryOwner`);

  return {
    number: expectNumber(record.number, `${path}.number`),
    title: expectString(record.title, `${path}.title`),
    url: expectString(record.url, `${path}.url`),
    isDraft: expectBoolean(record.isDraft, `${path}.isDraft`),
    baseRefName: expectString(record.baseRefName, `${path}.baseRefName`),
    baseRefOid: expectString(record.baseRefOid, `${path}.baseRefOid`),
    headRefName: expectString(record.headRefName, `${path}.headRefName`),
    headRefOid: expectString(record.headRefOid, `${path}.headRefOid`),
    isCrossRepository: expectBoolean(
      record.isCrossRepository,
      `${path}.isCrossRepository`,
    ),
    mergeable: expectString(record.mergeable, `${path}.mergeable`),
    mergeStateStatus: expectString(
      record.mergeStateStatus,
      `${path}.mergeStateStatus`,
    ),
    headRepositoryOwner:
      ownerRecord === null
        ? null
        : expectString(ownerRecord.login, `${path}.headRepositoryOwner.login`),
  };
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array.`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string.`);
  }
  return value;
}

function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return expectString(value, path);
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean.`);
  }
  return value;
}

function formatPullRequest(pr: PullRequestNode): OutputPullRequest {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    baseRefName: pr.baseRefName,
    baseRefOid: pr.baseRefOid,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    isCrossRepository: pr.isCrossRepository,
    headRepositoryOwner: pr.headRepositoryOwner,
    mergeable: pr.mergeable,
    mergeStateStatus: pr.mergeStateStatus,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithUnknownRetries(args: ParsedArgs): Promise<
  FetchResult &
    Readonly<{
      unknownRetriesUsed: number;
    }>
> {
  let result = fetchOpenPullRequests(args);
  let unknownRetriesUsed = 0;

  while (
    unknownRetriesUsed < args.unknownRetries &&
    result.pullRequests.some(
      (pullRequest) =>
        !pullRequest.isDraft && pullRequest.mergeable === "UNKNOWN",
    )
  ) {
    await sleep(args.unknownRetryDelayMs);
    result = fetchOpenPullRequests(args);
    unknownRetriesUsed += 1;
  }

  return {
    ...result,
    unknownRetriesUsed,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await fetchWithUnknownRetries(args);
  const nonDraftPullRequests = result.pullRequests.filter(
    (pullRequest) => !pullRequest.isDraft,
  );
  const conflictedPullRequests = nonDraftPullRequests.filter(
    (pullRequest) => pullRequest.mergeable === "CONFLICTING",
  );
  const unknownPullRequests = nonDraftPullRequests.filter(
    (pullRequest) => pullRequest.mergeable === "UNKNOWN",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        repo: result.repo,
        defaultBranch: result.defaultBranch,
        defaultBranchOid: result.defaultBranchOid,
        collectedAt: new Date().toISOString(),
        scan: {
          pagesFetched: result.pagesFetched,
          maxPages: args.maxPages,
          openPullRequestsScanned: result.pullRequests.length,
          nonDraftOpenPullRequestsScanned: nonDraftPullRequests.length,
          conflictedPullRequestCount: conflictedPullRequests.length,
          unknownPullRequestCount: unknownPullRequests.length,
          unknownRetriesUsed: result.unknownRetriesUsed,
        },
        conflictedPullRequests: conflictedPullRequests.map(formatPullRequest),
        unknownPullRequests: unknownPullRequests.map(formatPullRequest),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown conflicted PR scan error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
