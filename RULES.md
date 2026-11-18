# Alfastafl: implemented tafl rules and interpretations

This document identifies the **three distinct rule references** for the public,
experimental implementation. It does not claim that every historical detail is known.

## References

- Historical 11x11 Tawlbwrdd, Bell / diamond reconstruction: Aage Nielsen,
  https://aagenielsen.dk/tawlbwrdd_summary.php and the *Historical Hnefatafl*
  printed rules at https://aagenielsen.dk/TaflRulesEnglish.pdf .
- Classic 11x11 Fetlar: **2018 Fetlar Museum Trust leaflet**, not the later
  web summary: https://aagenielsen.dk/fetlar_rules2018visual.pdf .
- Competition 11x11 Copenhagen: https://aagenielsen.dk/copenhagen_rules.php
  and the updated illustrated rule set
  https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf .

## Rule overview

| Detail | Historical | Fetlar 2018 | Copenhagen |
|---|---|---|---|
| Initial setup | Bell / diamond | T / diamond | T / diamond |
| Move first | Attackers | Attackers | Attackers |
| King escape | Any edge | Four corners | Four corners |
| King capture | 2 sides away from throne; 4 on throne; 3 + empty throne beside | 4 attacking pieces; cannot be captured on edge | 4 attackers, or 3 + empty throne beside; not on edge |
| Corner restricted | No | Yes | Yes |
| Shieldwall | No | No | Yes, closed by a flanking move |
| Attacker encirclement victory | Yes | No | Yes |
| Exit fort | No | No | Yes |
| No legal move | Loss | Draw | Loss |
| Third identical position | Players adjudicate, or revert | Draw | Defender defeat |

The game records every board position **with the player to move**, not just
piece locations. It never captures the king merely because he voluntarily
enters a hostile sandwich. Restricted squares are hostile in the usual way;
the empty throne is hostile to both soldiers, while an occupied throne is
friendly to the king's men.

## Player adjudication

In historical mode, the third repetition pauses the game. Two identified
players must agree on a winner or a draw. A disagreement rolls back the
latest move, forbids that exact move temporarily and permits another move.
If no alternative legal move exists, a draw must be proposed and agreed.
This is a documented **Alfastafl implementation convention**, not a fully
attested Viking rule. The server does **not** arbitrarily guess which player
was the aggressor.

All modes also allow a draw by mutual agreement and a voluntary resignation.

## Remaining gaps before the rules can be certified

1. **Exit forts:** automatic recognition is deliberately conservative. It
   recognizes translations, reflections and rotations of the **two examples
   shown in the Copenhagen source**. Other unbreakable formations require
   additional rules work. The program does not award wins merely because
   a formation resembles an unbreakable fortress.
2. **Fetlar 2018 drawn deadlocks:** impossible-to-finish positions can be
   resolved by mutual draw offer. The software automatically detects
   third repetitions and when the next player has no legal move, but not
   every kind of theoretical non-terminating position described in the leaflet.
3. **Historical threat responsibility:** no unverified automatic winner
   assignment; human agreement as already specified by the project.
4. **Formal encirclement verification:** the current ring test checks that
   no defender or king is connected to the board perimeter without crossing
   an attacker. We will compare further unusual boundary configurations
   against reference positions before certifying full compliance.
5. Formal tournament-judge validation of the full rule sets is outstanding.

These limitations must remain visible until they are actually resolved.
