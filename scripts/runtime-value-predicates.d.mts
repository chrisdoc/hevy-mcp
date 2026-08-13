type RuntimeJsonValue =
	| string
	| number
	| boolean
	| null
	| RuntimeJsonObject
	| RuntimeJsonValue[];

interface RuntimeJsonObject {
	readonly [key: string]: RuntimeJsonValue;
}

export declare function isString(value: RuntimeJsonValue): value is string;
export declare function isNumber(value: RuntimeJsonValue): value is number;
export declare function isBoolean(value: RuntimeJsonValue): value is boolean;
export declare function isObjectLike(
	value: RuntimeJsonValue,
): value is RuntimeJsonObject | RuntimeJsonValue[];
