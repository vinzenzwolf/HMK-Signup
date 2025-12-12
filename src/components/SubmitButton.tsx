import './SubmitButton.css';

type DashedButtonProps = {
  label: string;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
};

function DashedButton({
  label,
  color = '#2563eb',
  onClick,
  disabled = false,
}: DashedButtonProps) {
  return (
    <button
      type="button"
      className="submit-button"
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