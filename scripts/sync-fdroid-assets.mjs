import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// F-Droid builds the Android module with Gradle instead of Capacitor's CLI.
// This performs only the deterministic asset/configuration copy that `cap sync
// android` performs for Alpha. No network request, signing key, telemetry, or
// platform account is involved.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webAssets = resolve(root, "mobile-dist");
const androidAssets = resolve(root, "android", "app", "src", "main", "assets");

await rm(resolve(androidAssets, "public"), { recursive: true, force: true });
await mkdir(androidAssets, { recursive: true });
await cp(webAssets, resolve(androidAssets, "public"), { recursive: true });

const capacitorConfig = {
  appId: "com.codewithpb11.alphabot",
  appName: "Alpha",
  webDir: "mobile-dist",
  android: { allowMixedContent: false },
  server: { androidScheme: "https" },
};

await writeFile(
  resolve(androidAssets, "capacitor.config.json"),
  `${JSON.stringify(capacitorConfig, null, 2)}\n`,
);
await writeFile(resolve(androidAssets, "capacitor.plugins.json"), "[]\n");

console.log("Synced deterministic Android assets for the F-Droid Gradle build.");
