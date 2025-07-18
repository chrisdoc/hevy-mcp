/**
 * Generated by Kubb (https://kubb.dev/).
 * Do not edit manually.
 */

import type { PostRoutineFolderRequestBody } from './PostRoutineFolderRequestBody.ts'
import type { RoutineFolder } from './RoutineFolder.ts'

export type PostV1RoutineFoldersHeaderParams = {
  /**
   * @type string, uuid
   */
  'api-key': string
}

/**
 * @description The routine folder was successfully created
 */
export type PostV1RoutineFolders201 = RoutineFolder

/**
 * @description Invalid request body
 */
export type PostV1RoutineFolders400 = {
  /**
   * @description Error message
   * @type string | undefined
   */
  error?: string
}

export type PostV1RoutineFoldersMutationRequest = PostRoutineFolderRequestBody

export type PostV1RoutineFoldersMutationResponse = PostV1RoutineFolders201

export type PostV1RoutineFoldersMutation = {
  Response: PostV1RoutineFolders201
  Request: PostV1RoutineFoldersMutationRequest
  HeaderParams: PostV1RoutineFoldersHeaderParams
  Errors: PostV1RoutineFolders400
}