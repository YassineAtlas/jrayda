const months = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

function formatMonths(monthArray) {
  return monthArray.map(m => months[m - 1]).join(", ");
}

fetch("seeds.json")
  .then(response => response.json())
  .then(data => {

    if (document.getElementById("plant-list")) {
      displayPlantList(data);
    }

    if (document.getElementById("plant-detail")) {
      displayPlantDetail(data);
    }

  });

/* ========================= */
/* ===== PAGE INDEX ======== */
/* ========================= */

function displayPlantList(plants) {
  const container = document.getElementById("plant-list");

  plants.forEach(plant => {

    const imagePath = `images/${plant.id}/main.jpg`;

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <img src="${imagePath}" alt="Aperçu" class="card-image">

      <h2>${plant.general.name} – ${plant.general.plant_name}</h2>

      <p><strong>Difficulté :</strong> ${plant.general.difficulty_level}</p>
      <p><strong>Type :</strong> ${plant.general.type}</p>
      <p><strong>En stock :</strong> ${plant.general.in_stock ? "Oui" : "Non"}</p>

      <a href="plant.html?id=${plant.id}">Voir fiche</a>
    `;

    container.appendChild(card);
  });
}

/* ========================= */
/* ===== PAGE DETAIL ======= */
/* ========================= */

function displayPlantDetail(plants) {

  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get("id"));
  const plant = plants.find(p => p.id === id);
  if (!plant) return;

  const imagePath = `images/${plant.id}/`;
  const container = document.getElementById("plant-detail");

  container.innerHTML = `

    <h1>${plant.general.name} – ${plant.general.plant_name}</h1>

    <img src="${imagePath}main.jpg" alt="Image principale" class="main-image">

    <!-- GENERAL -->
    <p><strong>Nom latin :</strong> ${plant.general.latin_name}</p>
    <p><strong>Type :</strong> ${plant.general.type}</p>
    <p><strong>Cycle :</strong> ${plant.general.life_cycle}</p>
    <p><strong>Difficulté :</strong> ${plant.general.difficulty_level}</p>
    <p><strong>Hauteur :</strong> ${plant.general.height_cm.min}-${plant.general.height_cm.max} cm</p>
    <p><strong>Durée avant récolte :</strong> ${plant.general.days_before_harvest_min}-${plant.general.days_before_harvest_max} jours</p>
    <p>${plant.general.description}</p>

    <!-- PERIODES -->
    <h2>📅 Périodes</h2>
    <p><strong>Semis intérieur :</strong> ${formatMonths(plant.general.sowing_month_indoor)}</p>
    <p><strong>Semis extérieur :</strong> ${formatMonths(plant.general.sowing_month_outdoor)}</p>
    <p><strong>Récolte :</strong> ${formatMonths(plant.general.harvest_months)}</p>

    <!-- GERMINATION -->
    <h2>🌱 Germination</h2>

    <img src="${imagePath}germination.jpg" alt="Germination" class="section-image">

    <p><strong>Température :</strong> ${plant.germination.ideal_temp_c.min}-${plant.germination.ideal_temp_c.max} °C</p>
    <p><strong>Durée :</strong> ${plant.germination.duration_days.min}-${plant.germination.duration_days.max} jours</p>
    <p><strong>Profondeur :</strong> ${plant.germination.depth_cm.min}-${plant.germination.depth_cm.max} cm</p>
    <p><strong>Espacement graines :</strong> ${plant.germination.spacing_between_seeds_cm.min}-${plant.germination.spacing_between_seeds_cm.max} cm</p>
    <p><strong>Graines par alvéole :</strong> ${plant.germination.seeds_per_cell}</p>
    <p><strong>Lumière pendant germination :</strong> ${plant.germination.light_need}</p>
    <p>${plant.germination.step_by_step}</p>

    <!-- TRANSPLANTATION -->
    <h2>🌿 Transplantation</h2>
    <p><strong>Possible :</strong> ${plant.transplant.possible ? "Oui" : "Non"}</p>
    <p>${plant.transplant.possible_conditions}</p>
    <p><strong>Espacement plants :</strong> ${plant.transplant.spacing_between_plants_cm.min}-${plant.transplant.spacing_between_plants_cm.max} cm</p>
    <p><strong>Espacement rangs :</strong> ${plant.transplant.row_spacing_cm.min}-${plant.transplant.row_spacing_cm.max} cm</p>
    <p><strong>Culture en pot :</strong> ${plant.transplant.pot_possible ? "Oui" : "Non"}</p>
    <p>${plant.transplant.pot_description}</p>
    <p><strong>Exposition après repiquage :</strong> ${plant.transplant.light_after_transplant}</p>
    <p>${plant.transplant.transplant_description}</p>

    <!-- EXPOSITION -->
    <h2>☀️ Exposition</h2>
    <p><strong>Type :</strong> ${plant.growing.exposure_type.join(", ")}</p>
    <p><strong>Sensible au-dessus de :</strong> ${plant.growing.heat_sensitive_above_c} °C</p>
    <p>${plant.growing.exposure_description}</p>

    <!-- ARROSAGE -->
    <h2>💧 Arrosage</h2>
    <p>${plant.growing.watering_description}</p>

    <!-- FERTILISATION -->
    <h2>🌿 Fertilisation</h2>
    <p><strong>En pleine terre :</strong> ${plant.growing.fertilization.full_ground}</p>
    <p><strong>En pot :</strong> ${plant.growing.fertilization.pot}</p>

    <!-- ENTRETIEN -->
    <h2>🛠 Entretien</h2>
    <p>${plant.growing.care_description}</p>

    <!-- PROBLEMES -->
    <h3>Problèmes fréquents</h3>

    <p><strong>Pucerons :</strong></p>
    <p><em>Qu’est-ce que c’est :</em> ${plant.growing.common_problems.aphids.what_is_it}</p>
    <p><em>Pourquoi :</em> ${plant.growing.common_problems.aphids.why_it_happens}</p>
    <p><em>Solution :</em> ${plant.growing.common_problems.aphids.solution}</p>

    <p><strong>Oïdium :</strong></p>
    <p><em>Qu’est-ce que c’est :</em> ${plant.growing.common_problems.powdery_mildew.what_is_it}</p>
    <p><em>Pourquoi :</em> ${plant.growing.common_problems.powdery_mildew.why_it_happens}</p>
    <p><em>Solution :</em> ${plant.growing.common_problems.powdery_mildew.solution}</p>

    <p><strong>Feuilles jaunissantes :</strong></p>
    <p><em>Cause :</em> ${plant.growing.common_problems.yellow_leaves.what_is_it}</p>
    <p><em>Pourquoi :</em> ${plant.growing.common_problems.yellow_leaves.why_it_happens}</p>
    <p><em>Action :</em> ${plant.growing.common_problems.yellow_leaves.solution}</p>

    <!-- TIMELINE -->
    <h2>📆 Timeline complète</h2>
    <div class="timeline">
      <p><strong>Semaine 1–2 :</strong> ${plant.timeline_culture.week_1_2}</p>
      <p><strong>Semaine 3–4 :</strong> ${plant.timeline_culture.week_3_4}</p>
      <p><strong>Semaine 5–6 :</strong> ${plant.timeline_culture.week_5_6}</p>
      <p><strong>Semaine 7–8 :</strong> ${plant.timeline_culture.week_7_8}</p>
      <p><strong>Semaine 9–10 :</strong> ${plant.timeline_culture.week_9_10}</p>
      <p><strong>Semaine 11–12 :</strong> ${plant.timeline_culture.week_11_12}</p>
      <p><strong>Semaine 13–14 :</strong> ${plant.timeline_culture.week_13_14}</p>
      <p><strong>Semaine 15–16 :</strong> ${plant.timeline_culture.week_15_16}</p>
      <p><strong>Semaine 17+ :</strong> ${plant.timeline_culture.week_17_plus}</p>
    </div>

    <!-- RECOLTE -->
    <h2>🧺 Récolte</h2>
    <img src="${imagePath}harvest.jpg" alt="Récolte" class="section-image">
    <p>${plant.harvest.description}</p>

    <!-- SEED SAVING -->
    <h2>🌾 Récupération des graines</h2>
    <p><strong>Timing :</strong> ${plant.seed_saving.timing}</p>
    <p>${plant.seed_saving.method}</p>
    <p><strong>Durée de vie :</strong> ${plant.seed_saving.seed_viability_years} ans</p>
  `;
}
