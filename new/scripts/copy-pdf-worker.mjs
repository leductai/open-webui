import {copyFileSync, existsSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "..");
const source = join(webRoot, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const targetDir = join(webRoot, "public");
const target = join(targetDir, "pdf.worker.min.mjs");

if (existsSync(source)) {
  mkdirSync(targetDir, {recursive: true});
  copyFileSync(source, target);
}
