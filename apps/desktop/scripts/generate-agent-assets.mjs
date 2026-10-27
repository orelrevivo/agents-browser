import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = join(scriptDirectory, "..");
const agentsDirectory = join(desktopDirectory, "public", "agents");
const outputPath = join(desktopDirectory, "src", "renderer", "src", "generated", "agent-assets.ts");
const files = readdirSync(agentsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

const imports = files.map((file, index) => `import avatar${index} from "../../../../public/agents/${file}";`).join("\n");
const assets = files.map((file, index) => ({ name: file.replace(/\.png$/i, ""), path: `/agents/${file}`, src: `avatar${index}` }));
const entries = assets.map(({ name, path, src }) => `  { name: ${JSON.stringify(name)}, path: ${JSON.stringify(path)}, src: ${src} },`).join("\n");
const source = `// Generated from ${relative(desktopDirectory, agentsDirectory)}. Do not edit by hand.\n${imports}\n\nexport const agentAvatarAssets = [\n${entries}\n] as const;\n`;
writeFileSync(outputPath, source);
