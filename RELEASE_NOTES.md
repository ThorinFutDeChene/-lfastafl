# Alfastafl 0.2.0-dev1 (DEV)

## Rules engine: critical fixes

- Separate historical Tawlbwrdd Bell, 2018 Fetlar and Copenhagen adjudication.
- Close king captures only on the attacking move; correct weak/strong king cases.
- Implement Copenhagen shieldwall, including king immunity and hostile corners.
- Add defender enclosure victory for attackers in applicable variants.
- Detect two canonical Copenhagen exit-fort formations conservatively.
- Resolve stalemates per variant and threefold repetitions per accepted rules.
- Historical repetition: pause, player votes, automatic rollback when disagreed,
  temporary prohibition of the offending move.
- Draw proposals and voluntary resignation with per-player authorization.
- Browser highlights only moves confirmed by the host's rules engine.
- Preserve saved-game compatibility and the update mechanism from dev4.

## Honest limits

Exit-fort detection is not exhaustive. Complex Fetlar dead draws and unusual
boundary encirclements still require validation. 3D/animations, clocks,
LAN discovery and automated firewall rules remain in future development.
See RULES.md for full references and exceptions.
