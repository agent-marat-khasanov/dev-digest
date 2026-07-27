import type { SkillCase } from "../../src/index.js";

// Evals for the `security` skill (OWASP Top 10:2025 reviewer). `skillTask` runs
// content-only (the SKILL.md payload as system prompt, no tools), so each fixture
// is inlined into the prompt — standing in for what a reviewer would open with Read.
//
// The discriminating power is in the DECOYS: a good security reviewer must flag the
// real, attacker-controlled sinks AND stay silent on server-controlled / framework-
// mitigated patterns (the skill's "golden rule": `fetch(process.env.URL)` = safe).
//
// Scaffolded per the lab pattern — mirror `onion-architecture.cases.ts`.

const VULN_SLICE = `\`\`\`js
// src/routes/users.js
const jwt = require("jsonwebtoken");
const db = require("../db");

router.get("/users/:id/orders", async (req, res) => {
  const user = jwt.decode(req.headers.authorization);           // (1)
  const orders = await db.query(
    \`SELECT * FROM orders WHERE user_id = '\${req.params.id}'\`,   // (2)
  );
  res.json(orders);
});

const STRIPE_KEY = "sk_live_EXAMPLE_FAKE_KEY_DO_NOT_USE";       // (3)
\`\`\``;

const MIXED_SLICE = `\`\`\`js
// src/routes/reports.js
router.get("/reports/:id", requireAuth, async (req, res) => {
  const report = await Report.findById(req.params.id);          // (A)
  res.json(report);
});
\`\`\`

\`\`\`js
// src/services/fetcher.js
async function pullConfig() {
  return fetch(process.env.CONFIG_URL);                          // (B) safe: server-controlled
}
\`\`\`

\`\`\`js
// src/db/search.js
function search(term) {
  return db.query("SELECT * FROM items WHERE name = $1", [term]); // (C) safe: parameterized
}
\`\`\``;

const NOSQL_SLICE = `\`\`\`js
// src/routes/auth.js
router.post("/login", async (req, res) => {
  const user = await User.findOne({
    username: req.body.username,
    password: req.body.password,                                 // (i)
  });
  res.json({ token: sign(user) });
});
\`\`\`

\`\`\`js
// src/routes/profile.js
router.patch("/profile", requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $set: req.body }); // (ii)
  res.sendStatus(204);
});
\`\`\``;

export const cases: SkillCase[] = [
  {
    name: "flags the three attacker-controlled vulnerabilities in users.js",
    kind: "quality",
    prompt: `Review this Express/JWT code strictly for security vulnerabilities. Report each as a concrete finding naming the file and the exploit; do not rewrite the code.\n\n${VULN_SLICE}`,
    grounding: ["users.js"],
    practices: [
      "flagged SQL injection at (2): `req.params.id` is interpolated straight into the query string via a template literal, so an attacker controls the WHERE clause (OWASP A05 Injection)",
      "flagged that (1) uses `jwt.decode()` instead of `jwt.verify()` — it accepts an unsigned or forged token because the signature is never checked (A07 Authentication Failures)",
      "flagged missing access control: no ownership check that the authenticated caller owns `:id`, so any user can read any user's orders — IDOR (A01 Broken Access Control)",
      "flagged the hardcoded live Stripe secret key literal at (3) committed in source (A04 Cryptographic Failures / secret management)",
    ],
    threshold: 0.75,
    maxTurns: 6,
  },
  {
    name: "flags the real IDOR but stays silent on the safe env-fetch and parameterized query (decoy discrimination)",
    kind: "quality",
    prompt: `Review these three files for security vulnerabilities. Report only genuine, attacker-exploitable issues; do not flag safe, server-controlled, or framework-mitigated patterns.\n\n${MIXED_SLICE}`,
    grounding: ["reports.js"],
    practices: [
      "flagged the IDOR at (A) in reports.js: `Report.findById(req.params.id)` runs after `requireAuth` but never checks the report belongs to the caller, so any logged-in user reads any report (A01)",
      "did NOT flag (B) `fetch(process.env.CONFIG_URL)` as SSRF — the URL comes from a server-controlled environment variable, not attacker input (the skill's golden rule)",
      "did NOT flag (C) `db.query(\"... name = $1\", [term])` — it is a parameterized query and is not injectable",
    ],
    threshold: 0.75,
    maxTurns: 6,
  },
  {
    name: "flags NoSQL operator injection and mass assignment",
    kind: "quality",
    prompt: `Review this Express/Mongoose code for security vulnerabilities. Name the file and the exploit for each finding.\n\n${NOSQL_SLICE}`,
    grounding: ["auth.js", "profile.js"],
    practices: [
      "flagged NoSQL operator injection at (i): `req.body.username`/`password` are passed directly into `findOne`, so an attacker sends `{\"$gt\":\"\"}` to bypass the credential check (A05 Injection)",
      "flagged mass assignment at (ii): `$set: req.body` lets the client set arbitrary fields — including `role`/`isAdmin` — instead of whitelisting the editable fields (A08 Software & Data Integrity Failures)",
    ],
    threshold: 0.75,
    maxTurns: 6,
  },
];
