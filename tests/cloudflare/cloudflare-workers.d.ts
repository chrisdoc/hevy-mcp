declare module "cloudflare:workers" {
	interface WorkerExport {
		fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
	}

	export const exports: {
		default: WorkerExport;
	};

	export const tracing: import("@cloudflare/workers-types").Tracing;
}
