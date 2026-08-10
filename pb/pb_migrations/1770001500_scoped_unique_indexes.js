/// <reference path="../pb_data/types.d.ts" />

// Los índices únicos tienen que incluir al dueño.
//
// `taxonomy(group, value)` y `accounts(name)` eran únicos a nivel de tabla, lo
// correcto mientras el catálogo era uno solo. Con el catálogo por cuenta
// (1770001400) esa unicidad pasa a ser global entre cuentas distintas: la
// segunda cuenta no puede tener su propia "Cuenta corriente" ni su propio
// `project_kind/structural` porque ya existen los de la primera.
//
// Se ve como una siembra a medias: la cuenta nueva queda sin taxonomía y sin
// cuentas contables, y en el log aparece "Value must be unique".

const FIX = [
  {
    collection: "taxonomy",
    drop: "idx_taxonomy_group_value",
    create:
      "CREATE UNIQUE INDEX `idx_taxonomy_owner_group_value` ON `taxonomy` (`owner`, `group`, `value`)",
  },
  {
    collection: "accounts",
    drop: "idx_accounts_name",
    create:
      "CREATE UNIQUE INDEX `idx_accounts_owner_name` ON `accounts` (`owner`, `name`)",
  },
];

function replaceIndex(app, spec, revert) {
  const col = app.findCollectionByNameOrId(spec.collection);
  const keep = [];
  for (const idx of col.indexes) {
    const drop = revert ? spec.create.match(/INDEX `?([^`\s(]+)`?/)[1] : spec.drop;
    if (idx.indexOf(drop) === -1) keep.push(idx);
  }
  keep.push(revert ? rebuildOld(spec) : spec.create);
  col.indexes = keep;
  app.save(col);
}

function rebuildOld(spec) {
  return spec.collection === "taxonomy"
    ? "CREATE UNIQUE INDEX `idx_taxonomy_group_value` ON `taxonomy` (`group`, `value`)"
    : "CREATE UNIQUE INDEX `idx_accounts_name` ON `accounts` (`name`)";
}

migrate(
  (app) => {
    for (const spec of FIX) replaceIndex(app, spec, false);
  },
  (app) => {
    for (const spec of FIX) replaceIndex(app, spec, true);
  }
);
