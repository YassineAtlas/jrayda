const plantSemisContainer = document.getElementById("plant-semis");
const plantDetailContainer = document.getElementById("plant-detail");
const tabSheetBtn = document.getElementById("tab-sheet");
const tabSemisBtn = document.getElementById("tab-semis");

let plantSemisLoaded = false;

function getPlantIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
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

function showSheetTab() {
  tabSheetBtn.classList.add("active");
  tabSemisBtn.classList.remove("active");
  plantDetailContainer.classList.remove("hidden");
  plantDetailContainer.hidden = false;
  plantSemisContainer.classList.add("hidden");
  plantSemisContainer.hidden = true;
}

function showSemisTab() {
  tabSemisBtn.classList.add("active");
  tabSheetBtn.classList.remove("active");
  plantSemisContainer.classList.remove("hidden");
  plantSemisContainer.hidden = false;
  plantDetailContainer.classList.add("hidden");
  plantDetailContainer.hidden = true;
}

function renderSemisCards(rows, signedUrls) {
  if (!rows.length) {
    plantSemisContainer.innerHTML = "<p>Aucun semis enregistre pour cette plante.</p>";
    return;
  }

  plantSemisContainer.innerHTML = rows
    .map((row, index) => {
      const week = Number(row.current_week) || 1;
      const photo = signedUrls[index]
        ? `<img class="seed-photo" src="${signedUrls[index]}" alt="Semis">`
        : "";

      return `
        <article class="seed-card">
          ${photo}
          <div class="seed-week-badge">Semaine ${week}</div>
          <h3>${escapeHtml(row.plant_name || "Plante")}</h3>
          <p><strong>Date semis:</strong> ${escapeHtml(formatDate(row.sowing_date))}</p>
          <p><strong>Emplacement:</strong> ${escapeHtml(row.location || "-")}</p>
          <p><strong>Membre:</strong> ${escapeHtml(row.owner_email || "-")}</p>
          <a class="seed-open-link" href="semis.html?id=${row.id}">Ouvrir le suivi</a>
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

  plantSemisContainer.innerHTML = "<p>Chargement des semis...</p>";

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData?.session || null;
  if (!session) {
    plantSemisContainer.innerHTML =
      '<p>Connecte-toi dans <a href="famille.html">Espace famille</a> pour voir les semis de cette plante.</p>';
    return;
  }

  const { data: membership } = await supabaseClient
    .from("family_emails")
    .select("email")
    .eq("email", (session.user.email || "").toLowerCase())
    .maybeSingle();

  if (!membership) {
    plantSemisContainer.innerHTML = "<p>Acces reserve aux membres de la famille.</p>";
    return;
  }

  const { data: rows, error } = await supabaseClient
    .from("semis")
    .select("id, plant_name, sowing_date, current_week, location, owner_email, photo_path")
    .eq("plant_id", plantId)
    .order("sowing_date", { ascending: false });

  if (error) {
    plantSemisContainer.innerHTML = `<p>Erreur: ${escapeHtml(error.message)}</p>`;
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

function initTabs() {
  if (!tabSheetBtn || !tabSemisBtn || !plantSemisContainer || !plantDetailContainer) {
    return;
  }

  showSheetTab();

  tabSheetBtn.addEventListener("click", showSheetTab);
  tabSemisBtn.addEventListener("click", async () => {
    showSemisTab();
    if (!plantSemisLoaded) {
      plantSemisLoaded = true;
      await loadSemisTab();
    }
  });
}

initTabs();
