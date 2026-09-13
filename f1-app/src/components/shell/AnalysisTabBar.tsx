// The sticky bar every analysis page shares: the five tabs, the current
// driver selection as removable chips (so no filter is ever hidden), and the
// page's actions (export). Race, qualifying and practice all render it.

import type { ReactNode } from "react";
import StickyTabBar from "./StickyTabBar";
import Pill from "../Pill";
import { Segmented } from "../../ui";
import { ANALYSIS_VIEWS, type ViewKey } from "../../lib/constants";
import { useSelection } from "../../contexts/SelectionContext";
import { useSessionModel } from "../../lib/useSessionModel";

export default function AnalysisTabBar({ value, onChange, actions }: {
  value: ViewKey;
  onChange: (tab: ViewKey) => void;
  actions?: ReactNode;
}) {
  const sel = useSelection();
  const { model } = useSessionModel();
  return (
    <StickyTabBar>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Segmented
          ariaLabel="Analysis view"
          options={ANALYSIS_VIEWS.map(v => ({ key: v.key, label: v.label }))}
          value={value}
          onChange={onChange}
        />
        {sel.selected.size > 0 && model && (
          <div style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }} aria-label="Selected drivers">
            {[...sel.selected].map(dn => {
              const d = model.byDriver[dn];
              return d ? (
                <Pill key={dn} size="sm" active onClick={() => sel.toggle(dn)} title="Remove from selection">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#" + (d.driver.team_colour || "666") }} />
                  {d.driver.name_acronym} ×
                </Pill>
              ) : null;
            })}
            <Pill size="sm" onClick={sel.clear} title="Clear selection">clear</Pill>
          </div>
        )}
        {actions}
      </div>
    </StickyTabBar>
  );
}
