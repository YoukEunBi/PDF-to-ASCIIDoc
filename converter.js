#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const chalk = require('chalk');
const Asciidoctor = require('@asciidoctor/core');

// pkg로 패키징 시 pdf-parse의 동적 require가 snapshot에서 실패하므로
// exe 실행 시 실제 파일시스템 경로(exe 옆 node_modules)를 먼저 시도한다.
function loadPdfParse() {
  if (process.pkg) {
    // exe 옆에 node_modules가 있으면 그쪽을 우선 사용
    const exeDir = path.dirname(process.execPath);
    const localPath = path.join(exeDir, 'node_modules', 'pdf-parse', 'index.js');
    if (fs.existsSync(localPath)) return require(localPath);
  }
  return require('pdf-parse');
}
const pdfParse = loadPdfParse();

// ─── AsciiDoc 변환 핵심 로직 ────────────────────────────────────────────────

/**
 * 텍스트 블록을 분석해서 단락/제목/목록을 구분한다.
 * PDF 텍스트는 구조 정보가 없으므로 휴리스틱으로 추론.
 */
function detectLineType(line, prevLine, nextLine) {
  const trimmed = line.trim();
  if (!trimmed) return { type: 'blank' };

  // 숫자 계층 제목: "1.", "1.2.", "1.2.3." 으로 시작하는 줄
  // 조건: 번호 뒤 텍스트가 60자 이하이고, 그 줄이 문장 끝(마침표 없음)이거나 짧음
  const numHeading = trimmed.match(/^(\d+(?:\.\d+)*)\.?\s{1,4}([^\n]{1,80})$/);
  if (numHeading && numHeading[2].length < 70) {
    const depth = numHeading[1].split('.').length;
    // 단순 번호 목록(긴 문장)과 구분: 다음 줄이 비어있거나 유사 제목 패턴
    const nextTrimmed = (nextLine || '').trim();
    const looksLikeHeading = !nextTrimmed || /^\d+\./.test(nextTrimmed) || nextTrimmed.length < 5;
    if (looksLikeHeading || numHeading[2].length < 40) {
      return { type: 'heading', level: Math.min(depth + 1, 5), text: trimmed };
    }
  }

  // 영문 모두 대문자 짧은 줄 (앞뒤가 빈 줄) → 제목 (한국어는 제외)
  const onlyAscii = /^[A-Z0-9\s\-\/\.,:()]+$/.test(trimmed);
  if (onlyAscii && trimmed.length >= 3 && trimmed.length <= 60 &&
      !prevLine?.trim() && !nextLine?.trim()) {
    return { type: 'heading', level: 2, text: trimmed };
  }

  // 글머리 기호 목록: •, -, *, ·  (단, "-"는 독립된 줄에서만)
  const bullet = trimmed.match(/^[•\*·]\s+(.+)/);
  if (bullet) return { type: 'bullet', text: bullet[1] };

  // 번호 목록: "1) " or "(1) "
  const numList = trimmed.match(/^(?:\(\d+\)|\d+[)])\s+(.+)/);
  if (numList) return { type: 'ordered', text: numList[1] };

  // 표처럼 보이는 줄 (탭으로 구분)
  if (/\t/.test(line)) {
    return { type: 'table_row', raw: trimmed };
  }

  return { type: 'para', text: trimmed };
}

function convertToAsciiDoc(rawText, options = {}) {
  const lines = rawText.split('\n');
  const output = [];
  let inList = null; // 'bullet' | 'ordered' | null
  let tableBuffer = [];
  let paraBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    output.push(paraBuffer.join(' '));
    output.push('');
    paraBuffer = [];
  };

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
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

  const flushList = () => {
    if (inList) {
      output.push('');
      inList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = lines[i - 1] ?? '';
    const next = lines[i + 1] ?? '';
    const info = detectLineType(line, prev, next);

    if (info.type === 'blank') {
      flushPara();
      flushList();
      continue;
    }

    if (info.type === 'heading') {
      flushPara();
      flushList();
      flushTable();
      const marker = '='.repeat(info.level);
      output.push(`${marker} ${info.text}`);
      output.push('');
      continue;
    }

    if (info.type === 'bullet') {
      flushPara();
      flushTable();
      if (inList === 'ordered') { output.push(''); }
      inList = 'bullet';
      output.push(`* ${info.text}`);
      continue;
    }

    if (info.type === 'ordered') {
      flushPara();
      flushTable();
      if (inList === 'bullet') { output.push(''); }
      inList = 'ordered';
      output.push(`. ${info.text}`);
      continue;
    }

    if (info.type === 'table_row') {
      flushPara();
      flushList();
      // 탭 또는 3개 이상의 공백으로 셀 분리
      const cells = info.raw.split(/\t|  {3,}/).map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        tableBuffer.push(cells);
      } else {
        flushTable();
        paraBuffer.push(info.raw);
      }
      continue;
    }

    // 일반 단락: 표나 목록이 진행 중이면 먼저 flush
    if (tableBuffer.length > 0) flushTable();
    if (inList) flushList();

    paraBuffer.push(info.text);
  }

  // 남은 버퍼 처리
  flushPara();
  flushList();
  flushTable();

  return output.join('\n');
}

