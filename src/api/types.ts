// Wire values confirmed from pylitterbot's FeederRobotCommand enum -- the API expects these
// camelCase strings, not the SCREAMING_SNAKE_CASE enum *names*.
export type FeederCommand =
  | 'giveSnack'
  | 'setGravityMode'
  | 'setAutoNightMode'
  | 'setPanelLockout';

/** Food level enum (0-9) as reported by the feeder. See {@link foodLevelToPercent} for the % mapping. */
export type FoodLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * `info` is a jsonb column in Whisker's Hasura schema (confirmed via live introspection), so
 * GraphQL returns it as a single opaque blob rather than a selectable set of fields. This
 * describes the keys the plugin relies on; the feeder also reports several undocumented keys
 * (chuteFull, unitMeals, motorJammed, activeSession, ...) which are still reachable via the
 * index signature below.
 */
export interface FeederStateInfo {
  level: FoodLevel;
  power: boolean;
  onBoarded: boolean;
  online: boolean;
  gravity: boolean;
  autoNightMode: boolean;
  panelLockout: boolean;
  acPower: boolean;
  dcPower: boolean;
  fwVersion: string;
  [key: string]: unknown;
}

export interface ScheduleMeal {
  id?: string;
  name?: string;
  mealNumber: number;
  hour: number;
  minute: number;
  days: string[];
  portions: number;
  paused: boolean;
  skip: boolean | null;
  scheduleId?: string | null;
}

/** `feeder_schedule` -- an OBJECT type, not jsonb; `meals` within it is jsonb. */
export interface FeederSchedule {
  id: string;
  name: string;
  meals: ScheduleMeal[];
}

export interface FeederState {
  id: number;
  info: FeederStateInfo;
  active_schedule?: FeederSchedule | null;
}

export type FeedingStatus = string;

/** `feeder_feeding_meal` row, confirmed via live introspection. */
export interface FeedingMealEntry {
  amount: number;
  meal_name: string | null;
  meal_number: number;
  meal_total_portions: number | null;
  serial: string;
  status: FeedingStatus;
  timestamp: string;
}

/** `feeder_feeding_snack` row, confirmed via live introspection. */
export interface FeedingSnackEntry {
  amount: number;
  serial: string;
  status: FeedingStatus | null;
  timestamp: string;
}

export interface FeederUnit {
  id: number;
  name: string;
  serial: string;
  timezone: string;
  isEighthCupEnabled?: boolean;
  created_at: string;
  household_id: number | null;
  state: FeederState;
  feeding_meal?: FeedingMealEntry[];
  feeding_snack?: FeedingSnackEntry[];
}

export interface ScheduleInput {
  id: string;
  name: string;
  serial: string;
  createdAt?: string | null;
  meals: ScheduleMeal[];
}

/** Feeder food level is reported as an enum 0-9; HomeKit characteristics here want 0-100. */
export const FOOD_LEVEL_PERCENT: Record<FoodLevel, number> = {
  9: 100,
  8: 70,
  7: 60,
  6: 50,
  5: 40,
  4: 30,
  3: 20,
  2: 10,
  1: 5,
  0: 0,
};

export function foodLevelToPercent(level: number): number {
  return FOOD_LEVEL_PERCENT[level as FoodLevel] ?? 0;
}
