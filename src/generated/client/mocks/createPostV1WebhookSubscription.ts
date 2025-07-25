/**
 * Generated by Kubb (https://kubb.dev/).
 * Do not edit manually.
 */

import type {
  PostV1WebhookSubscriptionHeaderParams,
  PostV1WebhookSubscription400,
  PostV1WebhookSubscriptionMutationResponse,
} from '../types/PostV1WebhookSubscription.ts'
import { createWebhookRequestBody } from './createWebhookRequestBody.ts'
import { faker } from '@faker-js/faker'

export function createPostV1WebhookSubscriptionHeaderParams(data?: Partial<PostV1WebhookSubscriptionHeaderParams>): PostV1WebhookSubscriptionHeaderParams {
  return {
    ...{ 'api-key': faker.string.uuid() },
    ...(data || {}),
  }
}

/**
 * @description The webhook subscription was successfully created
 */
export function createPostV1WebhookSubscription201() {
  return undefined
}

/**
 * @description Invalid request body
 */
export function createPostV1WebhookSubscription400(data?: Partial<PostV1WebhookSubscription400>): PostV1WebhookSubscription400 {
  return {
    ...{ error: faker.string.alpha() },
    ...(data || {}),
  }
}

export function createPostV1WebhookSubscriptionMutationRequest() {
  return createWebhookRequestBody()
}

export function createPostV1WebhookSubscriptionMutationResponse(
  data?: Partial<PostV1WebhookSubscriptionMutationResponse>,
): PostV1WebhookSubscriptionMutationResponse {
  return data || faker.helpers.arrayElement<any>([createPostV1WebhookSubscription201()])
}