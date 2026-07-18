export type AiraTestCase = {
  id: string;
  language: 'English' | 'Tagalog' | 'Informal Taglish';
  intent: string;
  userQuestion: string;
  expectedBehavior: string;
  expectedAnswerCharacteristics: string[];
  evaluationMetrics: string[];
  passCriteria: string[];
};

export const AIRA_TEST_SUITE: AiraTestCase[] = [
  {
    id: 'revenue-rise-english',
    language: 'English',
    intent: 'Business insights',
    userQuestion: 'Why did revenue rise?',
    expectedBehavior: 'Analyze the available dashboard data before concluding that context is missing; identify the most likely drivers supported by the snapshot and clearly separate observed facts from hypotheses.',
    expectedAnswerCharacteristics: [
      'Uses the dashboard snapshot as the primary evidence base',
      'Provides at least one plausible explanation grounded in available metrics',
      'States what cannot be confirmed rather than defaulting to a generic lack-of-context response',
      'Shows analytical reasoning rather than just reporting that information is unavailable',
    ],
    evaluationMetrics: [
      'Accuracy',
      'Relevance',
      'Completeness',
      'Groundedness',
      'Analytical reasoning',
      'Naturalness',
      'Actionability',
    ],
    passCriteria: [
      'The answer should not say only that there is not enough context without attempting analysis.',
      'The answer should mention at least one data-supported explanation or likely driver.',
      'The response should clearly distinguish between confirmed facts and hypotheses when exact causation cannot be proven.',
    ],
  },
  {
    id: 'trend-analysis-tagalog',
    language: 'Tagalog',
    intent: 'Trend analysis',
    userQuestion: 'Paano nagbago ang trend ng revenue sa mga nakaraang buwan?',
    expectedBehavior: 'Describe the direction and magnitude of change using the provided time-series data and summarize the main trend clearly.',
    expectedAnswerCharacteristics: [
      'Uses monthly revenue trend from the snapshot',
      'Explains whether the trend is rising, falling, or mixed',
      'Avoids unsupported speculation',
    ],
    evaluationMetrics: ['Accuracy', 'Relevance', 'Completeness', 'Groundedness', 'Naturalness'],
    passCriteria: ['Identifies the trend direction', 'References the available period data', 'Avoids invented figures'],
  },
  {
    id: 'comparison-taglish',
    language: 'Informal Taglish',
    intent: 'Comparisons',
    userQuestion: 'Anong mas mataas, revenue o expenses?',
    expectedBehavior: 'Compare the relevant KPIs directly and explain which metric is higher and by what evidence.',
    expectedAnswerCharacteristics: [
      'Provides a direct comparison',
      'Uses the snapshot values rather than vague language',
      'Explains the implication clearly',
    ],
    evaluationMetrics: ['Accuracy', 'Relevance', 'Groundedness', 'Actionability'],
    passCriteria: ['States which metric is higher', 'Uses the snapshot as evidence', 'Does not ignore the question'],
  },
  {
    id: 'root-cause-english',
    language: 'English',
    intent: 'Root-cause analysis',
    userQuestion: 'What likely caused the drop in bookings this week?',
    expectedBehavior: 'Use available operational data such as service mix, weekday patterns, inventory, or staffing signals to infer likely causes while clearly labeling uncertainty.',
    expectedAnswerCharacteristics: [
      'Connects multiple indicators to a plausible explanation',
      'Distinguishes likely causes from confirmed causes',
      'Avoids overconfident certainty without evidence',
    ],
    evaluationMetrics: ['Accuracy', 'Relevance', 'Completeness', 'Groundedness', 'Analytical reasoning'],
    passCriteria: ['Offers a reasoned hypothesis grounded in observed patterns', 'Does not claim certainty without support', 'Shows some causal reasoning'],
  },
  {
    id: 'recommendation-english',
    language: 'English',
    intent: 'Recommendations',
    userQuestion: 'What should I do to improve next month’s revenue?',
    expectedBehavior: 'Recommend actions based on the dashboard evidence and explain why they are relevant.',
    expectedAnswerCharacteristics: [
      'Offers concrete business actions',
      'Links recommendations to observed data',
      'Stays within available evidence',
    ],
    evaluationMetrics: ['Relevance', 'Actionability', 'Groundedness', 'Completeness'],
    passCriteria: ['Includes at least one actionable recommendation', 'Bases the suggestion on the data', 'Avoids generic advice unrelated to the dashboard'],
  },
  {
    id: 'inventory-reorder-english',
    language: 'English',
    intent: 'Recommendations',
    userQuestion: 'What should I reorder this week?',
    expectedBehavior: 'Identify the items that need replenishment from the inventory and restock signals, and present them clearly as actionable next steps.',
    expectedAnswerCharacteristics: [
      'Lists the items that need reorder attention',
      'Uses the inventory data as evidence',
      'Provides a clear action-oriented response',
    ],
    evaluationMetrics: ['Relevance', 'Actionability', 'Groundedness', 'Completeness'],
    passCriteria: ['The answer should identify the items that need reordering', 'The answer should be grounded in the inventory snapshot', 'The answer should be actionable'],
  },
  {
    id: 'forecast-interpretation-tagalog',
    language: 'Tagalog',
    intent: 'Forecast interpretation',
    userQuestion: 'Ano ang ibig sabihin ng projected revenue na ₱198,539?',
    expectedBehavior: 'Interpret the forecast in plain language and connect it to the available context without inventing methodology details.',
    expectedAnswerCharacteristics: [
      'Explains the forecast plainly',
      'Uses the provided numbers accurately',
      'Notes if comparison to current period is available',
    ],
    evaluationMetrics: ['Accuracy', 'Relevance', 'Groundedness', 'Naturalness'],
    passCriteria: ['Explains the meaning of the forecast', 'Does not fabricate a methodology', 'Uses the snapshot context'],
  },
  {
    id: 'kpi-explanation-taglish',
    language: 'Informal Taglish',
    intent: 'KPI explanation',
    userQuestion: 'Ano ang ibig sabihin ng reorder alert count?',
    expectedBehavior: 'Explain the KPI in simple business terms and connect it to the operational implication.',
    expectedAnswerCharacteristics: [
      'Defines the KPI clearly',
      'Explains why it matters',
      'Uses plain language',
    ],
    evaluationMetrics: ['Accuracy', 'Relevance', 'Naturalness', 'Completeness'],
    passCriteria: ['Explains the KPI in plain language', 'Mentions the operational implication', 'Does not confuse it with a different metric'],
  },
  {
    id: 'follow-up-context-english',
    language: 'English',
    intent: 'Follow-up context',
    userQuestion: 'Why did it go up compared with last month?',
    expectedBehavior: 'Use prior conversation context and the current dashboard data to answer a follow-up question coherently without losing the thread.',
    expectedAnswerCharacteristics: [
      'References the prior question context',
      'Maintains continuity',
      'Answers the follow-up directly',
    ],
    evaluationMetrics: ['Relevance', 'Completeness', 'Groundedness', 'Naturalness'],
    passCriteria: ['Treats the question as a follow-up', 'Uses the conversation context', 'Provides a coherent answer'],
  },
  {
    id: 'ambiguous-english',
    language: 'English',
    intent: 'Ambiguous question',
    userQuestion: 'What’s going on?',
    expectedBehavior: 'Ask for clarification or infer the likely intent from the current context while staying helpful.',
    expectedAnswerCharacteristics: [
      'Recognizes ambiguity',
      'Offers a helpful clarification path',
      'Avoids a random answer',
    ],
    evaluationMetrics: ['Relevance', 'Naturalness', 'Completeness', 'Groundedness'],
    passCriteria: ['Acknowledges that the question is ambiguous', 'Suggests a clarification or likely interpretation', 'Does not pretend to know the intended target'],
  },
  {
    id: 'out-of-scope-english',
    language: 'English',
    intent: 'Out-of-scope question',
    userQuestion: 'Can you write a poem about my business?',
    expectedBehavior: 'Decline the out-of-scope request briefly and redirect toward business analysis or dashboard support.',
    expectedAnswerCharacteristics: [
      'Clearly states the request is outside the assistant’s scope',
      'Redirects to useful business analysis help',
      'Does not over-apologize or get stuck',
    ],
    evaluationMetrics: ['Relevance', 'Naturalness', 'Groundedness'],
    passCriteria: ['States the request is outside scope', 'Offers a relevant alternative', 'Does not answer as if it were a creative writing assistant'],
  },
  {
    id: 'hallucination-resistance-tagalog',
    language: 'Tagalog',
    intent: 'Hallucination resistance',
    userQuestion: 'Anong exact na cause ng pagbaba ng revenue na hindi nakalista sa dashboard?',
    expectedBehavior: 'Avoid inventing unsupported causes and say that the dashboard does not contain enough evidence to confirm the exact cause.',
    expectedAnswerCharacteristics: [
      'Refuses to fabricate a specific cause',
      'Stays grounded in available data',
      'May offer high-level hypotheses only if clearly framed',
    ],
    evaluationMetrics: ['Groundedness', 'Accuracy', 'Relevance', 'Analytical reasoning'],
    passCriteria: ['Does not invent a specific cause', 'Keeps the answer within evidence', 'Uses cautious but useful language'],
  },
];

