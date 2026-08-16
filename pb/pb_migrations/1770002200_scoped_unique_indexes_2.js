/// <reference path="../pb_data/types.d.ts" />

// Los dos índices únicos que se quedaron fuera de 1770001500.
//
// Con el aislamiento por dueño (1770001300) todo lo demás pasó a ser por
// cuenta, pero estos dos siguieron siendo únicos a nivel de tabla, y eso los
// convierte en una regla entre cuentas distintas:
//
//   - `daily(date)`: solo **una** cuenta en toda la instalación podía anotar el
//     sueño y la energía de un día dado. La segunda persona que abriera Ritmo
//     veía cómo su registro no se guardaba, sin explicación posible: el día ya
//     estaba tomado por alguien cuyos datos no puede ver.
//
//   - `projects(code)`: dos personas no podían usar el mismo código de
//     proyecto. "EST-01" es exactamente la clase de código que dos oficinas
//     distintas eligen igual.
//
// Se descubrió sembrando los datos de ejemplo: al segundo usuario le fallaban
// en silencio los proyectos y los diez días de ritmo.

const FIX = [
  {
    collection: "daily",
    drop: "idx_daily_date",
    create: "CREATE UNIQUE INDEX `idx_daily_owner_date` ON `daily` (`owner`, `date`)",
    old: "CREATE UNIQUE INDEX `idx_daily_date` ON `daily` (`date`)",
  },
  {
    collection: "projects",
    drop: "idx_projects_code",
    create:
      "CREATE UNIQUE INDEX `idx_projects_owner_code` ON `projects` (`owner`, `code`) WHERE `code` != ''",
    old: "CREATE UNIQUE INDEX `idx_projects_code` ON `projects` (`code`) WHERE `code` != ''",
  },
];

function replaceIndex(app, spec, revert) {
  const col = app.findCollectionByNameOrId(spec.collection);
  const dropName = revert ? spec.create.match(/INDEX `?([^`\s(]+)`?/)[1] : spec.drop;

  const keep = [];
  for (const idx of col.indexes) {
    if (idx.indexOf(dropName) === -1) keep.push(idx);
  }
  keep.push(revert ? spec.old : spec.create);

  col.indexes = keep;
  app.save(col);
}

migrate(
  (app) => {
    for (const spec of FIX) replaceIndex(app, spec, false);
  },
  (app) => {
    for (const spec of FIX) replaceIndex(app, spec, true);
  }
);
