import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./harness.cases.js";

describeWorkflow("harness", () => runWorkflowCases(cases));
