import { type ToolMode, ToolMode as TM } from "../game.js";

interface ToolbarProps {
  readonly toolMode: ToolMode;
  readonly onSetTool: (mode: ToolMode) => void;
}

const tools: { mode: ToolMode; label: string; key: string }[] = [
  { mode: TM.Station, label: "Station", key: "1" },
  { mode: TM.SignalStation, label: "Signal Station", key: "2" },
  { mode: TM.Route, label: "Route", key: "3" },
];

export function Toolbar({ toolMode, onSetTool }: ToolbarProps): React.JSX.Element {
  return (
    <div className="toolbar">
      {tools.map((t) => (
        <button
          key={t.mode}
          className={toolMode === t.mode ? "active" : ""}
          onClick={() => { onSetTool(t.mode); }}
        >
          {t.label} ({t.key})
        </button>
      ))}
    </div>
  );
}
