(() => {
  'use strict';

  const MAX_FILES = 50;
  const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MB
  const OUTPUT_NAME = 'pdf-unido.pdf';

  // ---- Elementos ----
  const $ = (id) => document.getElementById(id);
  const dropzone = $('dropzone');
  const fileInput = $('file-input');
  const pickBtn = $('pick-btn');
  const listEl = $('file-list');
  const statusEl = $('status');
  const mergeBtn = $('merge-btn');
  const clearBtn = $('clear-btn');
  $('year').textContent = new Date().getFullYear();

  // ---- Estado ----
  let items = [];   // [{ id, file }]
  let nextId = 1;
  let busy = false;

  // ---- Utilidades ----
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function totalBytes() {
    return items.reduce((sum, it) => sum + it.file.size, 0);
  }

  function setStatus(msg, type) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  // ---- Gestión de archivos ----
  function addFiles(fileList) {
    const files = Array.from(fileList);
    let rejected = 0;

    for (const file of files) {
      if (!isPdf(file)) { rejected++; continue; }
      if (items.length >= MAX_FILES) {
        setStatus(`Máximo ${MAX_FILES} archivos.`, 'error');
        break;
      }
      if (totalBytes() + file.size > MAX_TOTAL_BYTES) {
        setStatus('Se superó el tamaño total permitido (300 MB).', 'error');
        break;
      }
      items.push({ id: nextId++, file });
    }

    if (rejected) setStatus(`${rejected} archivo(s) ignorado(s): solo se admiten PDF.`, 'error');
    else if (statusEl.classList.contains('ok')) setStatus('');
    render();
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    render();
  }

  function remove(index) {
    items.splice(index, 1);
    render();
  }

  // ---- Render (textContent: sin riesgo de inyección HTML) ----
  function makeIconBtn(label, text, onClick, disabled, extraClass) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn' + (extraClass ? ' ' + extraClass : '');
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.disabled = disabled || busy;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    listEl.textContent = '';

    items.forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'file-item';

      const idx = document.createElement('span');
      idx.className = 'file-index';
      idx.textContent = i + 1;

      const info = document.createElement('div');
      info.className = 'file-info';
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = it.file.name;
      name.title = it.file.name;
      const size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = formatSize(it.file.size);
      info.append(name, size);

      const controls = document.createElement('div');
      controls.className = 'file-controls';
      controls.append(
        makeIconBtn('Subir', '↑', () => move(i, -1), i === 0),
        makeIconBtn('Bajar', '↓', () => move(i, 1), i === items.length - 1),
        makeIconBtn('Quitar', '✕', () => remove(i), false, 'remove')
      );

      li.append(idx, info, controls);
      listEl.appendChild(li);
    });

    mergeBtn.disabled = busy || items.length < 2;
    clearBtn.disabled = busy || items.length === 0;

    if (!busy && items.length === 1) setStatus('Agrega al menos un archivo más para poder unir.');
  }

  // ---- Unión de PDFs ----
  async function mergePdfs(list) {
    const { PDFDocument } = window.PDFLib;
    const output = await PDFDocument.create();

    for (let i = 0; i < list.length; i++) {
      const { file } = list[i];
      setStatus(`Procesando ${i + 1} de ${list.length}: ${file.name}`);

      let source;
      try {
        const bytes = await file.arrayBuffer();
        source = await PDFDocument.load(bytes);
      } catch (err) {
        throw new Error(`No se pudo leer "${file.name}". Puede estar dañado o protegido con contraseña.`);
      }

      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((p) => output.addPage(p));
    }

    return output.save();
  }

  function download(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function onMerge() {
    if (busy || items.length < 2) return;
    if (!window.PDFLib) {
      setStatus('No se pudo cargar la librería PDF. Recarga la página.', 'error');
      return;
    }

    busy = true;
    render();
    try {
      const bytes = await mergePdfs(items);
      download(bytes, OUTPUT_NAME);
      setStatus('¡Listo! Tu PDF se ha descargado.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Ocurrió un error al unir los archivos.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  // ---- Eventos ----
  pickBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = ''; // permite volver a elegir el mismo archivo
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-over');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-over');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  mergeBtn.addEventListener('click', onMerge);
  clearBtn.addEventListener('click', () => { items = []; setStatus(''); render(); });

  render();
})();