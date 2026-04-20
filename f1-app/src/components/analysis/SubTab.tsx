import Pill from "../Pill";
import type { ReactNode } from "react";

export default function SubTab({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return <Pill active={active} onClick={onClick}>{children}</Pill>;
}
