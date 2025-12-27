import './SubmitButton.css';

type SubmitButtonProps = {
  label: string;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
};

function SubmitButton({
  label,
  color = '#2563eb',
  onClick,
  disabled = false,
}: SubmitButtonProps) {
  return (
    <button
      type="button" // 🔥 WICHTIG: verhindert Form-Submit & Page-Reload
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

export default SubmitButton;