# Homebridge Feeder-Robot

Homebridge plugin for the Whisker Feeder-Robot automatic pet feeder, exposing it to Apple
HomeKit. Talks to the same Cognito/GraphQL/REST API as the Whisker mobile app (reverse-engineered
by [pylitterbot](https://github.com/natekspencer/pylitterbot)).

## Features (v1)

- **Food level** — shown as a `%` sensor (Home renders it as a Humidity Sensor tile; a standalone
  Filter Maintenance service, which would be the more accurate HomeKit type, doesn't get its own
  tile in the Home app)
- **Feed Now** — a momentary switch that dispenses a snack

Gravity mode, night light, panel lockout, and feeding-schedule editing are supported by the
underlying API client but not yet wired up to HomeKit accessories.

## Installation

#### Homebridge Config UI X

Search for `Feeder Robot` in the Plugins tab and install it.

#### Command line

```bash
npm install -g homebridge-feeder-robot
```

## Configuration

### Config UI X

Enter the email and password you use for the Whisker app.

### Manual `config.json`

```json
{
  "platform": "FeederRobot",
  "name": "FeederRobot",
  "email": "you@example.com",
  "password": "your-whisker-app-password",
  "pollingIntervalSeconds": 60
}
```

| Key                      | Required | Default | Description                                      |
| ------------------------ | -------- | ------- | ------------------------------------------------- |
| `email`                  | yes      | —       | Whisker app account email                          |
| `password`               | yes      | —       | Whisker app account password                       |
| `pollingIntervalSeconds` | no       | `60`    | How often to refresh feeder state from the API     |
| `debugMode`               | no       | `false` | Verbose logging                                    |

## Limitations

- One Whisker account per platform block; if you have multiple accounts, add multiple platform
  entries.
- State updates via polling only for now — no push/WebSocket updates yet.

## Contributing

PRs and issues are welcome.
