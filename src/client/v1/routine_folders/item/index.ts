/* tslint:disable */
/* eslint-disable */
// Generated by Microsoft Kiota
// @ts-ignore
import { createRoutineFolderFromDiscriminatorValue, type RoutineFolder } from '../../../models/index.js';
// @ts-ignore
import { type BaseRequestBuilder, type Parsable, type ParsableFactory, type RequestConfiguration, type RequestInformation, type RequestsMetadata } from '@microsoft/kiota-abstractions';

/**
 * Builds and executes requests for operations under /v1/routine_folders/{folderId}
 */
export interface WithFolderItemRequestBuilder extends BaseRequestBuilder<WithFolderItemRequestBuilder> {
    /**
     * Get a single routine folder by id.
     * @param requestConfiguration Configuration for the request such as headers, query parameters, and middleware options.
     * @returns {Promise<RoutineFolder>}
     */
     get(requestConfiguration?: RequestConfiguration<object> | undefined) : Promise<RoutineFolder | undefined>;
    /**
     * Get a single routine folder by id.
     * @param requestConfiguration Configuration for the request such as headers, query parameters, and middleware options.
     * @returns {RequestInformation}
     */
     toGetRequestInformation(requestConfiguration?: RequestConfiguration<object> | undefined) : RequestInformation;
}
/**
 * Uri template for the request builder.
 */
export const WithFolderItemRequestBuilderUriTemplate = "{+baseurl}/v1/routine_folders/{folderId}";
/**
 * Metadata for all the requests in the request builder.
 */
export const WithFolderItemRequestBuilderRequestsMetadata: RequestsMetadata = {
    get: {
        uriTemplate: WithFolderItemRequestBuilderUriTemplate,
        responseBodyContentType: "application/json",
        adapterMethodName: "send",
        responseBodyFactory:  createRoutineFolderFromDiscriminatorValue,
    },
};
/* tslint:enable */
/* eslint-enable */
