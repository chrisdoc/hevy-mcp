/**
 * Generated by Kubb (https://kubb.dev/).
 * Do not edit manually.
 */

import type { PostRoutinesRequestExercise } from '../types/PostRoutinesRequestExercise.ts'
import { createPostRoutinesRequestSet } from './createPostRoutinesRequestSet.ts'
import { faker } from '@faker-js/faker'

export function createPostRoutinesRequestExercise(data?: Partial<PostRoutinesRequestExercise>): PostRoutinesRequestExercise {
  return {
    ...{
      exercise_template_id: faker.string.alpha(),
      superset_id: faker.number.int(),
      rest_seconds: faker.number.int(),
      notes: faker.string.alpha(),
      sets: faker.helpers.multiple(() => createPostRoutinesRequestSet()),
    },
    ...(data || {}),
  }
}