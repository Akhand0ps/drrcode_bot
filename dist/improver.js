"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.improveCV = improveCV;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY });
async function improveCV(jd, cvText, chatHistory) {
    const conversationContext = chatHistory.length > 0
        ? `\nCONVERSATION CONTEXT (user's preferences and questions discussed):\n${chatHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`
        : '';
    const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            {
                role: 'user',
                content: `You are a professional CV writer and career coach.

JOB DESCRIPTION:
${jd}

ORIGINAL CV:
${cvText}
${conversationContext}

Using the JD, the original CV, and any context from the conversation above, rewrite this CV. Rules:
- Do NOT fabricate experience or skills
- Add missing keywords naturally where they fit
- Use strong action verbs in bullet points
- Prioritize experience most relevant to the JD
- Incorporate any specific preferences the user mentioned in the conversation
- Keep same structure: Education, Experience, Skills, Projects

Return ONLY the improved CV text.`
            }
        ],
    });
    return response.choices[0].message.content;
}
