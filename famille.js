const PHOTO_BUCKET = "semis-photos";

const authPanel = document.getElementById("auth-panel");
const memberPanel = document.getElementById("member-panel");
const authMessage = document.getElementById("auth-message");
const seedMessage = document.getElementById("seed-message");
const passwordMessage = document.getElementById("password-message");

const passwordLoginForm = document.getElementById("password-login-form");
const passwordEmailInput = document.getElementById("password-email");
const passwordLoginInput = document.getElementById("password-login-input");
const magicLinkForm = document.getElementById("magic-link-form");
const magicEmailInput = document.getElementById("magic-email");
const logoutBtn = document.getElementById("logout-btn");
const openPasswordBtn = document.getElementById("open-password-btn");
const closePasswordBtn = document.getElementById("close-password-btn");
const passwordSetForm = document.getElementById("password-set-form");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const seedWorkspace = document.getElementById("seed-workspace");
const passwordWorkspace = document.getElementById("password-workspace");

const seedForm = document.getElementById("seed-form");
const seedIdInput = document.getElementById("seed-id");
const plantSelectInput = document.getElementById("plant-select");
const seedDateInput = document.getElementById("seed-date");
const currentWeekInput = document.getElementById("current-week");
const seedLocationInput = document.getElementById("seed-location");
const seedPhotoInput = document.getElementById("seed-photo");
const seedPhotoSelected = document.getElementById("seed-photo-selected");
const seedProgress = document.getElementById("seed-progress");
const seedProgressBar = document.getElementById("seed-progress-bar");
const seedProgressLabel = document.getElementById("seed-progress-label");
const seedProgressPercent = document.getElementById("seed-progress-percent");
const saveBtn = document.getElementById("save-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const seedList = document.getElementById("seed-list");

let supabaseClient = null;
let currentUser = null;
let seedCache = [];
let plantCatalog = [];
let prefillPlantId = "";
let isSavingSeed = false;
let seedProgressHideTimer = null;
let photoLightbox = null;
let photoLightboxImage = null;

function setMessage(element, text, type = "") {
  element.textContent = text || "";
  element.classList.remove("error", "success");
  if (type) {
    element.classList.add(type);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDateForDisplay(dateValue) {
  if (!dateValue) {
    return "-";
  }
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("fr-FR");
}

function getRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPrefillPlantIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("plant_id"));
  if (!Number.isInteger(id) || id <= 0) {
    return "";
  }
  return String(id);
}

function getSelectedSeedPhoto() {
  const pickerFile = seedPhotoInput?.files?.[0];
  if (pickerFile) {
    return {
      file: pickerFile,
      isCameraCapture: false
    };
  }

  return {
    file: null,
    isCameraCapture: false
  };
}

async function withUploadTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function getUploadTimeoutMs(fileSizeBytes) {
  const minTimeoutMs = 12 * 1000;
  const maxTimeoutMs = 75 * 1000;
  const assumedUploadSpeedBytesPerSecond = 256 * 1024;
  const computedMs = Math.ceil((Number(fileSizeBytes || 0) / assumedUploadSpeedBytesPerSecond) * 1000) + 8 * 1000;
  return Math.max(minTimeoutMs, Math.min(maxTimeoutMs, computedMs));
}

async function createStableUploadBlob(file, mimeType) {
  const copiedBuffer = await file.arrayBuffer();
  return new Blob([copiedBuffer], { type: mimeType });
}

async function downscaleImageBlob(blob, options = {}) {
  const maxSide = Number(options.maxSide) || 1600;
  const quality = Number(options.quality) || 0.72;

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      try {
        const srcWidth = image.naturalWidth || image.width;
        const srcHeight = image.naturalHeight || image.height;
        if (!srcWidth || !srcHeight) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Dimensions image invalides."));
          return;
        }

        const ratio = Math.min(1, maxSide / Math.max(srcWidth, srcHeight));
        const targetWidth = Math.max(1, Math.round(srcWidth * ratio));
        const targetHeight = Math.max(1, Math.round(srcHeight * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Canvas indisponible."));
          return;
        }

        context.drawImage(image, 0, 0, targetWidth, targetHeight);
        canvas.toBlob(
          (result) => {
            URL.revokeObjectURL(objectUrl);
            if (!result) {
              reject(new Error("Conversion image impossible."));
              return;
            }
            resolve(result);
          },
          "image/jpeg",
          quality
        );
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Lecture image impossible."));
    };

    image.src = objectUrl;
  });
}

