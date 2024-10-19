// Axios Device Types

export interface whiskerResponse {
  data: {
    query: Array<Robot>;
  };
}

export interface Robot {
  serial: string;
  name: string;
  state: RobotState;
}

export interface RobotState {
  info: RobotStateInfo;
}

export interface RobotStateInfo {
  level: number;
  autoNightMode: boolean;
}