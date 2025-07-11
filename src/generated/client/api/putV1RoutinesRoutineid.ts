/**
 * Generated by Kubb (https://kubb.dev/).
 * Do not edit manually.
 */

import fetch from '@kubb/plugin-client/clients/axios'
import type {
  PutV1RoutinesRoutineidMutationRequest,
  PutV1RoutinesRoutineidMutationResponse,
  PutV1RoutinesRoutineidPathParams,
  PutV1RoutinesRoutineidHeaderParams,
  PutV1RoutinesRoutineid400,
  PutV1RoutinesRoutineid404,
} from '../types/PutV1RoutinesRoutineid.ts'
import type { RequestConfig, ResponseErrorConfig } from '@kubb/plugin-client/clients/axios'

function getPutV1RoutinesRoutineidUrl(routineId: PutV1RoutinesRoutineidPathParams['routineId']) {
  return `/v1/routines/${routineId}` as const
}

/**
 * @summary Update an existing routine
 * {@link /v1/routines/:routineId}
 */
export async function putV1RoutinesRoutineid(
  routineId: PutV1RoutinesRoutineidPathParams['routineId'],
  headers: PutV1RoutinesRoutineidHeaderParams,
  data?: PutV1RoutinesRoutineidMutationRequest,
  config: Partial<RequestConfig<PutV1RoutinesRoutineidMutationRequest>> & { client?: typeof fetch } = {},
) {
  const { client: request = fetch, ...requestConfig } = config

  const requestData = data
  const res = await request<
    PutV1RoutinesRoutineidMutationResponse,
    ResponseErrorConfig<PutV1RoutinesRoutineid400 | PutV1RoutinesRoutineid404>,
    PutV1RoutinesRoutineidMutationRequest
  >({
    method: 'PUT',
    url: getPutV1RoutinesRoutineidUrl(routineId).toString(),
    data: requestData,
    ...requestConfig,
    headers: { ...headers, ...requestConfig.headers },
  })
  return res.data
}