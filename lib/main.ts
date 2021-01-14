#!/usr/bin/env ts-node-script

import * as Path from "path";
import * as fs from "fs";
import * as yargs from "yargs";
import { SWAGGER_JAR_NAME } from "./constants";
import { join, isAbsolute } from "path";
import { execSync } from "child_process";

const getPath = (relative: string): string => Path.resolve(__dirname, relative);
const deleteFolderRecursive = function(path: string) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach((file, index) => {
      const curPath = Path.join(path, file);
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

export const main = () => {
  const argv = yargs
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
    .alias('m', 'mock')
    .nargs('m', 1)
    .describe('m', 'Generate a mockserver')
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2019')
    .argv;

  const binPath = getPath(`../bin/${SWAGGER_JAR_NAME}`);
  const isMockMode = !!argv.m;

  const tmpPath = getPath("../tmp");
  const configPath = getPath("../config/config.json");

  function buildCommand(asMock: boolean = false): string {
    const apiTemplatePath = getPath("../templates");
    const mockTemplatePath = getPath("../mock_templates");
    const templatePath = asMock ? mockTemplatePath : apiTemplatePath;

    let command = `java -jar "${binPath}" generate --template-engine mustache -l typescript-fetch -t "${templatePath}" -c "${configPath}" -o ${tmpPath}`;

    let swaggerLocation: string = String(argv.file);
    if (!isAbsolute(swaggerLocation)) {
      swaggerLocation = join(process.cwd(), swaggerLocation);
    }
    command += ` -i ${swaggerLocation}`;

    return command;
  }

  // Build core API
  const apiCommand = buildCommand();
  console.log("Running command", apiCommand);
  execSync(apiCommand, { stdio: "inherit" });

  // Copy core API and clear out tmp folder
  const apiClientString = fs.readFileSync(`${tmpPath}/api.ts`);
  const coreApiClient = fs.readFileSync(getPath("./coreApiClient.ts"));
  fs.writeFileSync(Path.resolve(process.cwd(), `${argv.o}/apiClient.ts`),  [coreApiClient, apiClientString].join("\n"), 'utf8');
  deleteFolderRecursive(tmpPath);

  if (isMockMode) {
    // Build Mock API
    const apiCommand = buildCommand(true);
    console.log("Running command", apiCommand);
    execSync(apiCommand, { stdio: "inherit" });

    // Copy Mock API and clear out tmp folder
    fs.writeFileSync(Path.resolve(process.cwd(), `${argv.o}/mockApiClient.ts`),  fs.readFileSync(`${tmpPath}/api.ts`), 'utf8');
    deleteFolderRecursive(tmpPath);
  }
}

main();