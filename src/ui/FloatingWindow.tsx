import { Card, Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { useRef, useState } from "react";
import type React from "react";

interface FloatingWindowProps {
  readonly title: React.ReactNode;
  readonly children: React.ReactNode;
  readonly onClose: () => void;
  /** 初期表示位置（px） */
  readonly defaultX?: number;
  readonly defaultY?: number;
  readonly width?: number;
}

/** ドラッグ可能なフローティングウィンドウ */
export function FloatingWindow({ title, children, onClose, defaultX, defaultY, width }: FloatingWindowProps) {
  const [pos, setPos] = useState({ x: defaultX ?? 0, y: defaultY ?? 0 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent): void => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!dragging.current) return;
    setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
  };

  const onMouseUp = (): void => {
    dragging.current = false;
  };

  return (
    <div
      className="floating-window"
      style={{
        transform: `translate(${String(pos.x)}px, ${String(pos.y)}px)`,
        width: width !== undefined ? `${String(width)}px` : undefined,
      }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <Card
        size="small"
        title={
          <div onMouseDown={onMouseDown} style={{ cursor: "grab", userSelect: "none" }}>
            {title}
          </div>
        }
        extra={
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        }
        styles={{ body: { padding: "8px 12px", maxHeight: "60vh", overflowY: "auto" } }}
      >
        {children}
      </Card>
    </div>
  );
}
