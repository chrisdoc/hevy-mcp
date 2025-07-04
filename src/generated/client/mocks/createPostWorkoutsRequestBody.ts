/**
 * Generated by Kubb (https://kubb.dev/).
 * Do not edit manually.
 */

import type { PostWorkoutsRequestBody } from '../types/PostWorkoutsRequestBody.ts'
import { createPostWorkoutsRequestExercise } from './createPostWorkoutsRequestExercise.ts'
import { faker } from '@faker-js/faker'

export function createPostWorkoutsRequestBody(data?: Partial<PostWorkoutsRequestBody>): PostWorkoutsRequestBody {
  return {
    ...{
      workout: {
        title: faker.string.alpha(),
        description: faker.string.alpha(),
        start_time: faker.string.alpha(),
        end_time: faker.string.alpha(),
        is_private: faker.datatype.boolean(),
        exercises: faker.helpers.multiple(() => createPostWorkoutsRequestExercise()),
      },
    },
    ...(data || {}),
  }
}