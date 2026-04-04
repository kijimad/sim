import { Card, Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { useRef, useState, useEffect, useCallback } from "react";
import type React from "react";

/** 全ウィンドウ共有の z-index カウンター */
let globalZIndex = 100;

function nextZIndex(): number {
  globalZIndex++;
  return globalZIndex;
}

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
  const [zIndex, setZIndex] = useState(nextZIndex);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const bringToFront = (): void => {
    if (zIndex < globalZIndex) {
      setZIndex(nextZIndex());
    }
  };

  const onMouseDown = (e: React.MouseEvent): void => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    bringToFront();
    e.preventDefault();
  };

  const onWindowMouseMove = useCallback((e: MouseEvent): void => {
    if (!dragging.current) return;
    setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
  }, []);

  const onWindowMouseUp = useCallback((): void => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [onWindowMouseMove, onWindowMouseUp]);

  return (
    <div
      className="floating-window"
      style={{
        transform: `translate(${String(pos.x)}px, ${String(pos.y)}px)`,
        width: width !== undefined ? `${String(width)}px` : undefined,
        zIndex,
      }}
      onMouseDown={bringToFront}
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