async function buildOptimizedUploadBody(file, mimeType) {
  const stableBlob = await createStableUploadBlob(file, mimeType);
  if (!mimeType.startsWith("image/")) {
    return {
      uploadBody: stableBlob,
      contentType: mimeType
    };
  }

  try {
    const optimizedBlob = await downscaleImageBlob(stableBlob, {
      maxSide: 1600,
      quality: 0.72
    });
    return {
      uploadBody: optimizedBlob,
      contentType: "image/jpeg"
    };
  } catch (_error) {
    return {
      uploadBody: stableBlob,
      contentType: mimeType
    };
  }
}

async function uploadBlobWithStorageRest(path, uploadBody, mimeType, timeoutMs) {
  if (!supabaseClient || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    return {
      error: {
        message: "Configuration Supabase manquante."
      }
    };
  }

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) {
    return {
      error: {
        message: sessionError.message || "Session utilisateur invalide."
      }
    };
  }

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return {
      error: {
        message: "Session expiree. Reconnecte-toi."
      }
    };
  }

  const encodedPath = String(path || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const endpoint = `${window.SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${encodedPath}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    xhr.timeout = Math.max(30000, Number(timeoutMs) || 0);
    xhr.setRequestHeader("apikey", window.SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("x-upsert", "true");
    if (mimeType) {
      xhr.setRequestHeader("Content-Type", mimeType);
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ error: null });
        return;
      }

      let message = `HTTP ${xhr.status}`;
      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        message = parsed.message || parsed.error || parsed.msg || message;
      } catch (_error) {
        // Keep generic message when response is not JSON.
      }
      resolve({
        error: {
          message
        }
      });
    };

    xhr.onerror = () => {
      resolve({
        error: {
          message: "Erreur reseau pendant upload REST."
        }
      });
    };

    xhr.ontimeout = () => {
      resolve({
        error: {
          message: "Upload REST trop long. Verifie la connexion et reessaie."
        }
      });
    };

    xhr.send(uploadBody);
  });
}

async function sendSemisRestRequest(method, query, payload, timeoutMs = 7000, preferHeader = "") {
  if (!supabaseClient || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    return {
      error: {
        message: "Configuration Supabase manquante."
      }
    };
  }

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) {
    return {
      error: {
        message: sessionError.message || "Session utilisateur invalide."
      }
    };
  }

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return {
      error: {
        message: "Session expiree. Reconnecte-toi."
      }
    };
  }

  const endpoint = `${window.SUPABASE_URL}/rest/v1/semis${query ? `?${query}` : ""}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, endpoint, true);
    xhr.timeout = Math.max(6000, Number(timeoutMs) || 0);
    xhr.setRequestHeader("apikey", window.SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");
    if (preferHeader) {
      xhr.setRequestHeader("Prefer", preferHeader);
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let parsedData = null;
        try {
          parsedData = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (_error) {
          parsedData = null;
        }
        resolve({
          error: null,
          data: parsedData
        });
        return;
      }

      let message = `HTTP ${xhr.status}`;
      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        message = parsed.message || parsed.error || parsed.msg || message;
      } catch (_error) {
        // Keep generic message when response is not JSON.
      }

      resolve({
        error: {
          message
        }
      });
    };

    xhr.onerror = () => {
      resolve({
        error: {
          message: "Erreur reseau REST semis."
        }
      });
    };

    xhr.ontimeout = () => {
      resolve({
        error: {
          message: "Requete semis trop longue."
        }
      });
    };

    xhr.send(payload ? JSON.stringify(payload) : null);
  });
}

async function createSeedRecord(payload) {
  const mutationTimeoutMs = 7000;
  let lastErrorMessage = "";

  try {
    const sdkInsertPromise = supabaseClient
      .from("semis")
      .insert(payload)
      .select("id")
      .single();

    const sdkResult = await withUploadTimeout(
      sdkInsertPromise,
      mutationTimeoutMs,
      "Creation semis trop longue."
    );

    if (!sdkResult.error) {
      return {
        id: String(sdkResult.data?.id || "")
      };
    }
    lastErrorMessage = sdkResult.error.message || "";
  } catch (error) {
    lastErrorMessage = error.message || "";
  }

  const restResult = await sendSemisRestRequest(
    "POST",
    "select=id",
    payload,
    mutationTimeoutMs,
    "return=representation"
  );

  if (restResult.error) {
    return {
      error: {
        message: restResult.error.message || lastErrorMessage || "Creation semis impossible."
      }
    };
  }

  const row = Array.isArray(restResult.data) ? restResult.data[0] : restResult.data;
  return {
    id: String(row?.id || "")
  };
}

