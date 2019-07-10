import { isRefProperty, isObjectProperty, Properties, isArrayProperty, ObjectProperty, Operation, Parameter, isSchemaProperty, Property, ApiResponse, BasicProperty } from "./types";

interface TypeCollection {
  [key: string]: string | TypeCollection;
}

export const enums: string[] = [];


const toCamelCase = (str: string): string => str.replace(/(\-\w)/g, matches => matches[1].toUpperCase());
const toTitleCase = (str: string): string => {
  const camelCase = toCamelCase(str);
  return str.charAt(0).toUpperCase() + str.substring(1);
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

const extractTypeFromProperties = (properties: Properties): TypeCollection => {
  const typeDefinition: TypeCollection = {};

  if (!properties) {
    return typeDefinition;
  }

  Object.entries(properties).reduce((typeDefinition, [propertyName, property]) => {
    const type = extractTypeFromProperty(property);
    const optional = property["x-nullable"]

    const propertyKey = `${propertyName}${optional ? "?" : ""}`;

    typeDefinition[propertyKey] = type;
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

export const createApiFunction = (path: string, method: string, operation: Operation): string => {

  let pathParams: Parameter[];
  let pathParamArguments: any;
  let queryParams: {
    name: string;
    required: boolean;
    type: TypeCollection | string;
  }[];
  let bodyParams: {
    name: string;
    root: string;
    required: boolean;
    type: TypeCollection | string;
  }[];

  if (operation.parameters) {
    pathParams = operation.parameters.filter(param => param.in === "path");
    pathParamArguments = pathParams.map(param =>{
      return `${param.name}: ${extractTypeFromProperty(param)}`;
    });
      
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
      return ({
        name: param.name,
        required: param.required,
        root: extractRoot(schema),
        type: extractTypeFromProperty(schema.properties[extractRoot(schema)]),
      });
    });
  }

  const hasQueryParams = queryParams && Object.keys(queryParams).length;
  const hasBodyParams = bodyParams && Object.keys(bodyParams).length;
  
  // Initiate function construction. Leaading space for class spacing
  let apiFunction = `export const ${operation.operationId} = (`

  // Add comma separated path arguments as their own arguments
  if (Array.isArray(pathParamArguments) && pathParamArguments.length) {
    apiFunction += pathParamArguments.join(", ");
    if (hasQueryParams || hasBodyParams) { apiFunction += ", " } // Add a comman and space since theres more here
  }

  // Group params as one argument
  // Can only have query or body params, not both
  if (hasQueryParams) {
    const paramsRequired = queryParams.some(qp => qp.required);
    apiFunction += `params${!paramsRequired ? "?" : ""}: { \n`;
    queryParams.forEach(qp => {
      apiFunction += `    ${qp.name}${!qp.required ? "?" : ""}: ${qp.type},\n`;
    })
    apiFunction += `}`
  } else if (hasBodyParams) {
    bodyParams.forEach((bodyParam) => {
      apiFunction += `${bodyParam.name}${!bodyParam.required ? "?" : ""}: ${bodyParam.type},\n`;
    })
  }

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
  apiFunction += `) => {
    return makeRequest<${responseType}>(
      "${method.toUpperCase()}", 
      "${path}"${(pathParams || []).map(param => `.replace("{${param.name}}", ${param.name})`)}`
      
  // Add appropriate params to function
  if (hasQueryParams) {
    apiFunction += `,
    params`
  } else if (hasBodyParams) {
    bodyParams.forEach(bodyParam => {
      apiFunction += `,
    { ${bodyParam.root}: ${bodyParam.name} }`
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