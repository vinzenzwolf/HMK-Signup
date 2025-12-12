import './FormField.css';
import type { Gender } from '../types/child';

type SelectFieldProps = {
  label: string;
  value: Gender;
  onChange: (value: Gender) => void;
  required?: boolean;
  error?: boolean;
};

function SelectField({
  label,
  value,
  onChange,
  required = false,
  error = false,
}: SelectFieldProps) {
  return (
    <label className="formField">
      <span>{label}</span>
      <select
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value as Gender)}
        className={error ? 'input-error' : ''}
      >
        <option value="M">Männlich</option>
        <option value="W">Weiblich</option>
      </select>
    </label>
  );
}

export default SelectField;