async function updateSeedRecord(seedId, payload) {
  const mutationTimeoutMs = 7000;
  let lastErrorMessage = "";

  try {
    const sdkUpdatePromise = supabaseClient
      .from("semis")
      .update(payload)
      .eq("id", seedId)
      .eq("user_id", currentUser.id);

    const sdkResult = await withUploadTimeout(
      sdkUpdatePromise,
      mutationTimeoutMs,
      "Mise a jour semis trop longue."
    );

    if (!sdkResult.error) {
      return { ok: true };
    }
    lastErrorMessage = sdkResult.error.message || "";
  } catch (error) {
    lastErrorMessage = error.message || "";
  }

  const query = `id=eq.${encodeURIComponent(seedId)}&user_id=eq.${encodeURIComponent(currentUser.id)}`;
  const restResult = await sendSemisRestRequest(
    "PATCH",
    query,
    payload,
    mutationTimeoutMs,
    "return=minimal"
  );

  if (restResult.error) {
    return {
      error: {
        message: restResult.error.message || lastErrorMessage || "Mise a jour semis impossible."
      }
    };
  }

  return { ok: true };
}

function clearSeedProgressHideTimer() {
  if (seedProgressHideTimer === null) {
    return;
  }
  window.clearTimeout(seedProgressHideTimer);
  seedProgressHideTimer = null;
}

function setSeedPhotoSelectedText(text, isSelected = false) {
  if (!seedPhotoSelected) {
    return;
  }
  seedPhotoSelected.textContent = text;
  seedPhotoSelected.classList.toggle("selected", isSelected);
}

function updateSeedPhotoSelectedText() {
  const file = seedPhotoInput?.files?.[0] || null;
  if (!file) {
    setSeedPhotoSelectedText("Aucune photo selectionnee.");
    return;
  }

  const fileName = file.name || "image.jpg";
  setSeedPhotoSelectedText(`Photo fichier: ${fileName}`, true);
}

function setSeedFormSavingState(isSaving) {
  saveBtn.disabled = isSaving;
  cancelEditBtn.disabled = isSaving;
  plantSelectInput.disabled = isSaving;
  seedDateInput.disabled = isSaving;
  currentWeekInput.disabled = isSaving;
  seedLocationInput.disabled = isSaving;
  seedPhotoInput.disabled = isSaving;
}

function setSeedProgress(value, label = "") {
  const safeValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  if (seedProgressBar) {
    seedProgressBar.value = safeValue;
  }
  if (seedProgressPercent) {
    seedProgressPercent.textContent = `${safeValue}%`;
  }
  if (label && seedProgressLabel) {
    seedProgressLabel.textContent = label;
  }
}

function showSeedProgress(label = "Enregistrement...", value = 0) {
  if (!seedProgress) {
    return;
  }
  clearSeedProgressHideTimer();
  seedProgress.classList.remove("hidden");
  seedProgress.hidden = false;
  setSeedProgress(value, label);
}

function hideSeedProgress(delayMs = 0) {
  if (!seedProgress) {
    return;
  }

  clearSeedProgressHideTimer();

  const hideNow = () => {
    setSeedProgress(0, "Enregistrement...");
    seedProgress.classList.add("hidden");
    seedProgress.hidden = true;
  };

  if (delayMs > 0) {
    seedProgressHideTimer = window.setTimeout(hideNow, delayMs);
    return;
  }
  hideNow();
}

