# Latency Tuning

## Backend

- Keep room and Lyria process in the same region.
- Run in DFW for balanced Florida/LA latency.
- Track p95 control event round trip and audio queue depth.

## Frontend

- Audio queue target: avoid underflow while keeping queue depth low.
- Reduce visualizer detail on low-end devices by lowering geometry detail in `LiquidBlob.tsx`.
- Keep control events lightweight and patch-only.

## Next optimization (post-MVP)

- Add Opus transport mode for lower bandwidth.
- Add telemetry endpoint for p95 sync and underrun rates.
