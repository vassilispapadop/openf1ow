// Typed data table: sortable columns, sticky header, per-column hiding by
// container width, row highlight for selection. Numeric columns get the
// mono face and tabular figures.

import { useMemo, useState, type ReactNode } from "react";
import s from "./Table.module.css";

export interface Column<Row> {
  key: string;
  label: ReactNode;
  render: (row: Row, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  width?: number | string;
  /** Hide when the table's container is narrower than this. */
  hideBelow?: 480 | 640 | 900;
  sort?: (a: Row, b: Row) => number;
  title?: string;
}

export interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  maxHeight?: number | string;
  compact?: boolean;
  highlightKey?: string | number | null;
  dimOthers?: boolean;
  onRowClick?: (row: Row) => void;
  onRowHover?: (row: Row | null) => void;
  rowStyle?: (row: Row, index: number) => React.CSSProperties | undefined;
  caption?: string;
  className?: string;
}

const HIDE: Record<480 | 640 | 900, string> = { 480: s.hide480, 640: s.hide640, 900: s.hide900 };

export default function Table<Row>({
  columns, rows, rowKey, defaultSort, maxHeight, compact, highlightKey, dimOthers, onRowClick, onRowHover, rowStyle, caption, className,
}: TableProps<Row>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.sort) return rows;
    const copy = [...rows].sort(col.sort);
    return sort.dir === "desc" ? copy.reverse() : copy;
  }, [rows, sort, columns]);

  const toggleSort = (c: Column<Row>) => {
    if (!c.sort) return;
    setSort(prev => (prev?.key === c.key ? { key: c.key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }));
  };

  const alignCls = (c: Column<Row>) => (c.align === "right" ? s.right : c.align === "center" ? s.center : "");

  return (
    <div className={[s.wrap, className].filter(Boolean).join(" ")} style={maxHeight ? { maxHeight } : undefined}>
      <table className={`${s.table} ${compact ? s.compact : ""}`}>
        {caption && <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{caption}</caption>}
        <thead>
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                className={[s.th, alignCls(c), c.sort && s.sortable, c.hideBelow && HIDE[c.hideBelow]].filter(Boolean).join(" ")}
                style={c.width ? { width: c.width } : undefined}
                onClick={() => toggleSort(c)}
                aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                title={c.title}
                scope="col"
              >
                {c.label}
                {c.sort && <span className={s.sortIcon} aria-hidden="true">{sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const k = rowKey(row);
            const hl = highlightKey != null && k === highlightKey;
            return (
              <tr
                key={k}
                className={[s.tr, onRowClick && s.clickable, hl && s.highlight, dimOthers && highlightKey != null && !hl && s.dim].filter(Boolean).join(" ")}
                style={rowStyle?.(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
                onMouseLeave={onRowHover ? () => onRowHover(null) : undefined}
              >
                {columns.map(c => (
                  <td key={c.key} className={[s.td, alignCls(c), c.mono && s.mono, c.hideBelow && HIDE[c.hideBelow]].filter(Boolean).join(" ")}>
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