function ensurePhotoLightbox() {
  if (photoLightbox && photoLightboxImage) {
    return;
  }

  const lightbox = document.createElement("div");
  lightbox.id = "photo-lightbox";
  lightbox.className = "photo-lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <button type="button" class="photo-lightbox-close" aria-label="Fermer l'image">Fermer</button>
    <img class="photo-lightbox-image" alt="">
  `;
  document.body.appendChild(lightbox);

  const image = lightbox.querySelector(".photo-lightbox-image");
  const closeBtn = lightbox.querySelector(".photo-lightbox-close");

  const close = () => {
    if (!photoLightbox) {
      return;
    }
    photoLightbox.hidden = true;
    if (photoLightboxImage) {
      photoLightboxImage.removeAttribute("src");
      photoLightboxImage.alt = "";
    }
    document.body.classList.remove("lightbox-open");
  };

  closeBtn.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      close();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && photoLightbox && !photoLightbox.hidden) {
      close();
    }
  });

  photoLightbox = lightbox;
  photoLightboxImage = image;
}

function openPhotoLightbox(src, altText = "Photo") {
  if (!src) {
    return;
  }
  ensurePhotoLightbox();
  photoLightboxImage.src = src;
  photoLightboxImage.alt = altText;
  photoLightbox.hidden = false;
  document.body.classList.add("lightbox-open");
}

function calculateCurrentWeek(sowingDate) {
  if (!sowingDate) {
    return 1;
  }
  const start = new Date(`${sowingDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return 1;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

function calculateDaysSinceDate(dateValue, referenceDate = getTodayIsoDate()) {
  if (!dateValue) {
    return null;
  }
  const start = new Date(`${dateValue}T00:00:00`);
  const end = new Date(`${referenceDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getSeedWeek(seed) {
  const dbWeek = Number(seed.current_week);
  if (Number.isInteger(dbWeek) && dbWeek > 0) {
    return dbWeek;
  }
  return calculateCurrentWeek(seed.sowing_date);
}

function formatSeedWeekLabel(seed) {
  const week = getSeedWeek(seed);
  const days = calculateDaysSinceDate(seed?.sowing_date);
  if (!Number.isInteger(days)) {
    return `Semaine ${week}`;
  }
  return `Semaine ${week} (${days}J)`;
}

function showAuthPanel() {
  authPanel.classList.remove("hidden");
  authPanel.hidden = false;
  memberPanel.classList.add("hidden");
  memberPanel.hidden = true;
}

function showMemberPanel() {
  authPanel.classList.add("hidden");
  authPanel.hidden = true;
  memberPanel.classList.remove("hidden");
  memberPanel.hidden = false;
}

function showSeedWorkspace() {
  seedWorkspace.classList.remove("hidden");
  seedWorkspace.hidden = false;
  passwordWorkspace.classList.add("hidden");
  passwordWorkspace.hidden = true;
}

function showPasswordWorkspace() {
  passwordWorkspace.classList.remove("hidden");
  passwordWorkspace.hidden = false;
  seedWorkspace.classList.add("hidden");
  seedWorkspace.hidden = true;
}

function resetPasswordForm() {
  passwordSetForm.reset();
  setMessage(passwordMessage, "");
}

function resetSeedForm() {
  seedForm.reset();
  seedIdInput.value = "";
  saveBtn.textContent = "Ajouter le semis";
  cancelEditBtn.classList.add("hidden");
  cancelEditBtn.hidden = true;
  currentWeekInput.value = "1";
  updateSeedPhotoSelectedText();
  if (prefillPlantId) {
    plantSelectInput.value = prefillPlantId;
  }
}

function getPlantNameById(plantId) {
  const numericId = Number(plantId);
  const plant = plantCatalog.find((item) => Number(item.id) === numericId);
  return plant ? plant.name : "";
}

function getPlantIdByName(name) {
  const normalized = normalizeText(name);
  if (!normalized) {
    return "";
  }
  const match = plantCatalog.find((item) => normalizeText(item.name) === normalized);
  return match ? String(match.id) : "";
}

function populatePlantOptions() {
  plantSelectInput.innerHTML = '<option value="">Choisir une plante</option>';
  const options = plantCatalog
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((plant) => `<option value="${plant.id}">${escapeHtml(plant.name)}</option>`)
    .join("");
  plantSelectInput.insertAdjacentHTML("beforeend", options);
}

async function loadPlantCatalog() {
  const response = await fetch("seeds.json");
  const data = await response.json();
  plantCatalog = (data || []).map((plant) => ({
    id: Number(plant.id),
    name: plant?.general?.name || plant?.general?.plant_name || `Plante #${plant.id}`
  }));
  populatePlantOptions();
  if (prefillPlantId) {
    plantSelectInput.value = prefillPlantId;
  }
}

async function getSignedPhotoUrl(path) {
  if (!path) {
    return "";
  }
  const { data, error } = await supabaseClient.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    return "";
  }
  return data.signedUrl;
}

async function renderSeeds(seeds) {
  if (!seeds.length) {
    seedList.innerHTML = "<p>Aucun semis pour le moment.</p>";
    return;
  }

  const signedUrls = await Promise.all(
    seeds.map((seed) => getSignedPhotoUrl(seed.photo_path))
  );

  seedList.innerHTML = seeds
    .map((seed, index) => {
      const canEdit = seed.user_id === currentUser.id;
      const photo = signedUrls[index]
        ? `<img class="seed-photo" src="${signedUrls[index]}" alt="Photo semis">`
        : "";
      const plantName = seed.plant_name || getPlantNameById(seed.plant_id) || "Plante inconnue";
      const weekLabel = formatSeedWeekLabel(seed);

      const ownerOrActions = canEdit
        ? `
          <div class="seed-card-actions">
            <button type="button" data-action="edit" data-seed-id="${seed.id}" class="secondary">Modifier</button>
            <button type="button" data-action="delete" data-seed-id="${seed.id}">Supprimer</button>
          </div>
        `
        : `<p><strong>Membre:</strong> ${escapeHtml(seed.owner_email || "inconnu")}</p>`;

      return `
        <article class="seed-card">
          ${photo}
          <div class="seed-week-badge">${escapeHtml(weekLabel)}</div>
          <h3>${escapeHtml(plantName)}</h3>
          <p><strong>Date semis:</strong> ${escapeHtml(formatDateForDisplay(seed.sowing_date))}</p>
          <p><strong>Emplacement:</strong> ${escapeHtml(seed.location)}</p>
          <a class="seed-open-link seed-action-button" href="semis.html?id=${seed.id}">Voir le suivi</a>
          ${ownerOrActions}
        </article>
      `;
    })
    .join("");
}

