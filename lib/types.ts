export type Property = RefProperty | BasicProperty | ObjectProperty | ArrayProperty | SchemaProperty;
export interface Properties {
  [key: string]: Property
}

export interface ArrayProperty extends BaseProperty {
  type: "array",
  items: Property;
}
export const isArrayProperty = (item: any): item is ArrayProperty => item.hasOwnProperty("type") && item.type === "array";


export interface ObjectProperty extends BaseProperty {
  type: "object",
  properties: Properties;
}
export const isObjectProperty = (item: any): item is ObjectProperty => item.hasOwnProperty("type") && item.type === "object";

export interface BaseProperty {
  "x-nullable"?: boolean;
}

export interface BasicProperty extends BaseProperty {
  type: "string" | "number" | "boolean";
  enum: string[];
}

export interface RefProperty extends BaseProperty {
  "$ref": string;
}
export const isRefProperty = (item: any): item is RefProperty => item.hasOwnProperty("$ref");

export interface SchemaProperty extends BaseProperty {
  schema: Properties;
}
export const isSchemaProperty = (item: any): item is SchemaProperty => item.hasOwnProperty("schema");


export interface PathDefinition {
  [key: string]: {
    get?: Operation
    put?: Operation
    patch?: Operation
    post?: Operation
    delete?: Operation
  }
}

export interface Operation {
  summary: string;
  tags: string[];
  operationId: string;
  parameters: Parameter[];
  responses: {
    [key: string]: ApiResponse
  };
}

export type Parameter = Property & {
  name: string;
  in: string;
  required: boolean;
  schema?: Properties;
}

export interface ApiResponse {
  description: string;
  schema?: Property;
}