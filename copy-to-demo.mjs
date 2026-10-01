import { copyFileSync, mkdirSync } from "fs";

const targetDir = "demo-vault/.obsidian/plugins/base-graph";

mkdirSync(targetDir, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
	copyFileSync(file, `${targetDir}/${file}`);
}
