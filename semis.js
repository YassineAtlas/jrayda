const PHOTO_BUCKET = "semis-photos";

const semisDetail = document.getElementById("semis-detail");
const updateForm = document.getElementById("update-form");
const updateModeInput = document.getElementById("update-mode");
const updateDateWrap = document.getElementById("update-date-wrap");
const updateDateInput = document.getElementById("update-date");
const updateWeekWrap = document.getElementById("update-week-wrap");
const updateWeekInput = document.getElementById("update-week");
const updateNoteInput = document.getElementById("update-note");
const updatePhotoInput = document.getElementById("update-photo");
const updatePhotoCameraInput = document.getElementById("update-photo-camera");
const updatePhotoSelected = document.getElementById("update-photo-selected");
const updateProgress = document.getElementById("update-progress");
const updateProgressBar = document.getElementById("update-progress-bar");
const updateProgressLabel = document.getElementById("update-progress-label");
const updateProgressPercent = document.getElementById("update-progress-percent");
const updateMessage = document.getElementById("update-message");
const updatesList = document.getElementById("updates-list");

let supabaseClient = null;
let currentUser = null;
let semisId = "";
let semisRecord = null;
let isOwner = false;
let updatesCache = [];
let isSavingUpdate = false;
let updateProgressHideTimer = null;
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
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-FR");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR");
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateWeekFromDate(sowingDate, eventDate) {
  const sowing = new Date(`${sowingDate}T00:00:00`);
  const event = new Date(`${eventDate}T00:00:00`);
  if (Number.isNaN(sowing.getTime()) || Number.isNaN(event.getTime())) {
    return 1;
  }
  const diffMs = event.getTime() - sowing.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

function parseSemisId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function getFirstSelectedFile(inputs) {
  for (const input of inputs) {
    const file = input?.files?.[0];
    if (file) {
      return file;
    }
  }
  return null;
}

function clearUpdateProgressHideTimer() {
  if (updateProgressHideTimer === null) {
    return;
  }
  window.clearTimeout(updateProgressHideTimer);
  updateProgressHideTimer = null;
}

function setUpdatePhotoSelectedText(text, isSelected = false) {
  if (!updatePhotoSelected) {
    return;
  }
  updatePhotoSelected.textContent = text;
  updatePhotoSelected.classList.toggle("selected", isSelected);
}

function updatePhotoSelectionText() {
  const file = getFirstSelectedFile([updatePhotoCameraInput, updatePhotoInput]);
  if (!file) {
    setUpdatePhotoSelectedText("Aucune photo selectionnee.");
    return;
  }

  const fromCamera = Boolean(updatePhotoCameraInput?.files?.[0]);
  const sourceLabel = fromCamera ? "camera" : "fichier";
  const fileName = file.name || "image.jpg";
  setUpdatePhotoSelectedText(`Photo ${sourceLabel}: ${fileName}`, true);
}

function setUpdateFormSavingState(isSaving) {
  updateModeInput.disabled = isSaving;
  updateDateInput.disabled = isSaving;
  updateWeekInput.disabled = isSaving;
  updateNoteInput.disabled = isSaving;
  updatePhotoInput.disabled = isSaving;
  updatePhotoCameraInput.disabled = isSaving;
  const submitBtn = updateForm.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = isSaving;
  }
}

function setUpdateProgress(value, label = "") {
  const safeValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  if (updateProgressBar) {
    updateProgressBar.value = safeValue;
  }
  if (updateProgressPercent) {
    updateProgressPercent.textContent = `${safeValue}%`;
  }
  if (label && updateProgressLabel) {
    updateProgressLabel.textContent = label;
  }
}

function showUpdateProgress(label = "Enregistrement du suivi...", value = 0) {
  if (!updateProgress) {
    return;
  }
  clearUpdateProgressHideTimer();
  updateProgress.classList.remove("hidden");
  updateProgress.hidden = false;
  setUpdateProgress(value, label);
}

