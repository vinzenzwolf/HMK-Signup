import './DashedButton.css';
import type { ButtonHTMLAttributes } from 'react';

type DashedButtonProps = {
  label: string;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

function DashedButton({
  label,
  color = '#2563eb',
  type = 'button',
  onClick,
  disabled = false,
}: DashedButtonProps) {
  return (
    <button
      type={type}
      className="dashed-button"
      onClick={onClick}
      disabled={disabled}
      style={
        {
          '--btn-color': color,
        } as React.CSSProperties
      }
    >
      {label}
    </button>
  );
}

export default DashedButton;