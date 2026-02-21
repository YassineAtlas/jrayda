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
const seedPhotoCameraInput = document.getElementById("seed-photo-camera");
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

function getFirstSelectedFile(inputs) {
  for (const input of inputs) {
    const file = input?.files?.[0];
    if (file) {
      return file;
    }
  }
  return null;
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
  const file = getFirstSelectedFile([seedPhotoCameraInput, seedPhotoInput]);
  if (!file) {
    setSeedPhotoSelectedText("Aucune photo selectionnee.");
    return;
  }

  const fromCamera = Boolean(seedPhotoCameraInput?.files?.[0]);
  const sourceLabel = fromCamera ? "camera" : "fichier";
  const fileName = file.name || "image.jpg";
  setSeedPhotoSelectedText(`Photo ${sourceLabel}: ${fileName}`, true);
}

function setSeedFormSavingState(isSaving) {
  saveBtn.disabled = isSaving;
  cancelEditBtn.disabled = isSaving;
  plantSelectInput.disabled = isSaving;
  seedDateInput.disabled = isSaving;
  currentWeekInput.disabled = isSaving;
  seedLocationInput.disabled = isSaving;
  seedPhotoInput.disabled = isSaving;
  seedPhotoCameraInput.disabled = isSaving;
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

function getSeedWeek(seed) {
  const dbWeek = Number(seed.current_week);
  if (Number.isInteger(dbWeek) && dbWeek > 0) {
    return dbWeek;
  }
  return calculateCurrentWeek(seed.sowing_date);
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
      const week = getSeedWeek(seed);

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
          <div class="seed-week-badge">Semaine ${week}</div>
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

async function uploadPhotoIfNeeded(fileInputs) {
  const file = getFirstSelectedFile(fileInputs);
  if (!file) {
    return null;
  }

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const path = `${currentUser.id}/${Date.now()}-${safeName}`;
  const { error } = await supabaseClient.storage.from(PHOTO_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "image/jpeg"
  });

  if (error) {
    setMessage(seedMessage, `Upload photo impossible: ${error.message}`, "error");
    return false;
  }

  return path;
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

  isSavingSeed = true;
  setSeedFormSavingState(true);
  setMessage(seedMessage, "Enregistrement...");
  showSeedProgress("Preparation...", 8);

  let submitSucceeded = false;

  try {
    let photoPath = existingSeed?.photo_path || null;
    const hasNewPhoto = Boolean(getFirstSelectedFile([seedPhotoCameraInput, seedPhotoInput]));
    setSeedProgress(28, hasNewPhoto ? "Upload de la photo..." : "Validation des donnees...");

    const uploadedPhotoPath = await uploadPhotoIfNeeded([seedPhotoCameraInput, seedPhotoInput]);
    if (uploadedPhotoPath === false) {
      return;
    }
    if (uploadedPhotoPath) {
      photoPath = uploadedPhotoPath;
    }

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
      const { error } = await supabaseClient
        .from("semis")
        .update(payload)
        .eq("id", seedId)
        .eq("user_id", currentUser.id);

      if (error) {
        setMessage(seedMessage, `Erreur modification: ${error.message}`, "error");
        return;
      }

      if (uploadedPhotoPath && existingSeed.photo_path && existingSeed.photo_path !== uploadedPhotoPath) {
        await deletePhotoIfExists(existingSeed.photo_path);
      }
    } else {
      const { error } = await supabaseClient.from("semis").insert({
        ...payload,
        user_id: currentUser.id,
        owner_email: normalizeText(currentUser.email)
      });

      if (error) {
        setMessage(seedMessage, `Erreur creation: ${error.message}`, "error");
        return;
      }
    }

    setSeedProgress(86, "Actualisation de la liste...");
    const loaded = await loadSeeds({ silentStatus: true });
    if (!loaded) {
      return;
    }

    resetSeedForm();
    setSeedProgress(100, "Semis enregistre.");
    setMessage(seedMessage, isEdit ? "Semis modifie." : "Semis ajoute.", "success");
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

  if (seedPhotoInput && seedPhotoCameraInput) {
    seedPhotoInput.addEventListener("change", () => {
      if (seedPhotoInput.files[0]) {
        seedPhotoCameraInput.value = "";
      }
      updateSeedPhotoSelectedText();
    });

    seedPhotoCameraInput.addEventListener("change", () => {
      if (seedPhotoCameraInput.files[0]) {
        seedPhotoInput.value = "";
      }
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
