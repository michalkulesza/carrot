import { readFile, writeFile } from "node:fs/promises";

const projectPath = new URL(
  "../ios/Carrot.xcodeproj/project.pbxproj",
  import.meta.url,
);
const productionBundleIdentifier = "com.kulesza.carrot.ShareExtension";
const developmentBundleIdentifier = "com.kulesza.carrot.dev.ShareExtension";

const project = await readFile(projectPath, "utf8");
const updatedProject = project.replaceAll(
  productionBundleIdentifier,
  developmentBundleIdentifier,
);

if (updatedProject === project && !project.includes(developmentBundleIdentifier)) {
  throw new Error("Could not find the ShareExtension bundle identifier");
}

await writeFile(projectPath, updatedProject);
