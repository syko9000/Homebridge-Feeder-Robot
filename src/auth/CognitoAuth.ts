import {
  AuthenticationDetails,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  ICognitoStorage,
} from 'amazon-cognito-identity-js';
import type { Logger } from 'homebridge';

// Whisker's Cognito user pool backing the mobile app login (reverse-engineered by pylitterbot).
const USER_POOL_ID = 'us-east-1_rjhNnZVAm';
const CLIENT_ID = '4552ujeu3aic90nf8qn53levmn';

// pylitterbot refreshes a bit before expiry to avoid racing a token that expires mid-request.
const REFRESH_LEEWAY_SECONDS = 30;

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  /** Unix seconds, from the id token's `exp` claim. */
  expiresAt: number;
}

/**
 * amazon-cognito-identity-js defaults to `window.localStorage`, which doesn't exist under
 * Homebridge's plain Node process. This keeps the SDK's internal session bookkeeping in memory.
 */
class MemoryStorage implements ICognitoStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Handles Whisker/Cognito authentication using the USER_SRP_AUTH flow, and keeps the resulting
 * tokens fresh. Mirrors pylitterbot's `pycognito`-based session handling.
 */
export class CognitoAuth {
  private readonly userPool: CognitoUserPool;
  private readonly storage: ICognitoStorage;
  private cognitoUser?: CognitoUser;
  private tokens?: CognitoTokens;
  private refreshPromise?: Promise<CognitoTokens>;

  constructor(
    private readonly email: string,
    private readonly password: string,
    private readonly log: Logger,
  ) {
    this.storage = new MemoryStorage();
    this.userPool = new CognitoUserPool({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      Storage: this.storage,
    });
  }

  /**
   * Returns a valid id token, logging in or refreshing as needed. This is the token every
   * GraphQL/REST call should send as `Authorization: Bearer <idToken>`.
   */
  public async getIdToken(): Promise<string> {
    if (!this.tokens) {
      await this.login();
    } else if (this.isExpiringSoon(this.tokens)) {
      await this.refresh();
    }
    return this.tokens!.idToken;
  }

  /**
   * Authenticates from scratch via SRP. Called on first use, and as a fallback if a refresh
   * token turns out to be invalid or expired.
   */
  public async login(): Promise<CognitoTokens> {
    this.log.debug('Whisker: authenticating with Cognito (USER_SRP_AUTH)');

    this.cognitoUser = new CognitoUser({
      Username: this.email,
      Pool: this.userPool,
      Storage: this.storage,
    });

    const authenticationDetails = new AuthenticationDetails({
      Username: this.email,
      Password: this.password,
    });

    const session = await new Promise<CognitoUserSession>((resolve, reject) => {
      this.cognitoUser!.authenticateUser(authenticationDetails, {
        onSuccess: resolve,
        onFailure: reject,
      });
    });

    this.tokens = this.extractTokens(session);
    this.log.debug('Whisker: authenticated, id token expires at', new Date(this.tokens.expiresAt * 1000).toISOString());
    return this.tokens;
  }

  private isExpiringSoon(tokens: CognitoTokens): boolean {
    const nowSeconds = Date.now() / 1000;
    return tokens.expiresAt - nowSeconds <= REFRESH_LEEWAY_SECONDS;
  }

  /** Coalesces concurrent refresh calls so parallel API requests don't each trigger their own. */
  private async refresh(): Promise<CognitoTokens> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = undefined;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<CognitoTokens> {
    if (!this.cognitoUser || !this.tokens) {
      return this.login();
    }

    this.log.debug('Whisker: refreshing Cognito tokens');
    const refreshToken = new CognitoRefreshToken({ RefreshToken: this.tokens.refreshToken });

    try {
      const session = await new Promise<CognitoUserSession>((resolve, reject) => {
        this.cognitoUser!.refreshSession(refreshToken, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
      this.tokens = this.extractTokens(session);
      return this.tokens;
    } catch (err) {
      this.log.warn('Whisker: token refresh failed, re-authenticating from scratch:', (err as Error).message);
      return this.login();
    }
  }

  private extractTokens(session: CognitoUserSession): CognitoTokens {
    const idToken = session.getIdToken();
    return {
      accessToken: session.getAccessToken().getJwtToken(),
      idToken: idToken.getJwtToken(),
      refreshToken: session.getRefreshToken().getToken(),
      expiresAt: idToken.getExpiration(),
    };
  }
}
