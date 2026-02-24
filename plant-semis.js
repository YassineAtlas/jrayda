const plantSemisContainer = document.getElementById("plant-semis");
const plantDetailContainer = document.getElementById("plant-detail");
const tabSheetBtn = document.getElementById("tab-sheet");
const tabSemisBtn = document.getElementById("tab-semis");

let plantSemisLoaded = false;
let photoLightbox = null;
let photoLightboxImage = null;

function getPlantIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
}

function shouldOpenSemisTabByDefault() {
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") === "semis";
}

function syncTabInUrl(tabName) {
  const url = new URL(window.location.href);
  if (tabName === "semis") {
    url.searchParams.set("tab", "semis");
  } else {
    url.searchParams.delete("tab");
  }
  window.history.replaceState({}, "", url.toString());
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function formatWeekWithDays(weekNumber, sowingDate) {
  const week = Number(weekNumber) || 1;
  const days = calculateDaysSinceDate(sowingDate);
  if (!Number.isInteger(days)) {
    return `Semaine ${week}`;
  }
  return `Semaine ${week} (${days}J)`;
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

function renderSemisTabIntro({ plantId, showAddButton }) {
  const addButton = showAddButton
    ? `<a class="seed-open-link" href="famille.html?plant_id=${plantId}">Ajouter un semis de cette plante</a>`
    : "";

  return `
    <div class="semis-tab-header">
      <p>Historique des semis pour cette plante.</p>
      ${addButton}
    </div>
    <div id="plant-semis-list"></div>
  `;
}

function showSheetTab() {
  tabSheetBtn.classList.add("active");
  tabSemisBtn.classList.remove("active");
  plantDetailContainer.classList.remove("hidden");
  plantDetailContainer.hidden = false;
  plantSemisContainer.classList.add("hidden");
  plantSemisContainer.hidden = true;
  syncTabInUrl("sheet");
}

function showSemisTab() {
  tabSemisBtn.classList.add("active");
  tabSheetBtn.classList.remove("active");
  plantSemisContainer.classList.remove("hidden");
  plantSemisContainer.hidden = false;
  plantDetailContainer.classList.add("hidden");
  plantDetailContainer.hidden = true;
  syncTabInUrl("semis");
}

function renderSemisCards(rows, signedUrls) {
  const list = document.getElementById("plant-semis-list");
  if (!list) {
    return;
  }

  if (!rows.length) {
    list.innerHTML = "<p>Aucun semis enregistre pour cette plante.</p>";
    return;
  }

  list.innerHTML = rows
    .map((row, index) => {
      const week = Number(row.current_week) || 1;
      const weekLabel = formatWeekWithDays(week, row.sowing_date);
      const photo = signedUrls[index]
        ? `<img class="seed-photo" src="${signedUrls[index]}" alt="Semis">`
        : "";

      return `
        <article class="seed-card">
          ${photo}
          <div class="seed-week-badge">${escapeHtml(weekLabel)}</div>
          <h3>${escapeHtml(row.plant_name || "Plante")}</h3>
          <p><strong>Date semis:</strong> ${escapeHtml(formatDate(row.sowing_date))}</p>
          <p><strong>Emplacement:</strong> ${escapeHtml(row.location || "-")}</p>
          <p><strong>Membre:</strong> ${escapeHtml(row.owner_email || "-")}</p>
          <a class="seed-open-link seed-action-button" href="semis.html?id=${row.id}">Voir le suivi</a>
        </article>
      `;
    })
    .join("");
}

async function loadSemisTab() {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    plantSemisContainer.innerHTML = "<p>Configuration Supabase manquante.</p>";
    return;
  }

  const plantId = getPlantIdFromUrl();
  if (!plantId) {
    plantSemisContainer.innerHTML = "<p>Plante introuvable.</p>";
    return;
  }

  const supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  plantSemisContainer.innerHTML = renderSemisTabIntro({ plantId, showAddButton: false });
  const list = document.getElementById("plant-semis-list");
  if (list) {
    list.innerHTML = "<p>Chargement des semis...</p>";
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData?.session || null;
  if (!session) {
    if (list) {
      list.innerHTML =
        `<p>Connecte-toi dans <a href="famille.html?plant_id=${plantId}">Espace famille</a> pour voir et ajouter les semis de cette plante.</p>`;
    }
    return;
  }

  const { data: membership } = await supabaseClient
    .from("family_emails")
    .select("email")
    .eq("email", (session.user.email || "").toLowerCase())
    .maybeSingle();

  if (!membership) {
    if (list) {
      list.innerHTML = "<p>Acces reserve aux membres de la famille.</p>";
    }
    return;
  }

  plantSemisContainer.innerHTML = renderSemisTabIntro({ plantId, showAddButton: true });

  const { data: rows, error } = await supabaseClient
    .from("semis")
    .select("id, plant_name, sowing_date, current_week, location, owner_email, photo_path")
    .eq("plant_id", plantId)
    .order("sowing_date", { ascending: false });

  if (error) {
    const listAfterError = document.getElementById("plant-semis-list");
    if (listAfterError) {
      listAfterError.innerHTML = `<p>Erreur: ${escapeHtml(error.message)}</p>`;
    }
    return;
  }

  const signedUrls = await Promise.all(
    (rows || []).map(async (row) => {
      if (!row.photo_path) {
        return "";
      }
      const { data } = await supabaseClient.storage
        .from("semis-photos")
        .createSignedUrl(row.photo_path, 60 * 60);
      return data?.signedUrl || "";
    })
  );

  renderSemisCards(rows || [], signedUrls);
}

async function openSemisTab() {
  showSemisTab();
  if (!plantSemisLoaded) {
    plantSemisLoaded = true;
    await loadSemisTab();
  }
}

function initTabs() {
  if (!tabSheetBtn || !tabSemisBtn || !plantSemisContainer || !plantDetailContainer) {
    return;
  }

  ensurePhotoLightbox();

  const openSemisByDefault = shouldOpenSemisTabByDefault();

  if (openSemisByDefault) {
    openSemisTab();
  } else {
    showSheetTab();
  }

  tabSheetBtn.addEventListener("click", showSheetTab);
  tabSemisBtn.addEventListener("click", async () => {
    await openSemisTab();
  });

  plantSemisContainer.addEventListener("click", (event) => {
    const clickedImage = event.target.closest("img.seed-photo");
    if (!clickedImage) {
      return;
    }
    openPhotoLightbox(clickedImage.currentSrc || clickedImage.src, clickedImage.alt || "Photo semis");
  });
}

initTabs();
