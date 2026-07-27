import { describeSkill, runSkillCases } from "../../src";
import { cases } from "./onion-architecture.cases.js";

describeSkill("onion-architecture", () => runSkillCases("onion-architecture", cases));
// vitest output groups as:  skill:onion-architecture > review flags widgets-module layering ...