async function loadSeeds(options = {}) {
  const silentStatus = Boolean(options.silentStatus);
  if (!silentStatus) {
    setMessage(seedMessage, "Chargement des semis...");
  }

  const { data, error } = await supabaseClient
    .from("semis")
    .select("id, user_id, owner_email, plant_id, plant_name, sowing_date, current_week, location, photo_path, created_at")
    .order("sowing_date", { ascending: false });

  if (error) {
    setMessage(seedMessage, `Erreur: ${error.message}`, "error");
    return false;
  }

  seedCache = data || [];
  await renderSeeds(seedCache);
  if (!silentStatus) {
    setMessage(seedMessage, `${seedCache.length} semis visible(s).`, "success");
  }
  return true;
}

async function isFamilyMember(email) {
  const normalizedEmail = normalizeText(email);
  if (!normalizedEmail) {
    return false;
  }

  const { data, error } = await supabaseClient
    .from("family_emails")
    .select("email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    setMessage(authMessage, `Erreur verification acces: ${error.message}`, "error");
    return false;
  }

  return Boolean(data);
}

async function applySession(session) {
  currentUser = session?.user || null;

  if (!currentUser) {
    showAuthPanel();
    resetSeedForm();
    resetPasswordForm();
    seedList.innerHTML = "";
    return;
  }

  const allowed = await isFamilyMember(currentUser.email);
  if (!allowed) {
    await supabaseClient.auth.signOut();
    showAuthPanel();
    setMessage(
      authMessage,
      "Cet email n'est pas autorise. Demande son ajout a la liste famille.",
      "error"
    );
    return;
  }

  showMemberPanel();
  showSeedWorkspace();
  resetPasswordForm();
  setMessage(seedMessage, `Connecte: ${currentUser.email}`, "success");
  await loadSeeds();
}

async function uploadPhotoIfNeeded(selectedPhoto) {
  const file = selectedPhoto?.file || null;
  if (!file) {
    return null;
  }

  const sourceMimeType = selectedPhoto?.mimeType || file.type || "image/jpeg";
  const originalName = selectedPhoto?.fileName || file.name || "photo.jpg";
  const safeName = originalName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const path = `${currentUser.id}/${Date.now()}-${safeName}`;
  let optimizedUpload = null;

  try {
    optimizedUpload = await buildOptimizedUploadBody(file, sourceMimeType);
  } catch (error) {
    setMessage(seedMessage, `Lecture photo impossible: ${error.message || "fichier invalide"}`, "error");
    return false;
  }

  const optimizedBody = optimizedUpload.uploadBody;
  const optimizedType = optimizedUpload.contentType || sourceMimeType;
  const optimizedTimeoutMs = getUploadTimeoutMs(optimizedBody.size || file.size);

  const tryStorageUpload = async (uploadBody, contentType, timeoutOverrideMs) => {
    const uploadPromise = supabaseClient.storage.from(PHOTO_BUCKET).upload(path, uploadBody, {
      upsert: true,
      contentType
    });
    return withUploadTimeout(
      uploadPromise,
      timeoutOverrideMs,
      "Upload trop long. Verifie la connexion et reessaie."
    );
  };

  let lastErrorMessage = "Erreur inconnue";

  try {
    const restAttempt = await uploadBlobWithStorageRest(path, optimizedBody, optimizedType, optimizedTimeoutMs);
    if (!restAttempt.error) {
      return path;
    }
    lastErrorMessage = restAttempt.error.message || lastErrorMessage;
  } catch (error) {
    lastErrorMessage = error.message || lastErrorMessage;
  }

  try {
    const secondAttempt = await tryStorageUpload(optimizedBody, optimizedType, optimizedTimeoutMs);
    if (!secondAttempt.error) {
      return path;
    }
    lastErrorMessage = secondAttempt.error.message || lastErrorMessage;
  } catch (error) {
    lastErrorMessage = error.message || lastErrorMessage;
  }

  const originalTimeoutMs = getUploadTimeoutMs(file.size);
  try {
    const thirdAttempt = await tryStorageUpload(file, sourceMimeType, originalTimeoutMs);
    if (!thirdAttempt.error) {
      return path;
    }
    lastErrorMessage = thirdAttempt.error.message || lastErrorMessage;
  } catch (error) {
    lastErrorMessage = error.message || lastErrorMessage;
  }

  setMessage(
    seedMessage,
    `Upload photo impossible: ${lastErrorMessage}.`,
    "error"
  );
  return false;
}

