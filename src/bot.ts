import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import { getSession, setSession, resetSession } from './sessions';
import { extractTextFromPDF } from './pdfParser';
import { scoreCV, ScoreResult } from './scorer';
import { improveCV } from './improver';
import { generatePDF } from './pdfGenerator';

const bot = new TelegramBot(process.env.BOT_TOKEN!, { polling: true });

function formatScoreReport(score: ScoreResult): string {
  const bar = (n: number) => '█'.repeat(Math.floor(n / 10)) + '░'.repeat(10 - Math.floor(n / 10));

  return `
 *CV Score Report*

 Overall Match: *${score.overall}%*
${bar(score.overall)}

 Skills Match:      ${score.skills_match}%
💼 Experience Match:  ${score.experience_match}%

 *Strengths:*
${score.strengths.map(s => `• ${s}`).join('\n')}

 *Gaps:*
${score.gaps.map(g => `• ${g}`).join('\n')}

 *Missing Keywords:*
${score.missing_keywords.join(', ') || 'None'}

 *Verdict:* ${score.summary}

---
Want me to improve your CV for this JD?
Reply *yes* to get an improved version.
  `.trim();
}

// /start command
bot.onText(/\/start/, (msg) => {
  resetSession(msg.chat.id);
  setSession(msg.chat.id, { step: 'WAITING_JD' });
  bot.sendMessage(
    msg.chat.id,
    '👋 *CV Scorer Bot*\n\nPaste the *Job Description* below 👇',
    { parse_mode: 'Markdown' }
  );
});

// /reset command
bot.onText(/\/reset/, (msg) => {
  resetSession(msg.chat.id);
  bot.sendMessage(msg.chat.id, ' Reset done. Use /start to begin again.');
});

// Text messages
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const session = getSession(msg.chat.id);
  const chatId = msg.chat.id;

  // Step 1: Receive JD
  if (session.step === 'WAITING_JD') {
    setSession(chatId, { jd: msg.text, step: 'WAITING_CV' });
    bot.sendMessage(chatId, ' JD saved!\n\nNow send your *CV as a PDF* 📎', {
      parse_mode: 'Markdown',
    });
    return;
  }

  // Step 2: User replies yes/no to improve
  if (session.step === 'SCORED') {
    if (msg.text.toLowerCase() === 'yes') {
      setSession(chatId, { step: 'IMPROVING' });
      bot.sendMessage(chatId, ' Improving your CV... this may take 20-30 seconds ⏳');

      try {
        const improved = await improveCV(session.jd!, session.cvText!);
        const pdfBuffer = await generatePDF(improved);

        await bot.sendDocument(
          chatId,
          pdfBuffer,
          { caption: ' Here is your improved CV tailored to the JD!' },
          { filename: 'improved_cv.pdf', contentType: 'application/pdf' }
        );

        resetSession(chatId);
        bot.sendMessage(chatId, 'Done! Use /start to analyze another CV.');
      } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, ' Something went wrong. Try /reset and start again.');
      }
    } else {
      resetSession(chatId);
      bot.sendMessage(chatId, 'Okay! Use /start to analyze another CV anytime.');
    }
    return;
  }
});

// PDF document handler
bot.on('document', async (msg) => {
  const session = getSession(msg.chat.id);
  const chatId = msg.chat.id;

  if (session.step !== 'WAITING_CV') {
    bot.sendMessage(chatId, 'Please use /start first and provide a JD before sending your CV.');
    return;
  }

  if (!msg.document?.mime_type?.includes('pdf')) {
    bot.sendMessage(chatId, ' Please send a PDF file only.');
    return;
  }

  bot.sendMessage(chatId, '📥 CV received! Analyzing... ⏳ (takes ~15 seconds)');

  try {
    // Download the PDF file
    const fileLink = await bot.getFileLink(msg.document.file_id);
    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    const pdfBuffer = Buffer.from(response.data);

    // Extract text
    const cvText = await extractTextFromPDF(pdfBuffer);

    if (!cvText || cvText.length < 100) {
      bot.sendMessage(chatId, '⚠️ Could not read your PDF. Make sure it is a text-based PDF, not a scanned image.');
      return;
    }

    // Score it
    const score = await scoreCV(session.jd!, cvText);
    setSession(chatId, { cvText, step: 'SCORED' });

    // Send formatted report
    bot.sendMessage(chatId, formatScoreReport(score), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, ' Error processing your CV. Try /reset and start again.');
  }
});

console.log(' Bot is running...');