# Historical anti-slop migration

This note records the initial rollout and is not the source of current lint
policy. See [the anti-slop policy review](anti-slop-policy-review.md) for the
current rule inventory, decisions, and validation guidance.

## First migration batch

The initial migration changed omission-preserving response projection helpers
in `packages/core/src/utils/response-contracts.ts` to `optionalProperty()`.
That helper kept absent and `null` values omitted from serialized response
objects; changing these to `key: undefined` would have altered the in-memory
contract and risked changing downstream serialization behavior.
