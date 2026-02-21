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
const updateMessage = document.getElementById("update-message");
const updatesList = document.getElementById("updates-list");

let supabaseClient = null;
let currentUser = null;
let semisId = "";
let semisRecord = null;
let isOwner = false;
let updatesCache = [];

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

  setMessage(updateMessage, "Enregistrement du suivi...");
  const uploadedPhotoPath = await uploadUpdatePhotoIfNeeded();
  if (uploadedPhotoPath === false) {
    return;
  }

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

  setMessage(updateMessage, "Suivi ajoute.", "success");
  await loadUpdates();
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
    });

    updatePhotoCameraInput.addEventListener("change", () => {
      if (updatePhotoCameraInput.files[0]) {
        updatePhotoInput.value = "";
      }
    });
  }

  updatesList.addEventListener("click", async (event) => {
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