function hideUpdateProgress(delayMs = 0) {
  if (!updateProgress) {
    return;
  }

  clearUpdateProgressHideTimer();

  const hideNow = () => {
    setUpdateProgress(0, "Enregistrement du suivi...");
    updateProgress.classList.add("hidden");
    updateProgress.hidden = true;
  };

  if (delayMs > 0) {
    updateProgressHideTimer = window.setTimeout(hideNow, delayMs);
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

function showOwnerUpdateForm() {
  updateForm.classList.remove("hidden");
  updateForm.hidden = false;
}

function hideOwnerUpdateForm() {
  updateForm.classList.add("hidden");
  updateForm.hidden = true;
}

function applyUpdateModeFields() {
  const mode = updateModeInput.value;

  if (mode === "custom_date") {
    updateDateWrap.classList.remove("hidden");
    updateDateWrap.hidden = false;
    updateDateInput.required = true;

    updateWeekWrap.classList.add("hidden");
    updateWeekWrap.hidden = true;
    updateWeekInput.required = false;
    return;
  }

  if (mode === "custom_week") {
    updateWeekWrap.classList.remove("hidden");
    updateWeekWrap.hidden = false;
    updateWeekInput.required = true;

    updateDateWrap.classList.add("hidden");
    updateDateWrap.hidden = true;
    updateDateInput.required = false;
    return;
  }

  updateDateWrap.classList.add("hidden");
  updateDateWrap.hidden = true;
  updateDateInput.required = false;

  updateWeekWrap.classList.add("hidden");
  updateWeekWrap.hidden = true;
  updateWeekInput.required = false;
}

function resolveTrackingValues() {
  const mode = updateModeInput.value;
  const todayIsoDate = getTodayIsoDate();

  if (mode === "current_date") {
    const eventDate = todayIsoDate;
    return {
      weekNumber: calculateWeekFromDate(semisRecord.sowing_date, eventDate),
      eventDate
    };
  }

  if (mode === "custom_date") {
    const eventDate = updateDateInput.value;
    if (!eventDate) {
      return { error: "Choisis une date de suivi." };
    }
    if (eventDate > todayIsoDate) {
      return { error: "La date du suivi ne peut pas etre dans le futur." };
    }
    return {
      weekNumber: calculateWeekFromDate(semisRecord.sowing_date, eventDate),
      eventDate
    };
  }

  if (mode === "custom_week") {
    const weekNumber = Number(updateWeekInput.value);
    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      return { error: "La semaine doit etre >= 1." };
    }
    return {
      weekNumber,
      eventDate: null
    };
  }

  return { error: "Mode de suivi invalide." };
}

async function renderSemisDetail() {
  const photoUrl = await getSignedPhotoUrl(semisRecord.photo_path);
  const photoHtml = photoUrl
    ? `<img class="seed-photo" src="${photoUrl}" alt="Photo du semis">`
    : "";
  const plantLink = semisRecord.plant_id
    ? `<p><a class="seed-open-link" href="plant.html?id=${semisRecord.plant_id}">Voir la fiche plante</a></p>`
    : "";

  semisDetail.innerHTML = `
    ${photoHtml}
    <div class="seed-week-badge">Semaine ${semisRecord.current_week || 1}</div>
    <h3>${escapeHtml(semisRecord.plant_name || "Plante")}</h3>
    <p><strong>Date semis:</strong> ${escapeHtml(semisRecord.sowing_date || "-")}</p>
    <p><strong>Emplacement:</strong> ${escapeHtml(semisRecord.location || "-")}</p>
    <p><strong>Createur:</strong> ${escapeHtml(semisRecord.owner_email || "-")}</p>
    ${plantLink}
  `;
}

async function loadSemis() {
  const { data, error } = await supabaseClient
    .from("semis")
    .select("id, user_id, owner_email, plant_id, plant_name, sowing_date, current_week, location, photo_path, created_at")
    .eq("id", semisId)
    .maybeSingle();

  if (error || !data) {
    semisDetail.innerHTML = "<p>Semis introuvable ou acces refuse.</p>";
    hideOwnerUpdateForm();
    return false;
  }

  semisRecord = data;
  isOwner = currentUser && semisRecord.user_id === currentUser.id;

  if (isOwner) {
    showOwnerUpdateForm();
    updateModeInput.value = "current_date";
    updateDateInput.value = getTodayIsoDate();
    updateDateInput.max = getTodayIsoDate();
    updateWeekInput.value = String(semisRecord.current_week || 1);
    applyUpdateModeFields();
    updatePhotoSelectionText();
  } else {
    hideOwnerUpdateForm();
  }

  await renderSemisDetail();
  return true;
}

async function renderUpdates() {
  if (!updatesCache.length) {
    updatesList.innerHTML = "<p>Aucun suivi hebdomadaire pour le moment.</p>";
    return;
  }

  const signedUrls = await Promise.all(
    updatesCache.map((item) => getSignedPhotoUrl(item.photo_path))
  );

  updatesList.innerHTML = updatesCache
    .map((item, index) => {
      const week = Number(item.week_number) || 1;
      const addedAt = formatDateTime(item.created_at);
      const trackedDate = item.event_date ? formatDate(item.event_date) : "";
      const trackedLabel = trackedDate
        ? `<p class="update-date">Date du suivi: ${escapeHtml(trackedDate)}</p>`
        : '<p class="update-date">Date du suivi: semaine manuelle</p>';
      const photo = signedUrls[index]
        ? `<img class="seed-photo" src="${signedUrls[index]}" alt="Photo semaine ${week}">`
        : "";
      const note = item.note ? `<p>${escapeHtml(item.note)}</p>` : "<p>Aucun commentaire.</p>";
      const deleteBtn = isOwner
        ? `<button type="button" data-action="delete-update" data-update-id="${item.id}" class="secondary">Supprimer</button>`
        : "";

      return `
        <article class="update-card">
          <div class="seed-week-badge">Semaine ${week}</div>
          ${trackedLabel}
          <p class="update-date">Ajoute le ${escapeHtml(addedAt)}</p>
          ${photo}
          ${note}
          ${deleteBtn}
        </article>
      `;
    })
    .join("");
}

async function loadUpdates() {
  const { data, error } = await supabaseClient
    .from("semis_updates")
    .select("id, semis_id, user_id, week_number, event_date, note, photo_path, created_at")
    .eq("semis_id", semisId)
    .order("week_number", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    setMessage(updateMessage, `Erreur suivi: ${error.message}`, "error");
    return;
  }

  updatesCache = data || [];
  await renderUpdates();
}

async function uploadUpdatePhotoIfNeeded() {
  const file = getFirstSelectedFile([updatePhotoCameraInput, updatePhotoInput]);
  if (!file) {
    return null;
  }

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const path = `${currentUser.id}/updates/${Date.now()}-${safeName}`;

  const { error } = await supabaseClient.storage.from(PHOTO_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "image/jpeg"
  });

  if (error) {
    setMessage(updateMessage, `Upload photo impossible: ${error.message}`, "error");
    return false;
  }

  return path;
}

