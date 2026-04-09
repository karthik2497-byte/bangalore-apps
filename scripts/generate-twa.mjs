/**
 * generate-twa.mjs - Programmatically generate a TWA project from a web manifest URL.
 * Bypasses the interactive bubblewrap CLI by using @bubblewrap/core directly.
 *
 * Usage: node generate-twa.mjs <manifest-url> <target-dir> <keystore-path>
 */
import { TwaManifest, TwaGenerator, ConsoleLog, BufferedLog } from '@bubblewrap/core';
import { join } from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const manifestUrl = process.argv[2];
const targetDir = process.argv[3] || '.';
const keystorePath = process.argv[4] || './android.keystore';

if (!manifestUrl) {
  console.error('Usage: node generate-twa.mjs <manifest-url> <target-dir> [keystore-path]');
  process.exit(1);
}

async function main() {
  console.log(`Fetching web manifest: ${manifestUrl}`);
  const twaManifest = await TwaManifest.fromWebManifest(manifestUrl);

  // Override signing key to use our CI-generated keystore
  twaManifest.signingKey = { path: keystorePath, alias: 'android' };

  // Force standalone display and portrait orientation
  twaManifest.display = 'standalone';
  twaManifest.orientation = 'portrait';

  // Set generator app name
  twaManifest.generatorApp = 'bubblewrap-ci';

  // Save twa-manifest.json
  mkdirSync(targetDir, { recursive: true });
  const manifestPath = join(targetDir, 'twa-manifest.json');
  await twaManifest.saveToFile(manifestPath);
  console.log(`Saved: ${manifestPath}`);
  console.log(`  packageId: ${twaManifest.packageId}`);
  console.log(`  host: ${twaManifest.host}`);
  console.log(`  name: ${twaManifest.name}`);
  console.log(`  startUrl: ${twaManifest.startUrl}`);
  console.log(`  iconUrl: ${twaManifest.iconUrl}`);

  // Generate Android project files
  const log = new BufferedLog(new ConsoleLog('generate-twa'));
  const generator = new TwaGenerator();
  await generator.createTwaProject(targetDir, twaManifest, log);
  log.flush();

  // Generate manifest-checksum.txt (prevents bubblewrap build from asking to regenerate)
  const manifestContents = readFileSync(manifestPath);
  const checksum = createHash('sha1').update(manifestContents).digest('hex');
  writeFileSync(join(targetDir, 'manifest-checksum.txt'), checksum);
  console.log(`Wrote manifest-checksum.txt: ${checksum}`);

  console.log('TWA Android project generated successfully');
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
