"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreCV = scoreCV;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY });
async function scoreCV(jd, cvText) {
    const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            {
                role: 'user',
                content: `You are an expert ATS and career coach.

JOB DESCRIPTION:
${jd}

CANDIDATE CV:
${cvText}

Analyze the CV against the JD. Return ONLY a valid JSON object, no extra text, no markdown backticks:
{
  "overall": <0-100>,
  "skills_match": <0-100>,
  "experience_match": <0-100>,
  "missing_keywords": ["keyword1", "keyword2"],
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "summary": "One line verdict"
}`
            }
        ],
    });
    const text = response.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
        throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
}
