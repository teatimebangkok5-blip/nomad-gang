// Copies the Terms / Privacy text (src/legal/content.ts) to the web app (web/src/lib/legal-content.ts), so the app
// screens and the public web pages always say the same. `--check` only compares and fails if they differ.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../src/legal/content.ts", import.meta.url));
const target = fileURLToPath(new URL("../../web/src/lib/legal-content.ts", import.meta.url));
const text = readFileSync(source, "utf8");

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {}
  if (current !== text) {
    console.error("web/src/lib/legal-content.ts differs from mobile/src/legal/content.ts. Run `npm run sync:legal`.");
    process.exit(1);
  }
  console.log("Legal texts are in sync.");
} else {
  writeFileSync(target, text);
  console.log("Copied the legal texts to web/src/lib/legal-content.ts.");
}
