"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyJDTitle = classifyJDTitle;
exports.generateComparisonSummary = generateComparisonSummary;
exports.formatComparisonReport = formatComparisonReport;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY });
async function classifyJDTitle(jd) {
    const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            {
                role: 'user',
                content: `Extract the job title from this job description in 3-4 words max. Return ONLY the title, nothing else.

JD:
${jd.substring(0, 500)}`,
            },
        ],
    });
    return response.choices[0].message.content.trim();
}
async function generateComparisonSummary(results, cvText) {
    const sortedResults = [...results].sort((a, b) => b.score.overall - a.score.overall);
    const summaryText = sortedResults
        .map((r, idx) => `${idx + 1}. ${r.jdTitle} (${r.score.overall}% match)
   Why: ${r.matchReason}
   Skills: ${r.score.skills_match}% | Experience: ${r.score.experience_match}%`)
        .join('\n\n');
    const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            {
                role: 'user',
                content: `Based on this CV and the ranked job roles below, provide a brief strategic recommendation (2-3 sentences):

CV Summary:
${cvText.substring(0, 300)}

Ranked Roles:
${summaryText}

Answer: What's the best fit and why? Are there patterns?`,
            },
        ],
    });
    return response.choices[0].message.content;
}
function formatComparisonReport(results, recommendation) {
    const sortedResults = [...results].sort((a, b) => b.score.overall - a.score.overall);
    const bar = (n) => 'x'.repeat(Math.floor(n / 10)) + 'o'.repeat(10 - Math.floor(n / 10));
    const roleComparisons = sortedResults
        .map((r) => `*${r.rank === 1 ? '⭐' : '  '} Role ${r.rank}: ${r.jdTitle}* - ${r.score.overall}%
[${bar(r.score.overall)}]
Skills: ${r.score.skills_match}% | Experience: ${r.score.experience_match}%
→ ${r.matchReason}`)
        .join('\n\n');
    return `
*🔥 Multi-Role CV Comparison*

${roleComparisons}

---
*💡 Strategic Insight:*
${recommendation}

Pick any role above to dive deeper into gaps & improvement tips.
  `.trim();
}