async function uploadSeedPhotoInBackground(
  seedId,
  selectedPhoto,
  previousPhotoPath = null,
  selectedPhotoSnapshotPromise = null
) {
  if (!seedId || !selectedPhoto?.file || !currentUser) {
    return;
  }

  let photoForUpload = selectedPhoto;
  if (selectedPhotoSnapshotPromise) {
    const snapshot = await selectedPhotoSnapshotPromise;
    if (snapshot?.blob) {
      photoForUpload = {
        file: snapshot.blob,
        fileName: snapshot.name,
        mimeType: snapshot.mimeType
      };
    }
  }

  setMessage(seedMessage, "Semis enregistre. Upload photo en cours...", "success");
  const uploadedPhotoPath = await uploadPhotoIfNeeded(photoForUpload);
  if (!uploadedPhotoPath || uploadedPhotoPath === false) {
    setMessage(
      seedMessage,
      "Semis enregistre sans photo. Tu peux modifier ce semis et reessayer plus tard.",
      "error"
    );
    return;
  }

  const { error } = await supabaseClient
    .from("semis")
    .update({ photo_path: uploadedPhotoPath })
    .eq("id", seedId)
    .eq("user_id", currentUser.id);

  if (error) {
    await deletePhotoIfExists(uploadedPhotoPath);
    setMessage(seedMessage, `Photo envoyee mais liaison impossible: ${error.message}`, "error");
    return;
  }

  if (previousPhotoPath && previousPhotoPath !== uploadedPhotoPath) {
    await deletePhotoIfExists(previousPhotoPath);
  }

  await loadSeeds({ silentStatus: true });
  setMessage(seedMessage, "Photo ajoutee au semis.", "success");
}

async function deletePhotoIfExists(path) {
  if (!path) {
    return;
  }
  await supabaseClient.storage.from(PHOTO_BUCKET).remove([path]);
}

async function deletePhotosIfExist(paths) {
  const cleanPaths = [...new Set((paths || []).filter(Boolean))];
  if (!cleanPaths.length) {
    return true;
  }

  const { error } = await supabaseClient.storage.from(PHOTO_BUCKET).remove(cleanPaths);
  if (error) {
    setMessage(seedMessage, `Erreur suppression photo(s): ${error.message}`, "error");
    return false;
  }

  return true;
}

function getSeedById(seedId) {
  return seedCache.find((seed) => seed.id === seedId) || null;
}

function startEdit(seed) {
  const plantId = seed.plant_id ? String(seed.plant_id) : getPlantIdByName(seed.plant_name);

  seedIdInput.value = seed.id;
  plantSelectInput.value = plantId || "";
  seedDateInput.value = seed.sowing_date;
  currentWeekInput.value = String(getSeedWeek(seed));
  seedLocationInput.value = seed.location;
  saveBtn.textContent = "Enregistrer la modification";
  cancelEditBtn.classList.remove("hidden");
  cancelEditBtn.hidden = false;
  if (seed.photo_path) {
    setSeedPhotoSelectedText(
      "Photo actuelle conservee. Ajoute une nouvelle photo pour la remplacer."
    );
  } else {
    updateSeedPhotoSelectedText();
  }
  setMessage(seedMessage, "Mode modification actif.");
}

async function handleDelete(seed) {
  if (!seed || seed.user_id !== currentUser.id) {
    setMessage(seedMessage, "Suppression refusee.", "error");
    return;
  }

  const shouldDelete = window.confirm("Supprimer ce semis et son suivi ?");
  if (!shouldDelete) {
    return;
  }

  setMessage(seedMessage, "Suppression...");
  const { data: updates, error: updatesError } = await supabaseClient
    .from("semis_updates")
    .select("photo_path")
    .eq("semis_id", seed.id);

  if (updatesError) {
    setMessage(seedMessage, `Erreur lecture des photos du suivi: ${updatesError.message}`, "error");
    return;
  }

  const updatePhotoPaths = (updates || []).map((item) => item.photo_path).filter(Boolean);
  const photosDeleted = await deletePhotosIfExist([seed.photo_path, ...updatePhotoPaths]);
  if (!photosDeleted) {
    return;
  }

  const { error } = await supabaseClient
    .from("semis")
    .delete()
    .eq("id", seed.id)
    .eq("user_id", currentUser.id);

  if (error) {
    setMessage(seedMessage, `Erreur suppression: ${error.message}`, "error");
    return;
  }

  resetSeedForm();
  await loadSeeds();
}

