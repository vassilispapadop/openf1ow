// Design-system primitives. Import tokens.css once (main.tsx).
export { default as Section, type SectionProps, type Method } from "./Section.tsx";
export { default as StatTile, type StatTileProps } from "./StatTile.tsx";
export { default as Segmented, type SegmentedOption } from "./Segmented.tsx";
export { default as Legend, type LegendItem, type LegendProps } from "./Legend.tsx";
export { default as Badge, type BadgeTone } from "./Badge.tsx";
export { default as Disclosure } from "./Disclosure.tsx";
export { default as EmptyState, Pending, Gate, type EmptyKind } from "./EmptyState.tsx";
export { useTooltip, TipTitle, TipRow, type TipAnchor } from "./Tooltip.tsx";
export { default as Table, type Column, type TableProps } from "./Table.tsx";
