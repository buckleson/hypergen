import { useWorld } from "@hypergen/koota-solid";
import { getRuntimeDocument } from "@hypergen/reconciler";

export function useDocument() {
  const world = useWorld();
  return () => getRuntimeDocument(world);
}
