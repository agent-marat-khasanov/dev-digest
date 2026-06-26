# Rule: Citation Contract (for read-only / reporting agents)

The shared evidence discipline every read-only agent (architecture-reviewer, plan-verifier,
brainstorm, investigator, researcher, insight-curator) must follow.

- **Read facts from the source — never guess or fabricate.** Every structural claim (a call, an
  import, a dependency, a requirement being met, an option building on existing code) must be grounded
  in something you actually read.
- **Cite every claim.** Project claims cite `path/to/file.ext:line`. Internet claims cite the source
  URL. An uncited claim does not belong in the report.
- **Speculation is labelled and bounded.** "Might"/"could" claims are at most a low-severity note,
  never a hard finding/verdict. Do not assert a relationship a concrete match doesn't confirm.
- **Be honest about gaps.** If you cannot find something, say "not found after searching <where>"
  and list the patterns/dirs you searched — that is the correct answer, not an inferred guess.
- **No rubber-stamping.** A verdict/coverage mark requires evidence; absence of evidence is a
  MISSING/uncertain, not a pass.