async function deletePhoto(path) {
  if (!path) {
    return;
  }
  await supabaseClient.storage.from(PHOTO_BUCKET).remove([path]);
}

async function handleUpdateSubmit(event) {
  event.preventDefault();

  if (isSavingUpdate) {
    return;
  }

  if (!isOwner || !semisRecord) {
    setMessage(updateMessage, "Action non autorisee.", "error");
    return;
  }

  const note = updateNoteInput.value.trim();
  const hasPhoto = Boolean(getFirstSelectedFile([updatePhotoCameraInput, updatePhotoInput]));
  const resolved = resolveTrackingValues();

  if (resolved.error) {
    setMessage(updateMessage, resolved.error, "error");
    return;
  }

  if (!note && !hasPhoto) {
    setMessage(updateMessage, "Ajoute un commentaire ou une photo.", "error");
    return;
  }

  isSavingUpdate = true;
  setUpdateFormSavingState(true);
  setMessage(updateMessage, "Enregistrement du suivi...");
  showUpdateProgress("Preparation...", 8);

  let submitSucceeded = false;

  try {
    setUpdateProgress(30, hasPhoto ? "Upload de la photo..." : "Validation des donnees...");
    const uploadedPhotoPath = await uploadUpdatePhotoIfNeeded();
    if (uploadedPhotoPath === false) {
      return;
    }

    setUpdateProgress(58, "Enregistrement du suivi...");
    const { error } = await supabaseClient.from("semis_updates").insert({
      semis_id: semisId,
      user_id: currentUser.id,
      week_number: resolved.weekNumber,
      event_date: resolved.eventDate,
      note: note || null,
      photo_path: uploadedPhotoPath
    });

    if (error) {
      setMessage(updateMessage, `Erreur ajout suivi: ${error.message}`, "error");
      return;
    }

    if ((semisRecord.current_week || 1) !== resolved.weekNumber) {
      setUpdateProgress(76, "Mise a jour de la semaine...");
      const { error: updateSemisError } = await supabaseClient
        .from("semis")
        .update({ current_week: resolved.weekNumber })
        .eq("id", semisId)
        .eq("user_id", currentUser.id);

      if (!updateSemisError) {
        semisRecord.current_week = resolved.weekNumber;
        await renderSemisDetail();
      }
    }

    updateForm.reset();
    updateModeInput.value = "current_date";
    updateDateInput.value = getTodayIsoDate();
    updateWeekInput.value = String(semisRecord.current_week || resolved.weekNumber);
    applyUpdateModeFields();
    updatePhotoSelectionText();

    setUpdateProgress(90, "Actualisation du suivi...");
    await loadUpdates();
    setUpdateProgress(100, "Suivi enregistre.");
    setMessage(updateMessage, "Suivi ajoute.", "success");
    submitSucceeded = true;
  } finally {
    isSavingUpdate = false;
    setUpdateFormSavingState(false);
    if (submitSucceeded) {
      hideUpdateProgress(900);
    } else {
      hideUpdateProgress();
    }
  }
}

