import catalogSource from "./builtin-routines.json";
import { parseRoutineCatalogValue } from "../domain/routines/catalog";

/**
 * The bundled catalog is both the runtime fallback and the only source used to
 * produce the public dist/routines.json release artifact.
 */
export const FCX_BUILTIN_ROUTINE_CATALOG = parseRoutineCatalogValue(catalogSource);

export const FCX_BUILTIN_ROUTINE_SNAPSHOT_VERSION =
  FCX_BUILTIN_ROUTINE_CATALOG.catalogVersion;

export const FCX_BUILTIN_ROUTINE_CAPTURED_AT =
  FCX_BUILTIN_ROUTINE_CATALOG.publishedAt.slice(0, 10);

export const builtinRoutines = Object.freeze(
  FCX_BUILTIN_ROUTINE_CATALOG.routines,
);
