import './ChildCard.css'
import { memo } from 'react';
import FormField from './FormField';
import SelectField from './SelectField';
import type { Child } from '../types/child'; 

type ChildErrors = {
  vorname: boolean;
  nachname: boolean;
  jahrgang: boolean;
  geschlecht: boolean;
  duplicate: boolean;
};

type ChildCardProps = {
  child: Child;
  index: number;
  onChange: (
    id: string,
    field: keyof Omit<Child, 'id'>,
    value: string
  ) => void;
  onRemove: (id: string) => void;
  disableRemove: boolean;
  errors?: ChildErrors;
};

const ChildCard = memo(function ChildCard({
  child,
  index,
  onChange,
  onRemove,
  disableRemove,
  errors,
}: ChildCardProps) {
    return (
    <article className="child-card">
        <div className="child-card-header">
            <strong>
            {child.vorname || child.nachname
                ? `${child.vorname} ${child.nachname}`.trim()
                : `Athlet/in ${index + 1}`}
            </strong>

            <button
            className='remove-button'
            type="button"
            onClick={() => onRemove(child.id)}
            disabled={disableRemove}
            >
            Entfernen
            </button>
        </div>

        <div className="child-input-grid">
            <FormField
                id = {"child" + index.toString()+ "surname"}
                name = "surname"
                label="Vorname *"
                value={child.vorname}
                error={errors?.vorname || errors?.duplicate}
                onChange={(e) =>
                onChange(child.id, 'vorname', e.target.value)
                }
            />

            <FormField
                id = {"child" + index.toString()+ "lastname"}
                name = "lastname"
                label="Nachname *"
                value={child.nachname}
                error={errors?.nachname || errors?.duplicate}
                onChange={(e) =>
                onChange(child.id, 'nachname', e.target.value)
                }
            />

            <FormField
                id = {"child" + index.toString()+ "age"}
                name = "age"
                label="Jahrgang *"
                type="number"
                value={child.jahrgang}
                error={errors?.jahrgang}
                max={new Date().getFullYear() - 1}
                onChange={(e) =>
                onChange(child.id, 'jahrgang', e.target.value)
                }
            />

            <SelectField
                id = {"child" + index.toString()+ "gender"}
                name = "gender"
                label="Geschlecht *"
                value={child.geschlecht}
                error={errors?.geschlecht}
                onChange={(value) =>
                    onChange(child.id, 'geschlecht', value)
                }
            />

        </div>
        
        {errors?.duplicate && (
          <div style={{ 
            color: '#dc2626', 
            fontSize: '0.875rem', 
            marginTop: '0.5rem',
            fontWeight: 500
          }}>
            ⚠️ Dieser Name existiert bereits bei einem anderen Athleten/ einer anderen Athletin.
          </div>
        )}

    </article>
  );
});

export default ChildCard;