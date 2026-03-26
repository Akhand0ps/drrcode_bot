import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import axios from 'axios';
import Groq from 'groq-sdk';
import { getSession, setSession, resetSession, addMessage } from './sessions';
import { extractTextFromPDF } from './pdfParser';
import { scoreCV, ScoreResult } from './scorer';
import { improveCV } from './improver';
import { generatePDF } from './pdfGenerator';

const app = express();
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BOT_TOKEN = process.env.BOT_TOKEN!;
const WEBHOOK_URL = process.env.WEBHOOK_URL!;

let bot: TelegramBot;

if (IS_PRODUCTION) {
  bot = new TelegramBot(BOT_TOKEN);
  bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);
  app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
} else {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
}

function formatScoreReport(score: ScoreResult): string {
  const bar = (n: number) => 'x'.repeat(Math.floor(n / 10)) + 'o'.repeat(10 - Math.floor(n / 10));
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

async function handleFreeChat(chatId: number, userMessage: string) {
  const session = getSession(chatId);

  // Save user message to history
  addMessage(chatId, 'user', userMessage);

  // Build messages for Groq with full history
  const systemPrompt = `You are an expert career coach and resume advisor. 
You have access to the user's CV and the Job Description they are targeting.

JOB DESCRIPTION:
${session.jd}

USER CV:
${session.cvText}

Answer the user's questions about their CV, the job role, required skills, market trends, 
or anything career related. Be concise and specific. 
When relevant, reference their actual CV content and the JD.`;

  const messages = [
    ...session.chatHistory.slice(0, -1).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  const reply = response.choices[0].message.content!;

  // Save assistant reply to history
  addMessage(chatId, 'assistant', reply);

  return reply;
}

// /start
bot.onText(/\/start/, (msg) => {
  resetSession(msg.chat.id);
  setSession(msg.chat.id, { step: 'WAITING_JD' });
  bot.sendMessage(msg.chat.id, '*CV Scorer Bot*\n\nPaste the *Job Description* below.', {
    parse_mode: 'Markdown',
  });
});

// /reset
bot.onText(/\/reset/, (msg) => {
  resetSession(msg.chat.id);
  bot.sendMessage(msg.chat.id, 'Reset done. Use /start to begin again.');
});

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `*CV Scorer Bot*\n\n/start - Analyze a new CV\n/reset - Start over\n/help - Show this message\n\n*How it works:*\n1. Send Job Description\n2. Upload CV as PDF\n3. Get score\n4. Ask anything about your CV or the role\n5. Click Improve when ready`,
    { parse_mode: 'Markdown' }
  );
});

// Text messages
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const session = getSession(msg.chat.id);
  const chatId = msg.chat.id;

  // Step 1: Receive JD
  if (session.step === 'WAITING_JD') {
    setSession(chatId, { jd: msg.text, step: 'WAITING_CV' });
    bot.sendMessage(chatId, 'JD saved. Now send your *CV as a PDF*.', {
      parse_mode: 'Markdown',
    });
    return;
  }

  // Step 2: Free chat after CV scored
  if (session.step === 'CHATTING') {
    try {
      // Show typing indicator
      bot.sendChatAction(chatId, 'typing');
      const reply = await handleFreeChat(chatId, msg.text);
      bot.sendMessage(chatId, reply, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Improve my CV', callback_data: 'improve' },
              { text: 'Start Over', callback_data: 'reset' },
            ],
          ],
        },
      });
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, 'Something went wrong. Try again.');
    }
    return;
  }
});

// Inline button handler
bot.on('callback_query', async (query) => {
  const chatId = query.message!.chat.id;
  const session = getSession(chatId);

  bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    { chat_id: chatId, message_id: query.message!.message_id }
  );

  if (query.data === 'improve') {
    bot.answerCallbackQuery(query.id);
    setSession(chatId, { step: 'IMPROVING' });
    bot.sendMessage(chatId, 'Improving your CV using our full conversation context... (20-30 seconds)');

    try {
      const improved = await improveCV(session.jd!, session.cvText!, session.chatHistory);
      const pdfBuffer = await generatePDF(improved);

      await bot.sendDocument(
        chatId,
        pdfBuffer,
        { caption: 'Here is your improved CV tailored to the JD and our conversation.' },
        { filename: 'improved_cv.pdf', contentType: 'application/pdf' }
      );

      resetSession(chatId);
      bot.sendMessage(chatId, 'Done. Use /start to analyze another CV.', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Analyze Another CV', callback_data: 'start' }]],
        },
      });
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, 'Something went wrong. Try /reset.');
    }

  } else if (query.data === 'reset') {
    bot.answerCallbackQuery(query.id);
    resetSession(chatId);
    setSession(chatId, { step: 'WAITING_JD' });
    bot.sendMessage(chatId, 'Paste the new Job Description.');

  } else if (query.data === 'start') {
    bot.answerCallbackQuery(query.id);
    resetSession(chatId);
    setSession(chatId, { step: 'WAITING_JD' });
    bot.sendMessage(chatId, 'Paste the Job Description.');
  }
});

// PDF handler
bot.on('document', async (msg) => {
  const session = getSession(msg.chat.id);
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
    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    const pdfBuffer = Buffer.from(response.data);

    const cvText = await extractTextFromPDF(pdfBuffer);

    if (!cvText || cvText.length < 100) {
      bot.sendMessage(chatId, 'Could not read your PDF. Make sure it is a text-based PDF, not a scanned image.');
      return;
    }

    const score = await scoreCV(session.jd!, cvText);
    setSession(chatId, { cvText, step: 'CHATTING' });

    bot.sendMessage(
      chatId,
      formatScoreReport(score) + '\n\n---\nAsk me anything about your CV, the role, or market trends. When ready, click *Improve my CV*.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Improve my CV', callback_data: 'improve' },
              { text: 'Start Over', callback_data: 'reset' },
            ],
          ],
        },
      }
    );
  } catch (err) {
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