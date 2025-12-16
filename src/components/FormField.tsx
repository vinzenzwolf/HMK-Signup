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
        className={error ? "input-error" : ''}
      />
    </label>
  );
}

export default FormField