"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const sessions_1 = require("./sessions");
const pdfParser_1 = require("./pdfParser");
const scorer_1 = require("./scorer");
const improver_1 = require("./improver");
const pdfGenerator_1 = require("./pdfGenerator");
const multiJobComparison_1 = require("./multiJobComparison");
const skillsGapAnalyzer_1 = require("./skillsGapAnalyzer");
const improvementSuggestions_1 = require("./improvementSuggestions");
const conversationalMatcher_1 = require("./conversationalMatcher");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY });
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
let bot;
if (IS_PRODUCTION) {
    bot = new node_telegram_bot_api_1.default(BOT_TOKEN);
    bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);
    app.post(`/bot${BOT_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
}
else {
    bot = new node_telegram_bot_api_1.default(BOT_TOKEN, { polling: true });
}
function formatScoreReport(score) {
    const bar = (n) => 'x'.repeat(Math.floor(n / 10)) + 'o'.repeat(10 - Math.floor(n / 10));
    return `
*CV Score Report*

Overall Match: *${score.overall}%*
[${bar(score.overall)}]

Skills Match:      ${score.skills_match}%
Experience Match:  ${score.experience_match}%

*Strengths:*
${score.strengths.map(s => `- ${s}`).join('\n')}

*Gaps:*
${score.gaps.map(g => `- ${g}`).join('\n')}

*Missing Keywords:*
${score.missing_keywords.join(', ') || 'None'}

*Verdict:* ${score.summary}
  `.trim();
}
async function handleFreeChat(chatId, userMessage) {
    const session = (0, sessions_1.getSession)(chatId);
    // Save user message to history
    (0, sessions_1.addMessage)(chatId, 'user', userMessage);
    // Use conversational matcher for smarter responses
    const response = await (0, conversationalMatcher_1.generateConversationalResponse)(userMessage, session.jd || session.multiJDs?.[0] || '', session.cvText || '', session.chatHistory);
    // Save assistant reply to history
    (0, sessions_1.addMessage)(chatId, 'assistant', response.answer);
    return response;
}
// /start
bot.onText(/\/start/, (msg) => {
    (0, sessions_1.resetSession)(msg.chat.id);
    (0, sessions_1.setSession)(msg.chat.id, { step: 'WAITING_JD' });
    bot.sendMessage(msg.chat.id, '*CV Scorer Bot*\n\nPaste the *Job Description* below.', {
        parse_mode: 'Markdown',
    });
});
// /reset
bot.onText(/\/reset/, (msg) => {
    (0, sessions_1.resetSession)(msg.chat.id);
    bot.sendMessage(msg.chat.id, 'Reset done. Use /start to begin again.');
});
// /help
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, `*CV Scorer Bot*\n\n*Single Role:*\n/start - Analyze a new CV versus 1 JD\n\n*Multiple Roles:*\n/compare - Compare CV against 3-5 job roles\n\n*General:*\n/reset - Start over\n/help - Show this message\n\n*How it works:*\n1. Send Job Description(s)\n2. Upload CV as PDF\n3. Get score (& comparison if multiple roles)\n4. Ask anything about your CV or the role\n5. Click Improve when ready`, { parse_mode: 'Markdown' });
});
// /compare - Start multi-role comparison
bot.onText(/\/compare/, (msg) => {
    (0, sessions_1.resetSession)(msg.chat.id);
    (0, sessions_1.setSession)(msg.chat.id, { step: 'WAITING_MULTI_JD', multiJDs: [] });
    bot.sendMessage(msg.chat.id, `*🔥 Multi-Role Comparison Mode*\n\nSend 3-5 job descriptions to compare your CV against multiple roles.\n\n*Send them one by one* (paste each JD, then send).\n\nAfter each JD, I'll confirm. When done, type *done* and upload your CV.`, { parse_mode: 'Markdown' });
});
// Text messages
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/'))
        return;
    const session = (0, sessions_1.getSession)(msg.chat.id);
    const chatId = msg.chat.id;
    // Step 1: Receive JD (single)
    if (session.step === 'WAITING_JD') {
        (0, sessions_1.setSession)(chatId, { jd: msg.text, step: 'WAITING_CV' });
        bot.sendMessage(chatId, 'JD saved. Now send your *CV as a PDF*.', {
            parse_mode: 'Markdown',
        });
        return;
    }
    // Multi-JD: Collect JDs
    if (session.step === 'WAITING_MULTI_JD') {
        if (msg.text.toLowerCase() === 'done') {
            if (!session.multiJDs || session.multiJDs.length < 3) {
                bot.sendMessage(chatId, `❌ Please send at least 3 JDs. Currently have ${session.multiJDs?.length || 0}.`);
                return;
            }
            (0, sessions_1.setSession)(chatId, { step: 'WAITING_CV' });
            bot.sendMessage(chatId, `✅ Got ${session.multiJDs.length} job descriptions. Now send your *CV as a PDF*.`, {
                parse_mode: 'Markdown',
            });
            return;
        }
        // Add this JD to the list
        const multiJDs = session.multiJDs || [];
        multiJDs.push(msg.text);
        (0, sessions_1.setSession)(chatId, { multiJDs });
        bot.sendMessage(chatId, `✅ JD ${multiJDs.length} saved (${Math.min(3, 5 - multiJDs.length)} more needed to compare). Send next JD or type *done* when ready.`, { parse_mode: 'Markdown' });
        return;
    }
    // Step 2: Free chat after CV scored
    if (session.step === 'CHATTING') {
        try {
            // Show typing indicator
            bot.sendChatAction(chatId, 'typing');
            const response = await handleFreeChat(chatId, msg.text);
            bot.sendMessage(chatId, response.answer, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Interview Prep', callback_data: 'interview_prep' },
                            { text: 'Quick Tips', callback_data: 'quick_tips' },
                        ],
                        [
                            { text: 'Improve my CV', callback_data: 'improve' },
                            { text: 'Start Over', callback_data: 'reset' },
                        ],
                    ],
                },
            });
        }
        catch (err) {
            console.error(err);
            bot.sendMessage(chatId, 'Something went wrong. Try again.');
        }
        return;
    }
});
// Inline button handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const session = (0, sessions_1.getSession)(chatId);
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id });
    if (query.data === 'improve') {
        bot.answerCallbackQuery(query.id);
        (0, sessions_1.setSession)(chatId, { step: 'IMPROVING' });
        bot.sendMessage(chatId, 'Improving your CV using our full conversation context... (20-30 seconds)');
        try {
            // Use the JD (single mode) or the first JD from multiJDs (best match)
            const jdToUse = session.jd || session.multiJDs?.[0];
            if (!jdToUse) {
                bot.sendMessage(chatId, 'Error: No job description found. Try /reset and start again.');
                return;
            }
            const improved = await (0, improver_1.improveCV)(jdToUse, session.cvText, session.chatHistory);
            const pdfBuffer = await (0, pdfGenerator_1.generatePDF)(improved);
            await bot.sendDocument(chatId, pdfBuffer, { caption: 'Here is your improved CV tailored to the role and our conversation.' }, { filename: 'improved_cv.pdf', contentType: 'application/pdf' });
            (0, sessions_1.resetSession)(chatId);
            bot.sendMessage(chatId, 'Done. Use /start to analyze another CV.', {
                reply_markup: {
                    inline_keyboard: [[{ text: 'Analyze Another CV', callback_data: 'start' }]],
                },
            });
        }
        catch (err) {
            console.error(err);
            bot.sendMessage(chatId, 'Something went wrong. Try /reset.');
        }
    }
    else if (query.data === 'quick_tips') {
        bot.answerCallbackQuery(query.id);
        const jdToUse = session.jd || session.multiJDs?.[0];
        if (!jdToUse || !session.cvText) {
            bot.sendMessage(chatId, 'Session error. Try /reset and start again.');
            return;
        }
        try {
            bot.sendChatAction(chatId, 'typing');
            const score = await (0, scorer_1.scoreCV)(jdToUse, session.cvText);
            const suggestions = await (0, improvementSuggestions_1.generateImprovementSuggestions)(jdToUse, session.cvText, score.missing_keywords);
            const tipsReport = (0, improvementSuggestions_1.formatImprovementSuggestions)(suggestions);
            bot.sendMessage(chatId, tipsReport, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Back to Chat', callback_data: 'back' },
                            { text: 'Improve my CV', callback_data: 'improve' },
                        ],
                    ],
                },
            });
        }
        catch (err) {
            console.error(err);
            bot.sendMessage(chatId, 'Error generating tips. Try again.');
        }
    }
    else if (query.data === 'interview_prep') {
        bot.answerCallbackQuery(query.id);
        const jdToUse = session.jd || session.multiJDs?.[0];
        if (!jdToUse || !session.cvText) {
            bot.sendMessage(chatId, 'Session error. Try /reset and start again.');
            return;
        }
        try {
            bot.sendChatAction(chatId, 'typing');
            const questions = await (0, conversationalMatcher_1.generateInterviewQuestions)(jdToUse, session.cvText);
            const prepReport = (0, conversationalMatcher_1.formatInterviewPrep)(questions);
            bot.sendMessage(chatId, prepReport, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Back to Chat', callback_data: 'back' },
                            { text: 'Quick Tips', callback_data: 'quick_tips' },
                        ],
                    ],
                },
            });
        }
        catch (err) {
            console.error(err);
            bot.sendMessage(chatId, 'Error generating interview prep. Try again.');
        }
    }
    else if (query.data === 'skills_gap') {
        bot.answerCallbackQuery(query.id);
        const jdToUse = session.jd || session.multiJDs?.[0];
        if (!jdToUse || !session.cvText) {
            bot.sendMessage(chatId, 'Session error. Try /reset and start again.');
            return;
        }
        try {
            bot.sendChatAction(chatId, 'typing');
            const score = await (0, scorer_1.scoreCV)(jdToUse, session.cvText);
            const gapAnalysis = await (0, skillsGapAnalyzer_1.analyzeSkillsGap)(jdToUse, session.cvText, score.missing_keywords);
            const gapReport = (0, skillsGapAnalyzer_1.formatSkillsGapReport)(gapAnalysis);
            bot.sendMessage(chatId, gapReport, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Back to Chat', callback_data: 'back' },
                            { text: 'Improve my CV', callback_data: 'improve' },
                        ],
                    ],
                },
            });
        }
        catch (err) {
            console.error(err);
            bot.sendMessage(chatId, 'Error analyzing skills gap. Try again.');
        }
    }
    else if (query.data === 'back') {
        bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, 'What would you like to know about your CV or this role?', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Skills Gap Analysis', callback_data: 'skills_gap' },
                        { text: 'Improve my CV', callback_data: 'improve' },
                    ],
                ],
            },
        });
    }
    else if (query.data === 'reset') {
        bot.answerCallbackQuery(query.id);
        (0, sessions_1.resetSession)(chatId);
        (0, sessions_1.setSession)(chatId, { step: 'WAITING_JD' });
        bot.sendMessage(chatId, 'Paste the new Job Description.');
    }
    else if (query.data === 'start') {
        bot.answerCallbackQuery(query.id);
        (0, sessions_1.resetSession)(chatId);
        (0, sessions_1.setSession)(chatId, { step: 'WAITING_JD' });
        bot.sendMessage(chatId, 'Paste the Job Description.');
    }
});
// PDF handler
bot.on('document', async (msg) => {
    const session = (0, sessions_1.getSession)(msg.chat.id);
    const chatId = msg.chat.id;
    if (session.step !== 'WAITING_CV') {
        bot.sendMessage(chatId, 'Please use /start first and provide a JD before sending your CV.');
        return;
    }
    if (!msg.document?.mime_type?.includes('pdf')) {
        bot.sendMessage(chatId, 'Please send a PDF file only.');
        return;
    }
    bot.sendMessage(chatId, 'CV received. Analyzing... (takes ~15 seconds)');
    try {
        const fileLink = await bot.getFileLink(msg.document.file_id);
        const response = await axios_1.default.get(fileLink, { responseType: 'arraybuffer' });
        const pdfBuffer = Buffer.from(response.data);
        const cvText = await (0, pdfParser_1.extractTextFromPDF)(pdfBuffer);
        if (!cvText || cvText.length < 100) {
            bot.sendMessage(chatId, 'Could not read your PDF. Make sure it is a text-based PDF, not a scanned image.');
            return;
        }
        // Single JD mode
        if (session.jd) {
            const score = await (0, scorer_1.scoreCV)(session.jd, cvText);
            (0, sessions_1.setSession)(chatId, { cvText, step: 'CHATTING' });
            bot.sendMessage(chatId, formatScoreReport(score) + '\n\n---\nAsk me anything about your CV, the role, or market trends. When ready, click *Improve my CV*.', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Quick Tips', callback_data: 'quick_tips' },
                            { text: 'Skills Gap', callback_data: 'skills_gap' },
                        ],
                        [
                            { text: 'Improve my CV', callback_data: 'improve' },
                            { text: 'Start Over', callback_data: 'reset' },
                        ],
                    ],
                },
            });
            return;
        }
        // Multi-JD mode
        if (session.multiJDs && session.multiJDs.length >= 3) {
            bot.sendMessage(chatId, '📊 Comparing your CV against all roles... (30-45 seconds)');
            const results = [];
            for (let i = 0; i < session.multiJDs.length; i++) {
                const jdTitle = await (0, multiJobComparison_1.classifyJDTitle)(session.multiJDs[i]);
                const score = await (0, scorer_1.scoreCV)(session.multiJDs[i], cvText);
                results.push({
                    jdIndex: i,
                    jdTitle,
                    score,
                    rank: 0, // Will be set after sorting
                    matchReason: '',
                });
            }
            // Sort by overall score
            results.sort((a, b) => b.score.overall - a.score.overall);
            results.forEach((r, idx) => (r.rank = idx + 1));
            // Generate strategic summary
            const recommendation = await (0, multiJobComparison_1.generateComparisonSummary)(results, cvText);
            results.forEach(r => {
                r.matchReason = r.score.summary;
            });
            const report = (0, multiJobComparison_1.formatComparisonReport)(results, recommendation);
            (0, sessions_1.setSession)(chatId, { cvText, multiJDs: session.multiJDs, step: 'CHATTING' });
            bot.sendMessage(chatId, report, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Improve for Best Match', callback_data: 'improve' },
                            { text: 'Start Over', callback_data: 'reset' },
                        ],
                    ],
                },
            });
            return;
        }
    }
    catch (err) {
        console.error(err);
        bot.sendMessage(chatId, 'Error processing your CV. Try /reset and start again.');
    }
});
// Health check
app.get('/', (req, res) => {
    res.send('Bot is running.');
});
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
});
