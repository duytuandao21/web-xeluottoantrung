export type Branch = { id: string; regionId?: string | null; name: string; address: string };
export type Region = { id: string; name: string };

export function groupShowrooms(branches: Branch[], regions: Region[]) {
  const groups = regions.map(region => ({ region: region.name,
    locations: branches.filter(branch => branch.regionId === region.id).map(branch => ({ name: branch.name, address: branch.address })) }))
    .filter(group => group.locations.length > 0);
  // Keep legacy unassigned branches visible, without guessing their region.
  // Branches assigned to a hidden region must not reappear in this group.
  const unassigned = branches.filter(branch => !branch.regionId);
  if (unassigned.length) groups.push({ region: 'Showroom khác',
    locations: unassigned.map(branch => ({ name: branch.name, address: branch.address })) });
  return groups;
}
