import {
  isRefProperty,
  isObjectProperty,
  Properties,
  isArrayProperty,
  ObjectProperty,
  Operation,
  Parameter,
  isSchemaProperty,
  Property,
  ApiResponse,
  BasicProperty,
  TypeCollection
} from "./types";

export const enums: string[] = [];


const toCamelCase = (str: string): string => str.replace(/((\-|\W|\_)\w)/g, matches => matches[1].toUpperCase());
const toTitleCase = (str: string): string => {
  const camelCase = toCamelCase(str);
  return camelCase.charAt(0).toUpperCase() + camelCase.substring(1);
}

const extractRoot = (schema: Properties) => Object.keys(schema.properties).shift();
const extractTypeFromRef = (defPath: string) => defPath.split("/").pop();

// Reads a property and returns a type ready for insertion
const extractTypeFromProperty = (property: Property): string => {
  let type;
  if (isArrayProperty(property)) {
    type = `${stringifyType(extractTypeFromProperty(property.items))}[]`;
  } else if (isRefProperty(property)) {
    type = extractTypeFromRef(property["$ref"]);
  } else if (isObjectProperty(property)) {
    type = property.properties ? extractTypeFromProperties(property.properties) : `{ [key: string]: string }`;
  } else if (isSchemaProperty(property)) {
    type = extractTypeFromProperties(property.schema);
  } else {
    type = property.type;
  }

  return stringifyType(type);
}

const extractEnumFromProperty = (property: Property, propertyName: string): string => {
  let typeEnum: string = "";
  if (!(property as BasicProperty).enum) {
    return typeEnum;
  }

  if ((property as BasicProperty).type === "string") {
    typeEnum = `export enum ${toTitleCase(propertyName)} {
${(property as BasicProperty).enum.map(enumName => `  ${toTitleCase(enumName)} = "${enumName}"`).join(",\n")}
}
`;
  }
  return typeEnum;
}
const extractEnumsFromProperties = (properties: Properties, baseName: string): string[] => {
  const enums: string[] = [];

  if (!properties) {
    return enums;
  }

  return Object.entries(properties).map(([propertyName, property]) =>
    extractEnumFromProperty(property, toTitleCase(baseName) + toTitleCase(propertyName))).filter(e => !!e);
}

const extractTypeFromProperties = (properties: Properties): TypeCollection | string => {
  const typeDefinition: TypeCollection = {};

  if (!properties) {
    return typeDefinition;
  }

  if (Object.keys(properties).length === 1 && Object.keys(properties)[0] === "$ref") {
    return extractTypeFromRef(String(Object.values(properties)[0]));
  }

  Object.entries(properties).reduce((typeDefinition, [propertyName, property]) => {
    const propertyKey = `${propertyName}${property["x-nullable"] ? "?" : ""}`;

    typeDefinition[propertyKey] = extractTypeFromProperty(property);
    return typeDefinition;
  }, typeDefinition);

  return typeDefinition;
};

const stringifyType = (type: TypeCollection | string): string => {
  if (typeof type !== "object") {
    return type;
  }

  const stringProps = Object.entries(type).map(([key, subtype]) => {
    return `${key}: ${stringifyType(subtype)}`;
  }, []);

  return `{
${stringProps.map(sp => `    ${sp}`).join(",\n")}
  }`;
}


export const createTypeDefinition = (name: string, definition: ObjectProperty): string => {
  const definitionWithType = extractTypeFromProperties(definition.properties);
  const enums = extractEnumsFromProperties(definition.properties, name);

  let typeDef = `export interface ${name} {\n`
  Object.entries(definitionWithType).forEach(([key, type]) => {
    typeDef += `  ${key}: ${type};\n`;
  });

  typeDef += `}\n`;

  const typeEnums = enums.join("\n");

  return (typeEnums.length ? typeEnums + "\n" : "") + typeDef;
};