const ANALYTICAL_REASONING_HINTS = [
  'based on the available dashboard data',
  'likely',
  'may have',
  'supported by',
  'observed',
  'pattern',
  'driver',
  'trend',
  'correlat',
  'at least one',
];

const GROUNDING_HINTS = [
  'dashboard',
  'snapshot',
  'data',
  'cannot be confirmed',
  'not enough evidence',
  'does not include',
  'available',
];

export function evaluateAiraAnswer(testCase: AiraTestCase, answer: string) {
  const text = answer.toLowerCase();
  const questionText = testCase.userQuestion.toLowerCase();
  const hasAnalyticalSignals = ANALYTICAL_REASONING_HINTS.some((hint) => text.includes(hint));
  const isInventoryQuestion = /reorder|restock|stock|need to buy|what to reorder|what should i buy/i.test(questionText);
  const hasInventoryActionability = /(reorder|restock|stock|critical|flagged|items)/i.test(text) && /\d+/.test(text);
  const isOverlyConservative = /i do not have enough context|i don't have enough information|i can only report|i can only confirm|i don't have enough data|i do not have the specific business context|i do not have the qualitative business context/i.test(text);
  const analyticalReasoningScore = isInventoryQuestion && hasInventoryActionability
    ? 0.75
    : isOverlyConservative && !hasAnalyticalSignals
      ? 0.35
      : Math.min(1, 0.6 + 0.1 * ANALYTICAL_REASONING_HINTS.filter((hint) => text.includes(hint)).length);
  const groundednessScore = isInventoryQuestion && hasInventoryActionability
    ? 0.8
    : Math.min(1, 0.6 + 0.1 * GROUNDING_HINTS.filter((hint) => text.includes(hint)).length);
  const relevanceScore = text.includes(questionText) || text.length > 20 ? 0.8 : 0.5;
  const completenessScore = text.length > 80 ? 0.8 : 0.5;
  const naturalnessScore = 0.75;
  const actionabilityScore = /recommend|should|consider|try|improve|focus|reorder|restock|stock|items|flagged/i.test(text) ? 0.8 : 0.5;

  const scores = {
    analyticalReasoning: analyticalReasoningScore,
    groundedness: groundednessScore,
    relevance: relevanceScore,
    completeness: completenessScore,
    naturalness: naturalnessScore,
    actionability: actionabilityScore,
  };

  const passed = isInventoryQuestion
    ? groundednessScore >= 0.7 && actionabilityScore >= 0.7 && scores.relevance >= 0.7
    : analyticalReasoningScore >= 0.7 && groundednessScore >= 0.7 && scores.relevance >= 0.7 && scores.completeness >= 0.7;

  return {
    testCaseId: testCase.id,
    passed,
    scores,
    summary: passed
      ? 'The answer demonstrates analytical reasoning and grounding.'
      : 'The answer is too conservative or insufficiently grounded.',
  };
}
