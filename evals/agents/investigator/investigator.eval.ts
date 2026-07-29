import { describeAgent, runAgentCases } from "../../src/index.js";
import { cases } from "./investigator.cases.js";

describeAgent("investigator", () => runAgentCases("investigator", cases));
