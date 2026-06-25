'use strict';

const fs   = require('fs');
const path = require('path');

// pdf-parse: pkg 번들 시 exe 옆 node_modules 우선
function loadPdfParse() {
  if (process.pkg) {
    const exeDir  = path.dirname(process.execPath);
    const local   = path.join(exeDir, 'node_modules', 'pdf-parse', 'index.js');
    if (fs.existsSync(local)) return require(local);
  }
  return require('pdf-parse');
}

function detectLineType(line, prevLine, nextLine) {
  const trimmed = line.trim();
  if (!trimmed) return { type: 'blank' };

  const numHeading = trimmed.match(/^(\d+(?:\.\d+)*)\.?\s{1,4}([^\n]{1,80})$/);
  if (numHeading && numHeading[2].length < 70) {
    const depth = numHeading[1].split('.').length;
    const nextTrimmed = (nextLine || '').trim();
    const looksLikeHeading = !nextTrimmed || /^\d+\./.test(nextTrimmed) || nextTrimmed.length < 5;
    if (looksLikeHeading || numHeading[2].length < 40) {
      return { type: 'heading', level: Math.min(depth + 1, 5), text: trimmed };
    }
  }

  const onlyAscii = /^[A-Z0-9\s\-\/\.,:()]+$/.test(trimmed);
  if (onlyAscii && trimmed.length >= 3 && trimmed.length <= 60 &&
      !prevLine?.trim() && !nextLine?.trim()) {
    return { type: 'heading', level: 2, text: trimmed };
  }

  const bullet = trimmed.match(/^[•\*·]\s+(.+)/);
  if (bullet) return { type: 'bullet', text: bullet[1] };

  const numList = trimmed.match(/^(?:\(\d+\)|\d+[)])\s+(.+)/);
  if (numList) return { type: 'ordered', text: numList[1] };

  if (/\t/.test(line)) return { type: 'table_row', raw: trimmed };

  return { type: 'para', text: trimmed };
}

function textToAsciiDoc(rawText) {
  const lines = rawText.split('\n');
  const output = [];
  let inList = null;
  let tableBuffer = [];
  let paraBuffer = [];

  const flushPara = () => {
    if (!paraBuffer.length) return;
    output.push(paraBuffer.join(' '));
    output.push('');
    paraBuffer = [];
  };
  const flushTable = () => {
    if (!tableBuffer.length) return;
    output.push('[cols="' + Array(tableBuffer[0].length).fill('1').join(',') + '",options="header"]');
    output.push('|===');
    tableBuffer.forEach((row, i) => {
      row.forEach(cell => output.push('| ' + cell));
      if (i < tableBuffer.length - 1) output.push('');
    });
    output.push('|===');
    output.push('');
    tableBuffer = [];
  };
  const flushList = () => { if (inList) { output.push(''); inList = null; } };

  for (let i = 0; i < lines.length; i++) {
    const info = detectLineType(lines[i], lines[i-1] ?? '', lines[i+1] ?? '');

    if (info.type === 'blank')      { flushPara(); flushList(); continue; }
    if (info.type === 'heading')    { flushPara(); flushList(); flushTable(); output.push(`${'='.repeat(info.level)} ${info.text}`, ''); continue; }
    if (info.type === 'bullet')     { flushPara(); flushTable(); if (inList === 'ordered') output.push(''); inList = 'bullet'; output.push(`* ${info.text}`); continue; }
    if (info.type === 'ordered')    { flushPara(); flushTable(); if (inList === 'bullet')  output.push(''); inList = 'ordered'; output.push(`. ${info.text}`); continue; }
    if (info.type === 'table_row')  {
      flushPara(); flushList();
      const cells = info.raw.split(/\t|  {3,}/).map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) { tableBuffer.push(cells); continue; }
      flushTable();
    }
    if (tableBuffer.length) flushTable();
    if (inList) flushList();
    paraBuffer.push(info.text ?? info.raw);
  }
  flushPara(); flushList(); flushTable();
  return output.join('\n');
}

function buildHeader(meta, filePath) {
  const title = meta?.title || path.basename(filePath, '.pdf');
  const lines = [
    `= ${title}`,
    meta?.author || '',
    '',
    ':toc: left',
    ':toclevels: 3',
    ':sectnums:',
    ':icons: font',
    '',
  ];
  return lines.filter((l, i) => i !== 1 || l).join('\n');
}

async function convertPdf(pdfPath, adocPath, { makeHtml = false, htmlPath } = {}) {
  const pdfParse = loadPdfParse();
  const buffer   = fs.readFileSync(pdfPath);
  const data     = await pdfParse(buffer);

  const adoc = buildHeader(data.info, pdfPath) + textToAsciiDoc(data.text);
  fs.writeFileSync(adocPath, adoc, 'utf8');

  if (makeHtml && htmlPath) {
    const Asciidoctor = require('@asciidoctor/core');
    const html = await Asciidoctor.convert(adoc, { safe: 'safe', attributes: { toc: 'left', icons: 'font' } });
    fs.writeFileSync(htmlPath, html, 'utf8');
  }

  return { pages: data.numpages, chars: adoc.length };
}

module.exports = { convertPdf };
