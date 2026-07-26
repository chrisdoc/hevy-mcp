function scalar(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "object") return JSON.stringify(value);
	return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

export function human(value: unknown): string {
	if (Array.isArray(value))
		return value.length
			? value.map((item) => human(item)).join("\n")
			: "No results.";
	if (!value || typeof value !== "object") return scalar(value);
	const record = value as Record<string, unknown>;
	const lines: string[] = [];
	for (const [key, item] of Object.entries(record)) {
		if (Array.isArray(item)) {
			lines.push(`${key}: ${item.length} item(s)`);
			for (const child of item.slice(0, 20)) {
				if (child && typeof child === "object")
					lines.push(
						`  - ${Object.entries(child as Record<string, unknown>)
							.map(([k, v]) => `${k}=${scalar(v)}`)
							.join(", ")}`,
					);
				else lines.push(`  - ${scalar(child)}`);
			}
		} else if (item && typeof item === "object") {
			lines.push(`${key}:`);
			lines.push(
				...human(item)
					.split("\n")
					.map((line) => `  ${line}`),
			);
		} else lines.push(`${key}: ${scalar(item)}`);
	}
	return lines.join("\n") || "No results.";
}
