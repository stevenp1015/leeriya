# Shared Contracts

## Control websocket event envelopes

```json
{
  "type": "control.patch",
  "payload": {
    "patch": {
      "density": 0.62,
      "guidance": 4.3
    }
  }
}
```

```json
{
  "type": "prompt.add",
  "payload": {
    "text": "Minimal techno with saturated bass",
    "weight": 1.2
  }
}
```

```json
{
  "type": "playback.command",
  "payload": {
    "command": "play"
  }
}
```

## Server envelope

```json
{
  "type": "server.state_snapshot",
  "payload": {
    "room_id": "...",
    "prompts": [],
    "music_config": {},
    "participants": {},
    "playback_state": "paused"
  }
}
```
