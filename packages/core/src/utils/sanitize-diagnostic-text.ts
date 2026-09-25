const DEFAULT_MAX_LENGTH = 2_048;

function truncate(value: string, length: number): string {
	return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeHomePath(
	value: string,
	homeDirectory: string | undefined,
): string {
	const withConfiguredHome = homeDirectory?.trim()
		? value.replace(new RegExp(escapeRegExp(homeDirectory.trim()), "g"), "~")
		: value;
	const windowsHomePattern = /(?:[A-Z]:[\\/]+)?Users[\\/]+[^\\/\s]+/iu;
	if (windowsHomePattern.test(withConfiguredHome)) {
		return withConfiguredHome.replace(
			/(?:[A-Z]:[\\/]+)?Users[\\/]+[^\\/\s]+/giu,
			"~",
		);
	}
	return withConfiguredHome.replace(/\/(?:Users|home)\/[^/\s]+/g, "~");
}

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const INTERNATIONALIZED_EMAIL =
	/(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}](?:[\p{L}\p{N}._%+-]{0,63})@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,63}(?![\p{L}\p{N}_-])/gu;

function removeControlCharacters(value: string): string {
	let output = "";
	let inEscapeSequence = false;
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (inEscapeSequence) {
			if (codePoint >= 0x40 && codePoint <= 0x7e && codePoint !== 0x5b) {
				inEscapeSequence = false;
			}
			continue;
		}
		if (codePoint === 0x1b) {
			inEscapeSequence = true;
			continue;
		}
		if (
			codePoint <= 0x1f &&
			codePoint !== 0x09 &&
			codePoint !== 0x0a &&
			codePoint !== 0x0d
		) {
			continue;
		}
		if (codePoint === 0x7f) continue;
		output += character;
	}
	return output;
}

/** Remove common credentials and URL payloads from bounded diagnostic text. */
export function sanitizeDiagnosticText(
	value: string,
	maxLength = DEFAULT_MAX_LENGTH,
	homeDirectory?: string,
): string {
	const withoutControlCharacters = removeControlCharacters(value);
	const withoutSecrets = withoutControlCharacters
		.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
		.replace(
			/\b(api[-_ ]?key|authorization|password|secret|token)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
			"$1=[REDACTED]",
		)
		.replace(
			/(?<![A-Z0-9])((?:api[-_ ]?key|authorization|password|(?:client_|access_|refresh_)?secret|(?:client_|access_|refresh_)?token))\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
			"$1=[REDACTED]",
		)
		.replace(INTERNATIONALIZED_EMAIL, "[EMAIL_REDACTED]")
		.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)<>]+/gi, "[URL]")
		.replace(EMAIL, "[EMAIL_REDACTED]")
		.replace(/\bhttps?:\/\/[^\s)<>]+/gi, "[URL]");
	return truncate(
		removeHomePath(withoutSecrets, homeDirectory).trim(),
		maxLength,
	);
}
