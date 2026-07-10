/**
 * Find the first added diff line that matches a pattern.
 *
 * @param {object} source gitStream's source context variable.
 * @param {RegExp|string} pattern Pattern to match against added line content.
 * @param {RegExp|string} [includePath] Optional path inclusion pattern.
 * @param {RegExp|string} [excludePath] Optional path exclusion pattern.
 * @returns {string} JSON-encoded location for gitStream expressions.
 */
function findDiffLocation(source, pattern, includePath, excludePath) {
	const notFound = JSON.stringify({
		found: false,
		file_name: "",
		start_line: 0,
	});
	const matchPattern = toRegExp(pattern);
	const includePattern = toRegExp(includePath, true);
	const excludePattern = toRegExp(excludePath, true);
	const files = source?.diff?.files;

	if (
		!Array.isArray(files) ||
		!matchPattern ||
		includePattern === null ||
		excludePattern === null
	) {
		return notFound;
	}

	for (const file of files) {
		const fileName = file?.new_file || file?.original_file;
		if (
			typeof fileName !== "string" ||
			typeof file?.diff !== "string" ||
			(includePattern && !test(includePattern, fileName)) ||
			(excludePattern && test(excludePattern, fileName))
		) {
			continue;
		}

		const location = findInDiff(file.diff, matchPattern);
		if (location !== null) {
			return JSON.stringify({
				found: true,
				file_name: fileName,
				start_line: location,
			});
		}
	}

	return notFound;
}

function findInDiff(diff, pattern) {
	let newLine = null;

	for (const line of diff.split(/\r?\n/)) {
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunk) {
			newLine = Number(hunk[1]);
			continue;
		}

		if (newLine === null || line.startsWith("\\ No newline")) {
			continue;
		}

		if (line.startsWith("+")) {
			if (test(pattern, line.slice(1))) {
				return newLine;
			}
			newLine += 1;
			continue;
		}

		if (line.startsWith("-")) {
			continue;
		}

		newLine += 1;
	}

	return null;
}

function toRegExp(value, optional = false) {
	if (value === undefined || value === null || value === "") {
		return optional ? undefined : null;
	}

	if (value instanceof RegExp) {
		return value;
	}

	if (typeof value !== "string") {
		return null;
	}

	try {
		return new RegExp(value);
	} catch {
		return null;
	}
}

function test(pattern, value) {
	pattern.lastIndex = 0;
	return pattern.test(value);
}

module.exports = findDiffLocation;
