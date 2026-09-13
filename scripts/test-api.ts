/**
 * Standalone script to confirm the GraphQL feeder query (and its assumed field shapes) still
 * matches Whisker's live API. Only reads state -- it does not send any commands.
 *
 * Usage:
 *   WHISKER_EMAIL=you@example.com WHISKER_PASSWORD=secret npm run test:api
 *   npm run test:api -- you@example.com secret
 */
import type { Logging } from 'homebridge';
import { CognitoAuth } from '../src/auth/CognitoAuth';
import { WhiskerApiClient } from '../src/api/WhiskerApiClient';
import { foodLevelToPercent } from '../src/api/types';

function makeConsoleLogger(): Logging {
  const logger = ((message: string, ...params: unknown[]) => console.log(message, ...params)) as Logging;
  logger.prefix = 'test-api';
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
    console.error('Usage: WHISKER_EMAIL=... WHISKER_PASSWORD=... npm run test:api');
    console.error('   or: npm run test:api -- <email> <password>');
    process.exitCode = 1;
    return;
  }

  const log = makeConsoleLogger();
  const auth = new CognitoAuth(email, password, log);
  const client = new WhiskerApiClient(auth, log);

  console.log('Fetching feeders...');
  const feeders = await client.getFeeders();

  if (feeders.length === 0) {
    console.log('No feeders returned for this account.');
    return;
  }

  for (const feeder of feeders) {
    console.log(`\n${feeder.name} (serial ${feeder.serial})`);
    console.log('  id:       ', feeder.id);
    console.log('  timezone: ', feeder.timezone);
    console.log('  raw state.info:', JSON.stringify(feeder.state?.info));
    console.log('  raw state.active_schedule:', JSON.stringify(feeder.state?.active_schedule));

    const info = feeder.state?.info;
    if (info) {
      console.log('  parsed:');
      console.log('    level:         ', info.level, `(${foodLevelToPercent(info.level)}%)`);
      console.log('    power:         ', info.power);
      console.log('    online:        ', info.online);
      console.log('    onBoarded:     ', info.onBoarded);
      console.log('    gravity:       ', info.gravity);
      console.log('    autoNightMode: ', info.autoNightMode);
      console.log('    panelLockout:  ', info.panelLockout);
      console.log('    acPower/dcPower:', info.acPower, '/', info.dcPower);
      console.log('    fwVersion:     ', info.fwVersion);
    }

    const schedule = feeder.state?.active_schedule;
    if (schedule) {
      console.log(`  active schedule "${schedule.name}" (${schedule.meals.length} meals):`);
      for (const meal of schedule.meals) {
        console.log(`    #${meal.mealNumber} ${meal.name ?? ''} ${meal.hour}:${String(meal.minute).padStart(2, '0')}`,
          `portions=${meal.portions} paused=${meal.paused} days=${meal.days.join(',')}`);
      }
    }

    console.log('  feeding_meal count: ', feeder.feeding_meal?.length ?? 0);
    console.log('  feeding_snack count:', feeder.feeding_snack?.length ?? 0);
    if (feeder.feeding_meal?.[0]) {
      console.log('  sample feeding_meal entry:', JSON.stringify(feeder.feeding_meal[0]));
    }
  }
}

main().catch((err) => {
  console.error('API test failed:', err);
  process.exitCode = 1;
});
