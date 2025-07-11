/**
 * Generated by Kubb (https://kubb.dev/).
 * Do not edit manually.
 */

import { postWorkoutsRequestBodySchema } from './postWorkoutsRequestBodySchema.ts'
import { workoutSchema } from './workoutSchema.ts'
import { z } from 'zod'

export const putV1WorkoutsWorkoutidPathParamsSchema = z.object({
  workoutId: z.any(),
})

export const putV1WorkoutsWorkoutidHeaderParamsSchema = z.object({
  'api-key': z.string().uuid(),
})

/**
 * @description The workout was successfully updated
 */
export const putV1WorkoutsWorkoutid200Schema = z.lazy(() => workoutSchema)

/**
 * @description Invalid request body
 */
export const putV1WorkoutsWorkoutid400Schema = z.object({
  error: z.string().describe('Error message').optional(),
})

export const putV1WorkoutsWorkoutidMutationRequestSchema = z.lazy(() => postWorkoutsRequestBodySchema)

export const putV1WorkoutsWorkoutidMutationResponseSchema = z.lazy(() => putV1WorkoutsWorkoutid200Schema)