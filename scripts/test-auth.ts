/**
 * Standalone script to confirm Cognito login works against a real Whisker account
 * before wiring it into the Homebridge plugin.
 *
 * Usage:
 *   WHISKER_EMAIL=you@example.com WHISKER_PASSWORD=secret npm run test:auth
 *   npm run test:auth -- you@example.com secret
 */
import type { Logging } from 'homebridge';
import { CognitoAuth } from '../src/auth/CognitoAuth';

function makeConsoleLogger(): Logging {
  const logger = ((message: string, ...params: unknown[]) => console.log(message, ...params)) as Logging;
  logger.prefix = 'test-auth';
  logger.info = (message: string, ...params: unknown[]) => console.log('[INFO]', message, ...params);
  logger.warn = (message: string, ...params: unknown[]) => console.warn('[WARN]', message, ...params);
  logger.error = (message: string, ...params: unknown[]) => console.error('[ERROR]', message, ...params);
  logger.debug = (message: string, ...params: unknown[]) => console.log('[DEBUG]', message, ...params);
  logger.log = (_level, message: string, ...params: unknown[]) => console.log(message, ...params);
  return logger;
}

function truncate(token: string): string {
  return `${token.slice(0, 24)}...`;
}

async function main() {
  const email = process.env.WHISKER_EMAIL ?? process.argv[2];
  const password = process.env.WHISKER_PASSWORD ?? process.argv[3];

  if (!email || !password) {
    console.error('Usage: WHISKER_EMAIL=... WHISKER_PASSWORD=... npm run test:auth');
    console.error('   or: npm run test:auth -- <email> <password>');
    process.exitCode = 1;
    return;
  }

  const auth = new CognitoAuth(email, password, makeConsoleLogger());

  console.log('Logging in via Cognito USER_SRP_AUTH...');
  const tokens = await auth.login();
  console.log('Login succeeded:');
  console.log('  access token: ', truncate(tokens.accessToken));
  console.log('  id token:     ', truncate(tokens.idToken));
  console.log('  refresh token:', truncate(tokens.refreshToken));
  console.log('  expires at:   ', new Date(tokens.expiresAt * 1000).toISOString());

  console.log('\nCalling getIdToken() again (should reuse the cached token, not re-login)...');
  const idToken = await auth.getIdToken();
  console.log('  same token as login():', idToken === tokens.idToken);
}

main().catch((err) => {
  console.error('Auth test failed:', err);
  process.exitCode = 1;
});
