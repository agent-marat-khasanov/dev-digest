# Eval run ledger

Append-only. One row per meaningful run. Score = passed/total assertions per arm.

| Date | Target | Mode | With skill | Without skill | Notes |
|---|---|---|---|---|---|
| 2026-07-13 | onion-architecture (evals 0-2) | generative, 1 run/config | 17/18 (94%) | 18/18 (100%) | Skill LOST: its "all ports live in vendor/shared" claim was factually wrong; baseline placed the Notifier port correctly from the Tokenizer precedent. Skill fixed afterwards (port-placement rule). Evals 1-2 retired: no trap, both arms perfect. |
| 2026-07-14 | onion-architecture (evals 0,3,4) | generative, 1 run/config | 16/16 (100%) | 16/16 (100%) | No delta: AGENTS.md + the codebase + the PreToolUse hook teach the baseline the same rules. Conclusion recorded: generative A/B here works only as a regression gate. |
| 2026-07-23 | onion-architecture (evals 5-7) | review-mode on planted fixtures, 1 run/config | 17/17 (100%) | 15/17 (88%) | First positive delta. All signal from eval-7 decoys: baseline missed the mis-placed server-only ArchiveStore port in vendor/shared AND false-positived the sanctioned Clock-beside-adapter pattern. Arbitrations: assertion 5.5 removed (planted "violation" is real repo convention), decoy 6.4 narrowed (local LLMProvider redeclaration is a legitimate finding). |
| 2026-07-24 | onion-architecture NEW (rule 8: mcp/ thin client) vs OLD snapshot (evals 7-8) | review-mode, old_skill baseline, 1 run/config | new: 10/10 (100%) | old: 10/10 (100%) | No quantitative delta: the old-skill agent recovered the mcp boundary from mcp/README.md + code (environment teaches what the skill teaches — same effect as iterations 1-2). Qualitative: new-skill agent cited rule 8 directly. Regression clean: eval-7 6/6 on both versions. |
