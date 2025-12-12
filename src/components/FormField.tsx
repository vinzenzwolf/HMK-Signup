import './FormField.css'

type FormFieldProps = {
  label: string;
  value?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
};

function FormField({
  label,
  placeholder = "",
  value,
  onChange,
  type = "text",
  required = true,
  error = false,
}: FormFieldProps) {
  return (
    <label className='formField'>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={error ? "input-error" : ''}
      />
    </label>
  );
}

export default FormField