function buildHeader(meta, filename) {
  const lines = [];
  const title = meta?.title || path.basename(filename, path.extname(filename));
  lines.push(`= ${title}`);
  if (meta?.author) lines.push(meta.author);
  if (meta?.creationDate) {
    const d = new Date(meta.creationDate);
    if (!isNaN(d)) lines.push(d.toISOString().split('T')[0]);
  }
  lines.push(':toc: left');
  lines.push(':toclevels: 3');
  lines.push(':sectnums:');
  lines.push(':icons: font');
  lines.push('');
  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('pdf-to-asciidoc')
  .description('PDF 문서를 AsciiDoc(.adoc) 형식으로 변환합니다')
  .version('1.0.0')
  .argument('<input>', 'PDF 파일 경로 (또는 디렉토리)')
  .option('-o, --output <path>', '출력 파일 또는 디렉토리 경로')
  .option('-d, --dir', '입력을 디렉토리로 처리하여 일괄 변환')
  .option('--no-header', 'AsciiDoc 헤더(문서 제목 블록) 생성 안 함')
  .option('--html', 'AsciiDoc을 HTML로도 변환하여 브라우저에서 바로 열기')
  .parse(process.argv);

const opts = program.opts();
const input = program.args[0];

async function convertFile(pdfPath, outputPath) {
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);

  let adoc = '';
  if (opts.header !== false) {
    adoc += buildHeader(data.info, pdfPath);
  }
  adoc += convertToAsciiDoc(data.text);

  fs.writeFileSync(outputPath, adoc, 'utf8');
  console.log(chalk.green('✓') + ` ${path.basename(pdfPath)} → ${path.basename(outputPath)}`);

  if (opts.html) {
    const htmlPath = outputPath.replace(/\.adoc$/i, '.html');
    const html = await Asciidoctor.convert(adoc, {
      safe: 'safe',
      attributes: { 'toc': 'left', 'icons': 'font' }
    });
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(chalk.green('✓') + ` HTML → ${path.basename(htmlPath)}`);
    // 브라우저로 열기
    const { exec } = require('child_process');
    exec(`start "" "${htmlPath}"`);
  }

  return { pages: data.numpages, chars: adoc.length };
}

async function main() {
  const stat = fs.statSync(input);
  const isDir = stat.isDirectory() || opts.dir;

  if (isDir) {
    // ── 디렉토리 일괄 변환 ──
    const files = fs.readdirSync(input).filter(f => f.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
      console.error(chalk.red('PDF 파일이 없습니다:'), input);
      process.exit(1);
    }
    const outDir = opts.output || input;
    fs.mkdirSync(outDir, { recursive: true });

    let total = 0;
    for (const file of files) {
      const src = path.join(input, file);
      const dst = path.join(outDir, file.replace(/\.pdf$/i, '.adoc'));
      const result = await convertFile(src, dst);
      total += result.pages;
    }
    console.log(chalk.cyan(`\n총 ${files.length}개 파일, ${total}페이지 변환 완료`));
  } else {
    // ── 단일 파일 변환 ──
    if (!input.toLowerCase().endsWith('.pdf')) {
      console.error(chalk.red('PDF 파일을 지정하세요.'));
      process.exit(1);
    }
    const outPath = opts.output || input.replace(/\.pdf$/i, '.adoc');
    const result = await convertFile(input, outPath);
    console.log(chalk.cyan(`\n${result.pages}페이지, ${result.chars}자 변환 완료`));
    console.log(chalk.gray('출력 파일:'), outPath);
  }
}

main().catch(err => {
  console.error(chalk.red('오류:'), err.message);
  process.exit(1);
});
