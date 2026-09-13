import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from 'homebridge';

import { CognitoAuth } from '../auth/CognitoAuth';
import { FeederCommand, FeederUnit, ScheduleInput } from './types';

const GRAPHQL_URL = 'https://cognito.hasura.iothings.site/v1/graphql';
const COMMAND_URL = 'https://42nk7qrhdg.execute-api.us-east-1.amazonaws.com/prod/command/feeder';
const SCHEDULE_URL = 'https://42nk7qrhdg.execute-api.us-east-1.amazonaws.com/prod/feeder/schedule';
const SCHEDULE_CLEAR_URL = `${SCHEDULE_URL}/clear`;
const COMMAND_API_KEY = 'w2tPFbjlP13GUmb8dMjUL5B2YyPVD3pJ7Ey6fz8v';

// Field shapes confirmed via live GraphQL introspection against Whisker's Hasura schema.
// `info` and `active_schedule.meals` are jsonb columns (opaque blobs); everything else here
// is a real, selectable field.
const FEEDER_FIELDS = `
  id
  name
  serial
  timezone
  isEighthCupEnabled
  created_at
  household_id
  state {
    id
    info
    active_schedule {
      id
      name
      meals
    }
  }
  feeding_meal(limit: 25, order_by: {timestamp: desc}) {
    amount
    meal_name
    meal_number
    meal_total_portions
    serial
    status
    timestamp
  }
  feeding_snack(limit: 25, order_by: {timestamp: desc}) {
    amount
    serial
    status
    timestamp
  }
`;

const LIST_FEEDERS_QUERY = `
  query GetFeeders {
    feeder_unit {
      ${FEEDER_FIELDS}
    }
  }
`;

const GET_FEEDER_QUERY = `
  query GetFeeder($id: Int!) {
    feeder_unit_by_pk(id: $id) {
      ${FEEDER_FIELDS}
    }
  }
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Wraps the Whisker GraphQL (Hasura) API and the two AWS API Gateway REST endpoints used to
 * control a Feeder-Robot. Ported from pylitterbot's reverse-engineered API surface.
 */
export class WhiskerApiClient {
  constructor(
    private readonly auth: CognitoAuth,
    private readonly log: Logger,
  ) {}

  public async getFeeders(): Promise<FeederUnit[]> {
    const data = await this.graphqlRequest<{ feeder_unit: FeederUnit[] }>(LIST_FEEDERS_QUERY);
    return data.feeder_unit;
  }

  public async getFeeder(id: number): Promise<FeederUnit | null> {
    const data = await this.graphqlRequest<{ feeder_unit_by_pk: FeederUnit | null }>(GET_FEEDER_QUERY, { id });
    return data.feeder_unit_by_pk;
  }

  public async giveSnack(serial: string): Promise<void> {
    await this.sendCommand('giveSnack', serial, 1);
  }

  public async setGravityMode(serial: string, enabled: boolean): Promise<void> {
    await this.sendCommand('setGravityMode', serial, enabled ? 1 : 0);
  }

  public async setAutoNightMode(serial: string, enabled: boolean): Promise<void> {
    await this.sendCommand('setAutoNightMode', serial, enabled ? 1 : 0);
  }

  public async setPanelLockout(serial: string, enabled: boolean): Promise<void> {
    await this.sendCommand('setPanelLockout', serial, enabled ? 1 : 0);
  }

  public async setSchedule(schedule: ScheduleInput, setActive = true): Promise<void> {
    await this.restRequest(SCHEDULE_URL, { schedule, setActive });
  }

  public async clearSchedule(serial: string): Promise<void> {
    await this.restRequest(SCHEDULE_CLEAR_URL, { serial });
  }

  private async sendCommand(command: FeederCommand, serial: string, value: 0 | 1): Promise<void> {
    await this.restRequest(COMMAND_URL, { command, id: uuidv4(), serial, value });
  }

  private async restRequest(url: string, body: Record<string, unknown>): Promise<void> {
    const idToken = await this.auth.getIdToken();
    this.log.debug('Whisker: POST', url, JSON.stringify(body));

    try {
      await axios.post(url, body, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'x-api-key': COMMAND_API_KEY,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      throw this.describeError(`Whisker API request to ${url}`, err);
    }
  }

  private async graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const idToken = await this.auth.getIdToken();

    let json: GraphQLResponse<T>;
    try {
      const response = await axios.post<GraphQLResponse<T>>(
        GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      json = response.data;
    } catch (err) {
      throw this.describeError('Whisker GraphQL request', err);
    }

    if (json.errors?.length) {
      throw new Error(`Whisker GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
    }
    if (!json.data) {
      throw new Error('Whisker GraphQL response missing data');
    }
    return json.data;
  }

  private describeError(context: string, err: unknown): Error {
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      const body = JSON.stringify(axiosErr.response?.data);
      return new Error(`${context} failed: ${status ?? 'network error'} ${body ?? axiosErr.message}`);
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
