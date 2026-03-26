"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromPDF = extractTextFromPDF;
// const pdfParse = require('pdf-parse');
const pdf_parse_1 = require("pdf-parse");
async function extractTextFromPDF(buffer) {
    const uint8Array = new Uint8Array(buffer);
    const parser = new pdf_parse_1.PDFParse(uint8Array);
    const result = await parser.getText();
    return result.text;
}
