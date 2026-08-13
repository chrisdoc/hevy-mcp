export function isString(value) {
	return String(value) === value;
}

export function isNumber(value) {
	return Number.isFinite(value);
}

export function isBoolean(value) {
	return value === true || value === false;
}

export function isObjectLike(value) {
	return value !== null && Object(value) === value;
}
