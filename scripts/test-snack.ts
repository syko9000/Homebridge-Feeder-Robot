/**
 * Standalone script to confirm the GIVE_SNACK command actually reaches a real feeder.
 * This dispenses food -- only run it when you mean to.
 *
 * Usage:
 *   WHISKER_EMAIL=you@example.com WHISKER_PASSWORD=secret npm run test:snack
 *   npm run test:snack -- you@example.com secret
 */
import type { Logging } from 'homebridge';
import { CognitoAuth } from '../src/auth/CognitoAuth';
import { WhiskerApiClient } from '../src/api/WhiskerApiClient';

function makeConsoleLogger(): Logging {
  const logger = ((message: string, ...params: unknown[]) => console.log(message, ...params)) as Logging;
  logger.prefix = 'test-snack';
  logger.info = (message: string, ...params: unknown[]) => console.log('[INFO]', message, ...params);
  logger.warn = (message: string, ...params: unknown[]) => console.warn('[WARN]', message, ...params);
  logger.error = (message: string, ...params: unknown[]) => console.error('[ERROR]', message, ...params);
  logger.debug = (message: string, ...params: unknown[]) => console.log('[DEBUG]', message, ...params);
  logger.log = (_level, message: string, ...params: unknown[]) => console.log(message, ...params);
  return logger;
}

async function main() {
  const email = process.env.WHISKER_EMAIL ?? process.argv[2];
  const password = process.env.WHISKER_PASSWORD ?? process.argv[3];

  if (!email || !password) {
    console.error('Usage: WHISKER_EMAIL=... WHISKER_PASSWORD=... npm run test:snack');
    console.error('   or: npm run test:snack -- <email> <password>');
    process.exitCode = 1;
    return;
  }

  const log = makeConsoleLogger();
  const auth = new CognitoAuth(email, password, log);
  const client = new WhiskerApiClient(auth, log);

  const feeders = await client.getFeeders();
  if (feeders.length === 0) {
    console.log('No feeders on this account.');
    return;
  }

  const feeder = feeders[0];
  console.log(`Sending GIVE_SNACK to ${feeder.name} (serial ${feeder.serial})...`);
  await client.giveSnack(feeder.serial);
  console.log('Command sent successfully.');
}

main().catch((err) => {
  console.error('Snack test failed:', err);
  process.exitCode = 1;
});