async function handleSeedSubmit(event) {
  event.preventDefault();

  if (isSavingSeed) {
    return;
  }

  if (!currentUser) {
    setMessage(seedMessage, "Connexion requise.", "error");
    return;
  }

  const seedId = seedIdInput.value.trim();
  const isEdit = Boolean(seedId);
  const plantId = Number(plantSelectInput.value);
  const plantName = getPlantNameById(plantId);
  const sowingDate = seedDateInput.value;
  const location = seedLocationInput.value.trim();
  const todayIsoDate = getTodayIsoDate();
  const calculatedCurrentWeek = calculateCurrentWeek(sowingDate);

  if (!plantId || !plantName || !sowingDate || !location) {
    setMessage(seedMessage, "Complete tous les champs obligatoires.", "error");
    return;
  }

  if (sowingDate > todayIsoDate) {
    setMessage(seedMessage, "La date de semis ne peut pas etre dans le futur.", "error");
    return;
  }

  const existingSeed = isEdit ? getSeedById(seedId) : null;
  if (isEdit && (!existingSeed || existingSeed.user_id !== currentUser.id)) {
    setMessage(seedMessage, "Modification refusee.", "error");
    return;
  }

  const selectedPhoto = getSelectedSeedPhoto();

  isSavingSeed = true;
  setSeedFormSavingState(true);
  setMessage(seedMessage, "Enregistrement...");
  showSeedProgress("Preparation...", 8);

  let submitSucceeded = false;

  try {
    const hasNewPhoto = Boolean(selectedPhoto.file);
    const selectedPhotoSnapshotPromise = hasNewPhoto
      ? createStableUploadBlob(
        selectedPhoto.file,
        selectedPhoto.file.type || "image/jpeg"
      )
        .then((snapshotBlob) => ({
          blob: snapshotBlob,
          name: selectedPhoto.file.name || "photo.jpg",
          mimeType: selectedPhoto.file.type || "image/jpeg"
        }))
        .catch(() => null)
      : null;
    const previousPhotoPath = existingSeed?.photo_path || null;
    const photoPath = previousPhotoPath;
    let savedSeedId = seedId;
    setSeedProgress(28, "Validation des donnees...");

    const payload = {
      plant_id: plantId,
      plant_name: plantName,
      sowing_date: sowingDate,
      current_week: isEdit ? Number(existingSeed.current_week) || 1 : calculatedCurrentWeek,
      location,
      photo_path: photoPath
    };

    setSeedProgress(62, isEdit ? "Mise a jour du semis..." : "Creation du semis...");

    if (isEdit) {
      const updateResult = await updateSeedRecord(seedId, payload);
      if (updateResult.error) {
        setMessage(seedMessage, `Erreur modification: ${updateResult.error.message}`, "error");
        return;
      }
    } else {
      const createResult = await createSeedRecord({
        ...payload,
        user_id: currentUser.id,
        owner_email: normalizeText(currentUser.email)
      });

      if (createResult.error) {
        setMessage(seedMessage, `Erreur creation: ${createResult.error.message}`, "error");
        return;
      }

      savedSeedId = String(createResult.id || "");
    }

    setSeedProgress(86, "Actualisation de la liste...");
    const loaded = await loadSeeds({ silentStatus: true });
    if (!loaded) {
      return;
    }

    resetSeedForm();
    setSeedProgress(100, "Semis enregistre.");
    if (hasNewPhoto && savedSeedId) {
      setMessage(seedMessage, isEdit ? "Semis modifie. Upload photo en cours..." : "Semis ajoute. Upload photo en cours...", "success");
      void uploadSeedPhotoInBackground(
        savedSeedId,
        selectedPhoto,
        previousPhotoPath,
        selectedPhotoSnapshotPromise
      );
    } else {
      setMessage(seedMessage, isEdit ? "Semis modifie." : "Semis ajoute.", "success");
    }
    submitSucceeded = true;
  } finally {
    isSavingSeed = false;
    setSeedFormSavingState(false);
    if (submitSucceeded) {
      hideSeedProgress(900);
    } else {
      hideSeedProgress();
    }
  }
}

