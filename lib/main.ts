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
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2019')
    .argv;

  const binPath = getPath(`../bin/${SWAGGER_JAR_NAME}`);
  const templatePath = getPath("../templates");
  const tmpPath = getPath("../tmp");
  const configPath = getPath("../config/config.json");
  const outputPath = Path.resolve(process.cwd(), `${argv.o}/apiClient.ts`)
  let command = `java -DdebugOperations -jar "${binPath}" generate --template-engine mustache -l typescript-fetch -t "${templatePath}" -c "${configPath}" -o ${tmpPath}`;

  let swaggerLocation: string = String(argv.file);
  if (!isAbsolute(swaggerLocation)) {
    swaggerLocation = join(process.cwd(), swaggerLocation);
  }
  command += ` -i ${swaggerLocation}`;

  console.log("Running command", command);
  execSync(command, { stdio: "inherit" });

  const apiClientString = fs.readFileSync(`${tmpPath}/api.ts`);
  const coreApiClient = fs.readFileSync(getPath("./coreApiClient.ts"));
  fs.writeFileSync(outputPath,  [coreApiClient, apiClientString].join("\n"), 'utf8');
  deleteFolderRecursive(tmpPath);
}

main();