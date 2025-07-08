import { writeFileSync } from "node:fs";
import pkg from "abstract-syntax-tree";

const { parse, find, generate } = pkg;

async function fetchSwaggerInitFile() {
	const url = "https://api.hevyapp.com/docs/swagger-ui-init.js";
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status}`);
	}
	return await response.text();
}

async function main() {
	try {
		console.log("Fetching swagger-ui-init.js file...");
		const jsContent = await fetchSwaggerInitFile();
		const ast = parse(jsContent);

		const optionsNode = find(ast, 'VariableDeclarator[id.name="options"]')[0];
		if (!optionsNode || !optionsNode.init || !optionsNode.init.properties) {
			throw new Error("options variable not found.");
		}

		const swaggerDocProperty = optionsNode.init.properties.find(
			(prop) => prop.key.value === "swaggerDoc",
		);
		if (!swaggerDocProperty) {
			throw new Error("swaggerDoc property not found.");
		}

		const swaggerDocCode = generate(swaggerDocProperty.value, { tabs: true });
		const openAPISpec = JSON.parse(swaggerDocCode);

		writeFileSync("openapi-spec.json", JSON.stringify(openAPISpec, null, 2));
		console.log("OpenAPI spec successfully extracted to openapi-spec.json");
	} catch (error) {
		console.error("Failed to extract OpenAPI spec:", error);
	}
}

main();
