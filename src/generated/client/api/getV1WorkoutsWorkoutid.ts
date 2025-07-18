/**
 * Generated by Kubb (https://kubb.dev/).
 * Do not edit manually.
 */

import fetch from '@kubb/plugin-client/clients/axios'
import type {
  GetV1WorkoutsWorkoutidQueryResponse,
  GetV1WorkoutsWorkoutidPathParams,
  GetV1WorkoutsWorkoutidHeaderParams,
  GetV1WorkoutsWorkoutid404,
} from '../types/GetV1WorkoutsWorkoutid.ts'
import type { RequestConfig, ResponseErrorConfig } from '@kubb/plugin-client/clients/axios'

function getGetV1WorkoutsWorkoutidUrl(workoutId: GetV1WorkoutsWorkoutidPathParams['workoutId']) {
  return `/v1/workouts/${workoutId}` as const
}

/**
 * @summary Get a single workout’s complete details by the workoutId
 * {@link /v1/workouts/:workoutId}
 */
export async function getV1WorkoutsWorkoutid(
  workoutId: GetV1WorkoutsWorkoutidPathParams['workoutId'],
  headers: GetV1WorkoutsWorkoutidHeaderParams,
  config: Partial<RequestConfig> & { client?: typeof fetch } = {},
) {
  const { client: request = fetch, ...requestConfig } = config

  const res = await request<GetV1WorkoutsWorkoutidQueryResponse, ResponseErrorConfig<GetV1WorkoutsWorkoutid404>, unknown>({
    method: 'GET',
    url: getGetV1WorkoutsWorkoutidUrl(workoutId).toString(),
    ...requestConfig,
    headers: { ...headers, ...requestConfig.headers },
  })
  return res.data
}