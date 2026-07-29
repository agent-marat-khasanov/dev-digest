import { describeSkill, runSkillCases } from "../../src";
import { cases } from "./security.cases.js";

describeSkill("security", () => runSkillCases("security", cases));
