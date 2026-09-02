/** Runtime-neutral fetch client used by the generated Hevy API operations. */
export type RequestConfig<TData = unknown> = {
	baseURL?: string;
	url?: string;
	method?: "GET" | "PUT" | "PATCH" | "POST" | "DELETE" | "OPTIONS" | "HEAD";
	path?: unknown;
	params?: unknown;
	query?: unknown;
	data?: TData | FormData;
	body?: TData | FormData;
	responseType?:
		| "arraybuffer"
		| "blob"
		| "document"
		| "json"
		| "text"
		| "stream";
	signal?: AbortSignal;
	headers?: [string, string][] | Record<string, string>;
};

export type ResponseConfig<TData = unknown> = {
	data: TData;
	status: number;
	statusText: string;
	headers: Headers;
};

let config: Partial<RequestConfig> = {};

export const getConfig = () => config;

export const setConfig = (nextConfig: Partial<RequestConfig>) => {
	config = nextConfig;
	return getConfig();
};

function normalizeHeaders(
	headers: RequestConfig["headers"],
): Record<string, string> {
	return Array.isArray(headers) ? Object.fromEntries(headers) : (headers ?? {});
}

export const mergeConfig = <T extends RequestConfig>(
	...configs: Array<Partial<T>>
): Partial<T> => {
	return configs.reduce<Partial<T>>((merged, nextConfig) => {
		return {
			...merged,
			...nextConfig,
			headers: {
				...normalizeHeaders(merged.headers),
				...normalizeHeaders(nextConfig.headers),
			},
		};
	}, {});
};

export type ResponseErrorConfig<TError = unknown> = TError;

export type Client = <TData, _TError = unknown, TVariables = unknown>(
	requestConfig: RequestConfig<TVariables>,
) => Promise<ResponseConfig<TData>>;

export const fetch = async <TData, _TError = unknown, TVariables = unknown>(
	paramsConfig: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData>> => {
	const normalizedParams = new URLSearchParams();
	const requestConfig = mergeConfig(getConfig(), paramsConfig);
	const query = requestConfig.query ?? requestConfig.params;
	const bodyPayload = requestConfig.body ?? requestConfig.data;
	const pathParams = requestConfig.path;

	Object.entries(query || {}).forEach(([key, value]) => {
		if (value !== undefined) {
			normalizedParams.append(key, value === null ? "null" : value.toString());
		}
	});

	let resolvedPath = requestConfig.url ?? "";
	Object.entries(pathParams || {}).forEach(([key, value]) => {
		if (value !== undefined) {
			resolvedPath = resolvedPath.replaceAll(
				`{${key}}`,
				encodeURIComponent(value === null ? "null" : value.toString()),
			);
		}
	});

	let targetUrl = [requestConfig.baseURL, resolvedPath]
		.filter(Boolean)
		.join("");
	if (query) targetUrl += `?${normalizedParams}`;

	const response = await globalThis.fetch(targetUrl, {
		method: requestConfig.method?.toUpperCase(),
		body:
			bodyPayload instanceof FormData
				? bodyPayload
				: JSON.stringify(bodyPayload),
		signal: requestConfig.signal,
		headers: requestConfig.headers,
	});

	const data =
		[204, 205, 304].includes(response.status) || !response.body
			? {}
			: await response.json();

	return {
		data: data as TData,
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	};
};

export default fetch;