async function handlePasswordLogin(event) {
  event.preventDefault();

  const email = normalizeText(passwordEmailInput.value);
  const password = passwordLoginInput.value;

  if (!email || !password) {
    setMessage(authMessage, "Email et mot de passe requis.", "error");
    return;
  }

  setMessage(authMessage, "Connexion...");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setMessage(authMessage, `Erreur connexion: ${error.message}`, "error");
    return;
  }
  setMessage(authMessage, "Connexion reussie.", "success");
}

async function handleMagicLinkLogin(event) {
  event.preventDefault();

  const email = normalizeText(magicEmailInput.value);
  if (!email) {
    setMessage(authMessage, "Email requis.", "error");
    return;
  }

  setMessage(authMessage, "Envoi du lien de connexion...");
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: getRedirectUrl() }
  });

  if (error) {
    setMessage(authMessage, `Erreur login: ${error.message}`, "error");
    return;
  }

  setMessage(authMessage, "Lien envoye. Ouvre ta boite mail.", "success");
  magicLinkForm.reset();
}

async function handlePasswordSet(event) {
  event.preventDefault();

  if (!currentUser) {
    setMessage(passwordMessage, "Connexion requise.", "error");
    return;
  }

  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!newPassword || !confirmPassword) {
    setMessage(passwordMessage, "Saisis et confirme ton mot de passe.", "error");
    return;
  }

  if (newPassword.length < 8) {
    setMessage(passwordMessage, "Le mot de passe doit faire au moins 8 caracteres.", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    setMessage(passwordMessage, "Les mots de passe ne correspondent pas.", "error");
    return;
  }

  setMessage(passwordMessage, "Enregistrement du mot de passe...");
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) {
    setMessage(passwordMessage, `Erreur mot de passe: ${error.message}`, "error");
    return;
  }

  resetPasswordForm();
  showSeedWorkspace();
  setMessage(seedMessage, "Mot de passe enregistre. Tu peux continuer avec tes semis.", "success");
}

async function handleLogout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    setMessage(seedMessage, `Erreur deconnexion: ${error.message}`, "error");
    return;
  }
  showAuthPanel();
  setMessage(authMessage, "Deconnecte.");
}

function attachEvents() {
  passwordLoginForm.addEventListener("submit", handlePasswordLogin);
  magicLinkForm.addEventListener("submit", handleMagicLinkLogin);
  passwordSetForm.addEventListener("submit", handlePasswordSet);
  logoutBtn.addEventListener("click", handleLogout);
  openPasswordBtn.addEventListener("click", showPasswordWorkspace);
  closePasswordBtn.addEventListener("click", () => {
    resetPasswordForm();
    showSeedWorkspace();
  });
  seedForm.addEventListener("submit", handleSeedSubmit);
  cancelEditBtn.addEventListener("click", resetSeedForm);

  seedDateInput.addEventListener("change", () => {
    if (!seedIdInput.value) {
      currentWeekInput.value = String(calculateCurrentWeek(seedDateInput.value));
    }
  });

  if (seedPhotoInput) {
    seedPhotoInput.addEventListener("change", () => {
      updateSeedPhotoSelectedText();
    });
  }

  updateSeedPhotoSelectedText();
  ensurePhotoLightbox();

  seedList.addEventListener("click", async (event) => {
    const clickedImage = event.target.closest("img.seed-photo");
    if (clickedImage) {
      openPhotoLightbox(clickedImage.currentSrc || clickedImage.src, clickedImage.alt || "Photo semis");
      return;
    }

    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const seedId = button.dataset.seedId;
    const action = button.dataset.action;
    const seed = getSeedById(seedId);

    if (!seed) {
      return;
    }

    if (action === "edit") {
      if (seed.user_id !== currentUser.id) {
        setMessage(seedMessage, "Tu ne peux modifier que tes semis.", "error");
        return;
      }
      showSeedWorkspace();
      startEdit(seed);
    }

    if (action === "delete") {
      await handleDelete(seed);
    }
  });
}

async function init() {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    setMessage(authMessage, "Configuration Supabase manquante dans supabase-config.js", "error");
    return;
  }

  prefillPlantId = getPrefillPlantIdFromUrl();
  seedDateInput.max = getTodayIsoDate();

  supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  try {
    await loadPlantCatalog();
  } catch (error) {
    setMessage(authMessage, "Impossible de charger la liste des plantes.", "error");
    return;
  }

  attachEvents();

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setMessage(authMessage, `Erreur session: ${error.message}`, "error");
    return;
  }

  await applySession(data.session);

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
  });
}

init();
