// eslint-disable-next-line @typescript-eslint/no-require-imports
const test = require("node:test");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const assert = require("node:assert/strict");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  AIRA_TEST_SUITE,
  evaluateAiraAnswer,
} = require("../src/lib/airaEvaluation.js");

test("AIRA system prompt instructs the assistant to analyze available data before saying it lacks context", () => {
  const promptPath = path.join(
    __dirname,
    "..",
    "app",
    "api",
    "aira",
    "route.ts",
  );
  const source = fs.readFileSync(promptPath, "utf8");

  assert.match(source, /do not start by saying you lack context or/i);
  assert.match(source, /qualitative data/i);
  assert.match(source, /Based on the available dashboard data/i);
});

test("AIRA evaluation suite covers the requested languages and intents", () => {
  assert.ok(Array.isArray(AIRA_TEST_SUITE) && AIRA_TEST_SUITE.length >= 11);

  const languages = new Set(AIRA_TEST_SUITE.map((item) => item.language));
  assert.ok(languages.has("English"));
  assert.ok(languages.has("Tagalog"));
  assert.ok(languages.has("Informal Taglish"));

  const intentSet = new Set(AIRA_TEST_SUITE.map((item) => item.intent));
  assert.ok(intentSet.has("Business insights"));
  assert.ok(intentSet.has("Trend analysis"));
  assert.ok(intentSet.has("Comparisons"));
  assert.ok(intentSet.has("Root-cause analysis"));
  assert.ok(intentSet.has("Recommendations"));
  assert.ok(intentSet.has("Forecast interpretation"));
  assert.ok(intentSet.has("KPI explanation"));
  assert.ok(intentSet.has("Follow-up context"));
  assert.ok(intentSet.has("Ambiguous question"));
  assert.ok(intentSet.has("Out-of-scope question"));
  assert.ok(intentSet.has("Hallucination resistance"));
});

test("Analytical answers for the revenue question pass the rubric", () => {
  const caseStudy = AIRA_TEST_SUITE.find(
    (item) => item.userQuestion === "Why did revenue rise?",
  );
  assert.ok(caseStudy);

  const result = evaluateAiraAnswer(
    caseStudy,
    [
      "Based on the available dashboard data, revenue may have increased because of higher demand, stronger average value per visit, or stronger performance in a specific service segment.",
      "The dashboard does not include transaction-level or campaign data, so the exact cause cannot be confirmed.",
    ].join(" "),
  );

  assert.equal(result.passed, true);
  assert.ok(result.scores.analyticalReasoning >= 0.7);
  assert.ok(result.scores.groundedness >= 0.7);
});

test("Conservative over-reliance on missing context fails the rubric", () => {
  const caseStudy = AIRA_TEST_SUITE.find(
    (item) => item.userQuestion === "Why did revenue rise?",
  );
  assert.ok(caseStudy);

  const result = evaluateAiraAnswer(
    caseStudy,
    "I do not have enough context to explain why revenue rose. I can only report the dashboard values.",
  );

  assert.equal(result.passed, false);
  assert.ok(result.scores.analyticalReasoning < 0.5);
});

test("Manual revenue example from the report is scored as too conservative", () => {
  const caseStudy = AIRA_TEST_SUITE.find(
    (item) => item.userQuestion === "Why did revenue rise?",
  );
  assert.ok(caseStudy);

  const answer =
    "I do not have the specific business context or qualitative data to explain why revenue rose. I can only confirm that the dashboard shows a projected revenue of ₱198,539 for next month, which represents a 26.4% decrease from the current period.";
  const result = evaluateAiraAnswer(caseStudy, answer);

  assert.equal(result.passed, false);
  assert.ok(result.scores.analyticalReasoning < 0.5);
});

test("Manual reorder example is treated as actionable and grounded", () => {
  const caseStudy = AIRA_TEST_SUITE.find(
    (item) => item.userQuestion === "What should I reorder this week?",
  );
  assert.ok(caseStudy);

  const answer =
    'You have 12 items currently flagged for reorder. These include multiple entries for "Hair Color (Mixed Shades)" and "Cellophane Treatment," both of which are showing stock levels at or below zero.';
  const result = evaluateAiraAnswer(caseStudy, answer);

  assert.equal(result.passed, true);
  assert.ok(result.scores.actionability >= 0.7);
});
