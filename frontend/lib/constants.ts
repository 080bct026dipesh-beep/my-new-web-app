// Route-leg palette, shared between components/BusMap.tsx (polylines on
// the map) and app/page.tsx (the matching sidebar legend). Previously
// defined independently in both files with a "kept in sync" comment --
// nothing enforced that, so a future palette change in one place could
// silently desync from the other. Import from here instead of
// redefining.
export const LEG_COLORS = ["#3DDC97", "#F2A93B", "#5DA9E9", "#E06C75"];
