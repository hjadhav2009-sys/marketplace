export function workChangeMatchesCard(
  card: { groupKey: string; memberTaskIds: readonly string[] },
  detail: { groupKey: string | null; entityId: string | null },
) {
  if (detail.groupKey === card.groupKey) return true;
  return detail.groupKey === null && detail.entityId !== null && card.memberTaskIds.includes(detail.entityId);
}
