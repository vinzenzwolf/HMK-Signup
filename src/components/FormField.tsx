import './FormField.css'

type FormFieldProps = {
  id: string;
  name: string;
  label: string;
  value?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
  min?: number | string;
  max?: number | string;
};

function FormField({
  id,
  name,
  label,
  placeholder = "",
  value,
  onChange,
  type = "text",
  required = true,
  error = false,
  disabled = false,
  min,
  max,
}: FormFieldProps) {
  return (
    <label className='formField'>
      <span>{label}</span>
      <input
        id = {id}
        name = {name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className={error ? "input-error" : ''}
      />
    </label>
  );
}

export default FormField