#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
import { createTypeDefinition, createApiFunction, enums } from "./prepareSwagger";
import { ObjectProperty, PathDefinition } from "./types";
import { join, isAbsolute } from "path";

const argv = require('yargs')
              .usage('Usage: $0 <command> [options]')
              .command('generate', 'Generate an API Client from a JSON swatter')
              .example('$0 generate -f foo.json -o "../', 'Generate an API Client from the given file')
              .alias('f', 'file')
              .nargs('f', 1)
              .describe('f', 'Path to file')
              .demandOption(['f'])
              .alias('o', 'output')
              .nargs('o', 1)
              .describe('o', 'Folder to write client')
              .demandOption(['o'])
              .help('h')
              .alias('h', 'help')
              .epilog('copyright 2019')
              .argv;

const getPath = (relative: string): string => path.resolve(__dirname, relative);
const coreApiClient = fs.readFileSync(getPath("../lib/coreApiClient.ts"));

const swaggerLocation = argv.file;
const swagger = require(isAbsolute(swaggerLocation) ? swaggerLocation : join(process.cwd(), swaggerLocation));

const definitions = Object.entries(swagger.definitions as { [key: string]: ObjectProperty }).map(([name, def]) => createTypeDefinition(name, def));
const apiFunctions = Object.entries(swagger.paths as PathDefinition).reduce((functions, [path, operations]) => {
  functions.push(
    ...Object.entries(operations).map(([method, operation]) => createApiFunction(path, method, operation))
  );
  return functions;
}, []);

const apiClientString = [
  coreApiClient,
  ...swagger.basePath ? [`baseApiPath = "${swagger.basePath}";\n`] : [],
  ...enums,
  ...definitions,
  ...apiFunctions,
];
require('fs').writeFileSync(`${argv.o}/apiClient.ts`, apiClientString.join("\n"), 'utf8');
