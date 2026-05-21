export const TARGET_CLUSTER_NUMBER = 223;
export const TARGET_WELL_NAME = "510";

export function isTargetSocketSelection(
  clusterNumber?: number | null,
  wellName?: string | null,
): boolean {
  return (
    clusterNumber === TARGET_CLUSTER_NUMBER &&
    String(wellName ?? "") === TARGET_WELL_NAME
  );
}