type Param = { name: string; required: boolean; type: TypeCollection | string; };
type BodyParam = (Param & {
  root: string;
});
export const createApiFunction = (path: string, method: string, operation: Operation): string => {

  let pathParams: Param[] = [];
  let queryParams: Param[] = [];
  let bodyParams: BodyParam[] = [];

  if (operation.parameters) {
    pathParams = operation.parameters.filter(param => param.in === "path").map(param => ({
      name: param.name,
      required: true,
      type: extractTypeFromProperty(param),
    }));

    queryParams = operation.parameters.filter(param => param.in === "query").map(param => ({
      name: param.name,
      required: param.required,
      type: extractTypeFromProperty(param),
    }));

    // Top level name becomes param name
    // Top level within schema is root
    // Everything else within schema becomes top level param type
    const bParams = operation.parameters.filter(param => param.in === "body");
    bodyParams = bParams.map(param => {
      const { schema } = param;
      const type =
        Object.keys(schema.properties).length === 1
          ? extractTypeFromProperty(schema.properties[extractRoot(schema)])
          : extractTypeFromProperty(schema as any as Property);
      return {
        type,
        name: param.name,
        required: param.required,
        root: extractRoot(schema)
      };
    });
  }

  const allParams = [...pathParams, ...bodyParams, ...queryParams];
  const hasQueryParams = queryParams && Object.keys(queryParams).length;
  const hasBodyParams = bodyParams && Object.keys(bodyParams).length;

  // Initiate function construction. Leaading space for class spacing
  let apiFunction = `export function ${operation.operationId}(`

  // Group params as one argument
  const paramsRequired = allParams.some(param => param.required);
  apiFunction += `params${!paramsRequired ? "?" : ""}: { \n`;

  // Add comma separated path arguments as their own arguments
  // if (Array.isArray(pathParamArguments) && pathParamArguments.length) {
  //   apiFunction += pathParamArguments.join(", ");
  //   if (hasQueryParams || hasBodyParams) { apiFunction += ", " } // Add a comman and space since theres more here
  // }

  
  const renderParam = (param: Param) => `${param.name}${!param.required ? "?" : ""}: ${param.type}`;
  allParams.forEach((param) => {
    apiFunction += `  ${renderParam(param)},\n`;
  })
  apiFunction += `}) {\n`

  const [statusCode, successResponse]: [string, ApiResponse] = Object.entries(operation.responses).find(([statusCode]) => statusCode < "300" && statusCode >= "200");
  let responseType: string;
  let responseRoot: string;
  if (statusCode === "204") {
    responseType = "void";
  } else {
    responseType = isSchemaProperty(successResponse) ? extractTypeFromProperty(successResponse.schema.properties[extractRoot(successResponse.schema)]) : "void";
    responseRoot = isSchemaProperty(successResponse) ? extractRoot(successResponse.schema) : undefined;
  }

  // Call base function
  apiFunction += `  return makeRequest<${responseType}>(
    "${method.toUpperCase()}",
    "${path}"${(pathParams || []).map(param => `.replace("{${param.name}}", params.${param.name})`)}`

  // Add appropriate params to function
    // if (hasQueryParams || hasBodyParams) {
    //   apiFunction += `, \n  params`;
    // }
  if (hasQueryParams) {
    apiFunction += `,
    params`
  } else if (hasBodyParams) {
    bodyParams.forEach(bodyParam => {
      apiFunction += `,
    { ${bodyParam.root}: params.${bodyParam.name} }`
    });
  }

  // Pass root in correct position
  if (responseRoot) {
    apiFunction += `,
    `;
    if (!(hasQueryParams || hasBodyParams)) {
      apiFunction += "undefined,\n"
    }
    apiFunction += `"${responseRoot}"`
  }


  // Close function
  apiFunction += `
    );
  }
  `

  return apiFunction;
}

// "responses": {
//   "200": {
//     "description": "billing plan discounts found",
//     "schema": {
//       "type": "object",
//       "properties": {
//         "discounts": {
//           "type": "array",
//           "items": {
//             "$ref": "#/definitions/Discount"
//           }
//         }
//       },
//       "required": [
//         "discounts"
//       ]
//     }
//   },