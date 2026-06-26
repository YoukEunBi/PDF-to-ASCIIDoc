'use strict';

const dropZone    = document.getElementById('drop-zone');
const fileList    = document.getElementById('file-list');
const convertBtn  = document.getElementById('convert-btn');
const clearBtn    = document.getElementById('clear-btn');
const optHtml     = document.getElementById('opt-html');
const outputDirBtn   = document.getElementById('output-dir-btn');
const outputDirLabel = document.getElementById('output-dir-label');
const statusMsg   = document.getElementById('status-msg');

let files = [];
let outputDir = null;
let converting = false;

function addFiles(paths) {
  const pdfs = paths.filter(p => p.toLowerCase().endsWith('.pdf'));
  pdfs.forEach(p => {
    if (files.find(f => f.path === p)) return;
    files.push({ path: p, name: p.split(/[\\/]/).pop(), status: 'wait' });
  });
  render();
}

function render() {
  fileList.innerHTML = '';
  files.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    const statusText = { wait: '대기', converting: '변환 중…', done: '완료', error: '오류' }[f.status];
    const statusClass = `status-${f.status}`;
    const nameSpan   = `<span class="name" title="${f.path}">📄 ${f.name}</span>`;
    const statusSpan = `<span class="status ${statusClass}">${statusText}${f.error ? ': ' + f.error : ''}</span>`;
    const folderBtn  = f.adoc  ? `<span class="remove" title="폴더 열기" data-adoc="${f.adoc}">📂</span>` : '';
    const removeBtn  = f.status === 'wait' ? `<span class="remove" data-idx="${i}" title="제거">✕</span>` : '';
    div.innerHTML = nameSpan + statusSpan + folderBtn + removeBtn;
    fileList.appendChild(div);
  });

  convertBtn.disabled = files.length === 0 || converting;
  statusMsg.textContent = files.length ? `${files.length}개 파일` : '';

  fileList.querySelectorAll('[data-adoc]').forEach(el => {
    el.addEventListener('click', () => window.api.showInExplorer(el.dataset.adoc));
  });
  fileList.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('click', () => { files.splice(+el.dataset.idx, 1); render(); });
  });
}

// ── 드롭존 클릭 ──
dropZone.addEventListener('click', async () => {
  const paths = await window.api.selectFiles();
  if (paths.length) addFiles(paths);
});

// ── 드래그앤드롭 ──
let dragCounter = 0;

document.addEventListener('dragenter', e => {
  e.preventDefault();
  dragCounter++;
  dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter === 0) dropZone.classList.remove('drag-over');
});

document.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  dropZone.classList.remove('drag-over');

  const paths = [];
  for (const f of e.dataTransfer.files) {
    const p = window.api.getPathForFile(f);
    if (p) paths.push(p);
  }

  if (paths.length) {
    addFiles(paths);
  } else {
    statusMsg.textContent = '드롭 실패 — 클릭해서 파일을 선택해 주세요';
  }
});

// ── 출력 폴더 선택 ──
outputDirBtn.addEventListener('click', async () => {
  const dir = await window.api.selectOutputDir();
  if (dir) { outputDir = dir; outputDirLabel.textContent = dir; }
});

// ── 목록 지우기 ──
clearBtn.addEventListener('click', () => {
  if (converting) return;
  files = files.filter(f => f.status === 'converting');
  render();
});

// ── 진행 상황 수신 ──
window.api.onProgress(({ file, status, error }) => {
  const f = files.find(x => x.name === file);
  if (f) { f.status = status; if (error) f.error = error; render(); }
});

// ── 변환 실행 ──
convertBtn.addEventListener('click', async () => {
  if (converting || files.length === 0) return;
  converting = true;
  convertBtn.disabled = true;
  statusMsg.textContent = '변환 중…';

  const waitFiles = files.filter(f => f.status === 'wait').map(f => f.path);
  const results = await window.api.convert({
    files: waitFiles,
    outputDir,
    makeHtml: optHtml.checked,
  });

  results.forEach(r => {
    const f = files.find(x => x.name === r.file);
    if (f && r.ok) f.adoc = r.adoc;
  });

  const done  = results.filter(r => r.ok).length;
  const error = results.filter(r => !r.ok).length;
  statusMsg.textContent = `완료 ${done}개${error ? ` / 오류 ${error}개` : ''}`;

  converting = false;
  render();
});
