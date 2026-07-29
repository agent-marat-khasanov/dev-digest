import { describeSkill, runSkillCases } from "../../src";
import { cases } from "./dependency-checker.cases.js";

describeSkill("dependency-checker", () => runSkillCases("dependency-checker", cases));
// vitest output groups as:  skill:dependency-checker > full report follows the required structure ...
