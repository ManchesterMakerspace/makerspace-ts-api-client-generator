import { dirname, resolve } from "path";
import { renameSync, existsSync } from "fs";
import download from "mvn-artifact-download";
import { SWAGGER_JAR_NAME, MVN_GROUP, ARTIFACT_NAME, VERSION } from "./constants";

const artifact = `${MVN_GROUP}:${ARTIFACT_NAME}:${VERSION}`;
const destDir = resolve (__dirname, "../bin");

// This fn wont do anything until we revert back to downloading at runtime
const main = async () => {
  if (!existsSync(resolve(destDir, SWAGGER_JAR_NAME))) {
    const sourceFilename = await download(artifact, destDir);
    const targetFilename = `${dirname(sourceFilename)}/${SWAGGER_JAR_NAME}`;
    renameSync(sourceFilename, targetFilename);
  }
};

main();