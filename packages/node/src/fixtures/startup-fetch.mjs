globalThis.fetch = () =>
	new Response("{}", {
		status: Number(process.env.STARTUP_FETCH_STATUS ?? "200"),
		headers: { "content-type": "application/json" },
	});
