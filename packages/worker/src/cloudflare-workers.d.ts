declare module "cloudflare:workers" {
	interface WorkerTraceSpan {
		setAttribute(
			key: string,
			value: string | number | boolean | undefined,
		): void;
		end(): void;
	}

	export const tracing: {
		startActiveSpan<T>(name: string, callback: (span: WorkerTraceSpan) => T): T;
	};
}
