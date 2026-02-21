(function () {
  const MAX_DIMENSION = 1600;
  const MIN_CROP_SIZE = 20;
  const DEFAULT_BRUSH_SIZE = 6;
  const BRUSH_COLOR = "#d64a4a";

  let elements = null;
  let pendingResolve = null;
  let editorState = null;

  function ensureElements() {
    if (elements) {
      return elements;
    }

    const backdrop = document.createElement("div");
    backdrop.className = "photo-editor-backdrop hidden";
    backdrop.innerHTML = `
      <div class="photo-editor-modal" role="dialog" aria-modal="true" aria-label="Editeur photo">
        <div class="photo-editor-head">
          <h3 id="photo-editor-title">Editer la photo</h3>
          <button type="button" id="photo-editor-close" class="photo-editor-close" aria-label="Fermer">x</button>
        </div>

        <div class="photo-editor-toolbar">
          <button type="button" id="photo-rotate-left">Rotation -90</button>
          <button type="button" id="photo-rotate-right">Rotation +90</button>
          <button type="button" id="photo-crop-mode">Recadrer</button>
          <button type="button" id="photo-crop-apply">Appliquer recadrage</button>
          <button type="button" id="photo-draw-mode">Dessiner</button>
          <label class="photo-editor-range-wrap" for="photo-brush-size">
            Epaisseur
            <input id="photo-brush-size" type="range" min="2" max="24" step="1" value="${DEFAULT_BRUSH_SIZE}">
          </label>
          <button type="button" id="photo-reset">Reinitialiser</button>
        </div>

        <p id="photo-editor-hint" class="photo-editor-hint"></p>

        <div class="photo-editor-canvas-wrap">
          <canvas id="photo-editor-canvas"></canvas>
          <canvas id="photo-editor-overlay"></canvas>
        </div>

        <div class="photo-editor-actions">
          <button type="button" id="photo-editor-cancel" class="secondary">Annuler</button>
          <button type="button" id="photo-editor-confirm">Utiliser cette photo</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    elements = {
      backdrop,
      modal: backdrop.querySelector(".photo-editor-modal"),
      title: backdrop.querySelector("#photo-editor-title"),
      hint: backdrop.querySelector("#photo-editor-hint"),
      canvas: backdrop.querySelector("#photo-editor-canvas"),
      overlay: backdrop.querySelector("#photo-editor-overlay"),
      closeBtn: backdrop.querySelector("#photo-editor-close"),
      cancelBtn: backdrop.querySelector("#photo-editor-cancel"),
      confirmBtn: backdrop.querySelector("#photo-editor-confirm"),
      rotateLeftBtn: backdrop.querySelector("#photo-rotate-left"),
      rotateRightBtn: backdrop.querySelector("#photo-rotate-right"),
      cropModeBtn: backdrop.querySelector("#photo-crop-mode"),
      cropApplyBtn: backdrop.querySelector("#photo-crop-apply"),
      drawModeBtn: backdrop.querySelector("#photo-draw-mode"),
      resetBtn: backdrop.querySelector("#photo-reset"),
      brushSizeInput: backdrop.querySelector("#photo-brush-size")
    };

    bindElements();
    return elements;
  }

  function bindElements() {
    elements.backdrop.addEventListener("click", (event) => {
      if (event.target === elements.backdrop) {
        closeEditor(null);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (elements.backdrop.classList.contains("hidden")) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditor(null);
      }
    });

    elements.closeBtn.addEventListener("click", () => closeEditor(null));
    elements.cancelBtn.addEventListener("click", () => closeEditor(null));
    elements.confirmBtn.addEventListener("click", confirmImage);

    elements.rotateLeftBtn.addEventListener("click", () => rotateCanvas(-90));
    elements.rotateRightBtn.addEventListener("click", () => rotateCanvas(90));
    elements.cropModeBtn.addEventListener("click", () => setMode(editorState?.mode === "crop" ? "none" : "crop"));
    elements.drawModeBtn.addEventListener("click", () => setMode(editorState?.mode === "draw" ? "none" : "draw"));
    elements.cropApplyBtn.addEventListener("click", applyCrop);
    elements.resetBtn.addEventListener("click", resetImage);

    elements.canvas.addEventListener("pointerdown", onCanvasPointerDown);
    elements.canvas.addEventListener("pointermove", onCanvasPointerMove);
    elements.canvas.addEventListener("pointerup", onCanvasPointerUp);
    elements.canvas.addEventListener("pointerleave", onCanvasPointerUp);
  }

  function setMode(mode) {
    if (!editorState) {
      return;
    }

    editorState.mode = mode;

    elements.drawModeBtn.classList.toggle("active", mode === "draw");
    elements.cropModeBtn.classList.toggle("active", mode === "crop");

    if (mode !== "crop") {
      editorState.cropRect = null;
      editorState.isSelecting = false;
      clearOverlay();
    }

    if (mode === "draw") {
      setHint("Mode dessin: glisse ton doigt/souris pour entourer ou marquer.");
      return;
    }

    if (mode === "crop") {
      setHint("Mode recadrage: glisse pour tracer une zone puis clique 'Appliquer recadrage'.");
      return;
    }

    setHint("Utilise rotation, recadrage ou dessin puis confirme la photo.");
  }

  function setHint(text) {
    elements.hint.textContent = text || "";
  }

  function getCanvasPoint(event) {
    const rect = elements.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * elements.canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * elements.canvas.height) / rect.height
    };
  }

  function onCanvasPointerDown(event) {
    if (!editorState || editorState.mode === "none") {
      return;
    }

    const point = getCanvasPoint(event);

    if (editorState.mode === "draw") {
      editorState.isDrawing = true;
      editorState.lastPoint = point;
      return;
    }

    if (editorState.mode === "crop") {
      editorState.isSelecting = true;
      editorState.cropStart = point;
      editorState.cropRect = { x: point.x, y: point.y, width: 0, height: 0 };
      drawCropOverlay();
    }
  }

  function onCanvasPointerMove(event) {
    if (!editorState) {
      return;
    }

    const point = getCanvasPoint(event);

    if (editorState.mode === "draw" && editorState.isDrawing) {
      const ctx = elements.canvas.getContext("2d");
      ctx.strokeStyle = BRUSH_COLOR;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Number(elements.brushSizeInput.value) || DEFAULT_BRUSH_SIZE;
      ctx.beginPath();
      ctx.moveTo(editorState.lastPoint.x, editorState.lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      editorState.lastPoint = point;
      return;
    }

    if (editorState.mode === "crop" && editorState.isSelecting) {
      const x = Math.min(editorState.cropStart.x, point.x);
      const y = Math.min(editorState.cropStart.y, point.y);
      const width = Math.abs(point.x - editorState.cropStart.x);
      const height = Math.abs(point.y - editorState.cropStart.y);
      editorState.cropRect = { x, y, width, height };
      drawCropOverlay();
    }
  }

  function onCanvasPointerUp() {
    if (!editorState) {
      return;
    }
    editorState.isDrawing = false;
    editorState.isSelecting = false;
  }

  function clearOverlay() {
    const overlayCtx = elements.overlay.getContext("2d");
    overlayCtx.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  }

  function drawCropOverlay() {
    clearOverlay();
    if (!editorState?.cropRect) {
      return;
    }

    const overlayCtx = elements.overlay.getContext("2d");
    const rect = editorState.cropRect;
    overlayCtx.setLineDash([8, 6]);
    overlayCtx.strokeStyle = "#6b9e6b";
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    overlayCtx.setLineDash([]);
  }

  function cloneCanvas(sourceCanvas) {
    const cloned = document.createElement("canvas");
    cloned.width = sourceCanvas.width;
    cloned.height = sourceCanvas.height;
    cloned.getContext("2d").drawImage(sourceCanvas, 0, 0);
    return cloned;
  }

  function resetImage() {
    if (!editorState?.originalCanvas) {
      return;
    }
    elements.canvas.width = editorState.originalCanvas.width;
    elements.canvas.height = editorState.originalCanvas.height;
    elements.canvas.getContext("2d").drawImage(editorState.originalCanvas, 0, 0);
    syncOverlaySize();
    editorState.cropRect = null;
    clearOverlay();
    setMode("none");
  }

  function rotateCanvas(degrees) {
    if (!editorState) {
      return;
    }

    const source = elements.canvas;
    const rotated = document.createElement("canvas");
    const radians = (degrees * Math.PI) / 180;
    const quarterTurn = Math.abs(degrees) % 180 === 90;
    rotated.width = quarterTurn ? source.height : source.width;
    rotated.height = quarterTurn ? source.width : source.height;

    const ctx = rotated.getContext("2d");
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);

    source.width = rotated.width;
    source.height = rotated.height;
    source.getContext("2d").drawImage(rotated, 0, 0);
    syncOverlaySize();
    editorState.cropRect = null;
    clearOverlay();
  }

  function applyCrop() {
    if (!editorState?.cropRect) {
      setHint("Trace une zone de recadrage avant d'appliquer.");
      return;
    }

    const rect = editorState.cropRect;
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const width = Math.min(elements.canvas.width - x, Math.floor(rect.width));
    const height = Math.min(elements.canvas.height - y, Math.floor(rect.height));

    if (width < MIN_CROP_SIZE || height < MIN_CROP_SIZE) {
      setHint("Zone trop petite. Elargis un peu la selection.");
      return;
    }

    const source = elements.canvas;
    const cropped = document.createElement("canvas");
    cropped.width = width;
    cropped.height = height;
    cropped
      .getContext("2d")
      .drawImage(source, x, y, width, height, 0, 0, width, height);

    source.width = width;
    source.height = height;
    source.getContext("2d").drawImage(cropped, 0, 0);

    syncOverlaySize();
    editorState.cropRect = null;
    clearOverlay();
    setMode("none");
  }

  function syncOverlaySize() {
    elements.overlay.width = elements.canvas.width;
    elements.overlay.height = elements.canvas.height;
  }

  function showEditor() {
    elements.backdrop.classList.remove("hidden");
    document.body.classList.add("photo-editor-open");
  }

  function closeEditor(result) {
    elements.backdrop.classList.add("hidden");
    document.body.classList.remove("photo-editor-open");

    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(result || null);
    }
  }

  function buildOutputFileName(originalName, mimeType) {
    const nameWithoutExt = String(originalName || "photo").replace(/\.[^/.]+$/, "");
    let ext = "jpg";
    if (mimeType === "image/png") {
      ext = "png";
    } else if (mimeType === "image/webp") {
      ext = "webp";
    }
    return `${nameWithoutExt}-editee.${ext}`;
  }

  function confirmImage() {
    if (!editorState) {
      closeEditor(null);
      return;
    }

    const outputType = editorState.fileType && editorState.fileType.startsWith("image/")
      ? editorState.fileType
      : "image/jpeg";

    elements.canvas.toBlob(
      (blob) => {
        if (!blob) {
          closeEditor(null);
          return;
        }
        const fileName = buildOutputFileName(editorState.fileName, blob.type || outputType);
        const file = new File([blob], fileName, {
          type: blob.type || outputType,
          lastModified: Date.now()
        });
        closeEditor(file);
      },
      outputType,
      0.92
    );
  }

  async function loadFileToCanvas(file) {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Impossible de charger l'image."));
        img.src = imageUrl;
      });

      const ratio = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));

      elements.canvas.width = width;
      elements.canvas.height = height;
      elements.canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      syncOverlaySize();
      clearOverlay();

      editorState = {
        fileName: file.name || "photo.jpg",
        fileType: file.type || "image/jpeg",
        mode: "none",
        isDrawing: false,
        isSelecting: false,
        cropRect: null,
        cropStart: null,
        lastPoint: null,
        originalCanvas: cloneCanvas(elements.canvas)
      };

      elements.brushSizeInput.value = String(DEFAULT_BRUSH_SIZE);
      setMode("none");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  async function open(file, options = {}) {
    if (!(file instanceof File)) {
      return null;
    }

    ensureElements();

    if (pendingResolve) {
      closeEditor(null);
    }

    elements.title.textContent = options.title || "Editer la photo";
    await loadFileToCanvas(file);
    showEditor();

    return new Promise((resolve) => {
      pendingResolve = resolve;
    });
  }

  window.PhotoEditor = {
    open
  };
})();
