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
const passwordSetForm = document.getElementById("password-set-form");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");

const seedForm = document.getElementById("seed-form");
const seedIdInput = document.getElementById("seed-id");
const plantNameInput = document.getElementById("plant-name");
const seedDateInput = document.getElementById("seed-date");
const seedLocationInput = document.getElementById("seed-location");
const seedPhotoInput = document.getElementById("seed-photo");
const saveBtn = document.getElementById("save-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const seedList = document.getElementById("seed-list");

let supabaseClient = null;
let currentUser = null;
let seedCache = [];

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

function resetSeedForm() {
  seedForm.reset();
  seedIdInput.value = "";
  saveBtn.textContent = "Ajouter le semis";
  cancelEditBtn.classList.add("hidden");
  cancelEditBtn.hidden = true;
}

function resetPasswordForm() {
  passwordSetForm.reset();
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

      const actions = canEdit
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
          <h3>${escapeHtml(seed.plant_name)}</h3>
          <p><strong>Date semis:</strong> ${escapeHtml(formatDateForDisplay(seed.sowing_date))}</p>
          <p><strong>Emplacement:</strong> ${escapeHtml(seed.location)}</p>
          ${actions}
        </article>
      `;
    })
    .join("");
}

async function loadSeeds() {
  setMessage(seedMessage, "Chargement des semis...");
  const { data, error } = await supabaseClient
    .from("semis")
    .select("id, user_id, owner_email, plant_name, sowing_date, location, photo_path, created_at")
    .order("sowing_date", { ascending: false });

  if (error) {
    setMessage(seedMessage, `Erreur: ${error.message}`, "error");
    return;
  }

  seedCache = data || [];
  await renderSeeds(seedCache);
  setMessage(seedMessage, `${seedCache.length} semis visible(s).`, "success");
}

async function isFamilyMember(email) {
  const normalizedEmail = (email || "").trim().toLowerCase();
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
  setMessage(passwordMessage, "");
  setMessage(seedMessage, `Connecte: ${currentUser.email}`, "success");
  await loadSeeds();
}

async function uploadPhotoIfNeeded() {
  const file = seedPhotoInput.files[0];
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

function getSeedById(seedId) {
  return seedCache.find((seed) => seed.id === seedId) || null;
}

function startEdit(seed) {
  seedIdInput.value = seed.id;
  plantNameInput.value = seed.plant_name;
  seedDateInput.value = seed.sowing_date;
  seedLocationInput.value = seed.location;
  saveBtn.textContent = "Enregistrer la modification";
  cancelEditBtn.classList.remove("hidden");
  cancelEditBtn.hidden = false;
  setMessage(seedMessage, "Mode modification actif.");
}

async function handleDelete(seed) {
  if (!seed || seed.user_id !== currentUser.id) {
    setMessage(seedMessage, "Suppression refusee.", "error");
    return;
  }

  const shouldDelete = window.confirm(`Supprimer le semis "${seed.plant_name}" ?`);
  if (!shouldDelete) {
    return;
  }

  setMessage(seedMessage, "Suppression...");

  if (seed.photo_path) {
    await deletePhotoIfExists(seed.photo_path);
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

  if (!currentUser) {
    setMessage(seedMessage, "Connexion requise.", "error");
    return;
  }

  const plantName = plantNameInput.value.trim();
  const sowingDate = seedDateInput.value;
  const location = seedLocationInput.value.trim();
  const seedId = seedIdInput.value.trim();
  const isEdit = Boolean(seedId);

  if (!plantName || !sowingDate || !location) {
    setMessage(seedMessage, "Tous les champs obligatoires doivent etre remplis.", "error");
    return;
  }

  const existingSeed = isEdit ? getSeedById(seedId) : null;
  if (isEdit && (!existingSeed || existingSeed.user_id !== currentUser.id)) {
    setMessage(seedMessage, "Modification refusee.", "error");
    return;
  }

  setMessage(seedMessage, "Enregistrement...");

  let photoPath = existingSeed?.photo_path || null;
  const uploadedPhotoPath = await uploadPhotoIfNeeded();
  if (uploadedPhotoPath === false) {
    return;
  }
  if (uploadedPhotoPath) {
    photoPath = uploadedPhotoPath;
  }

  const payload = {
    plant_name: plantName,
    sowing_date: sowingDate,
    location,
    photo_path: photoPath
  };

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
    const insertPayload = {
      ...payload,
      user_id: currentUser.id,
      owner_email: (currentUser.email || "").toLowerCase()
    };

    const { error } = await supabaseClient.from("semis").insert(insertPayload);
    if (error) {
      setMessage(seedMessage, `Erreur creation: ${error.message}`, "error");
      return;
    }
  }

  resetSeedForm();
  await loadSeeds();
}

async function handlePasswordLogin(event) {
  event.preventDefault();

  const email = passwordEmailInput.value.trim().toLowerCase();
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

  const email = magicEmailInput.value.trim().toLowerCase();
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
  setMessage(
    passwordMessage,
    "Mot de passe enregistre. Tu peux maintenant te connecter sans lien email.",
    "success"
  );
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
  seedForm.addEventListener("submit", handleSeedSubmit);
  cancelEditBtn.addEventListener("click", resetSeedForm);

  seedList.addEventListener("click", async (event) => {
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
      startEdit(seed);
    }

    if (action === "delete") {
      await handleDelete(seed);
    }
  });
}

async function init() {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    setMessage(
      authMessage,
      "Configuration Supabase manquante dans supabase-config.js",
      "error"
    );
    return;
  }

  supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

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