function getUpdateById(updateId) {
  return updatesCache.find((item) => item.id === updateId) || null;
}

async function handleDeleteUpdate(updateId) {
  if (!isOwner) {
    setMessage(updateMessage, "Action non autorisee.", "error");
    return;
  }

  const update = getUpdateById(updateId);
  if (!update) {
    return;
  }

  const shouldDelete = window.confirm("Supprimer ce suivi ?");
  if (!shouldDelete) {
    return;
  }

  if (update.photo_path) {
    await deletePhoto(update.photo_path);
  }

  const { error } = await supabaseClient
    .from("semis_updates")
    .delete()
    .eq("id", update.id)
    .eq("user_id", currentUser.id);

  if (error) {
    setMessage(updateMessage, `Erreur suppression suivi: ${error.message}`, "error");
    return;
  }

  setMessage(updateMessage, "Suivi supprime.", "success");
  await loadUpdates();
}

function attachEvents() {
  updateForm.addEventListener("submit", handleUpdateSubmit);
  updateModeInput.addEventListener("change", applyUpdateModeFields);

  if (updatePhotoInput && updatePhotoCameraInput) {
    updatePhotoInput.addEventListener("change", () => {
      if (updatePhotoInput.files[0]) {
        updatePhotoCameraInput.value = "";
      }
      updatePhotoSelectionText();
    });

    updatePhotoCameraInput.addEventListener("change", () => {
      if (updatePhotoCameraInput.files[0]) {
        updatePhotoInput.value = "";
      }
      updatePhotoSelectionText();
    });
  }

  updatePhotoSelectionText();
  ensurePhotoLightbox();

  semisDetail.addEventListener("click", (event) => {
    const clickedImage = event.target.closest("img.seed-photo");
    if (!clickedImage) {
      return;
    }
    openPhotoLightbox(clickedImage.currentSrc || clickedImage.src, clickedImage.alt || "Photo semis");
  });

  updatesList.addEventListener("click", async (event) => {
    const clickedImage = event.target.closest("img.seed-photo");
    if (clickedImage) {
      openPhotoLightbox(clickedImage.currentSrc || clickedImage.src, clickedImage.alt || "Photo suivi");
      return;
    }

    const button = event.target.closest("button[data-action='delete-update']");
    if (!button) {
      return;
    }
    const updateId = button.dataset.updateId;
    await handleDeleteUpdate(updateId);
  });
}

async function init() {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    semisDetail.innerHTML = "<p>Configuration Supabase manquante.</p>";
    return;
  }

  semisId = parseSemisId();
  if (!semisId) {
    semisDetail.innerHTML = "<p>Identifiant semis manquant.</p>";
    return;
  }

  supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    semisDetail.innerHTML = `<p>Erreur session: ${escapeHtml(error.message)}</p>`;
    return;
  }

  currentUser = data.session?.user || null;
  if (!currentUser) {
    semisDetail.innerHTML = '<p>Connecte-toi dans <a href="famille.html">Espace famille</a> pour voir ce suivi.</p>';
    hideOwnerUpdateForm();
    return;
  }

  attachEvents();

  const loaded = await loadSemis();
  if (!loaded) {
    return;
  }

  await loadUpdates();
}

init();
