// Minimal Node.js stand-in for the `cloudflare:workers` runtime module so
// unit tests can import Worker code that depends on
// @cloudflare/workers-oauth-provider. The library only uses this export for
// `instanceof` checks on class-based handlers, which the tests do not use.
export class WorkerEntrypoint {}

interface NoopSpan {
	isTraced: boolean;
	setAttribute(key: string, value: string | number | boolean): void;
	end(): void;
}

const noopSpan: NoopSpan = {
	isTraced: true,
	setAttribute: (_key: string, _value: string | number | boolean): void => {},
	end: (): void => {},
};

export const tracing = {
	startActiveSpan<T>(_name: string, callback: (span: typeof noopSpan) => T): T {
		return callback(noopSpan);
	},
};
