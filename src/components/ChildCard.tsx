import './ChildCard.css'
import { memo } from 'react';
import FormField from './FormField';
import SelectField from './SelectField';
import type { Child, Gender } from '../types/child'; 

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
};

const ChildCard = memo(function ChildCard({
  child,
  index,
  onChange,
  onRemove,
  disableRemove,
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
                label="Vorname *"
                value={child.vorname}
                onChange={(e) =>
                onChange(child.id, 'vorname', e.target.value)
                }
            />

            <FormField
                label="Nachname *"
                value={child.nachname}
                onChange={(e) =>
                onChange(child.id, 'nachname', e.target.value)
                }
            />

            <FormField
                label="Jahrgang *"
                type="number"
                value={child.jahrgang}
                onChange={(e) =>
                onChange(child.id, 'jahrgang', e.target.value)
                }
            />

            <SelectField
                label="Geschlecht"
                value={child.geschlecht}
                onChange={(value) =>
                    onChange(child.id, 'geschlecht', value)
                }
            />

        </div>

    </article>
  );
});

export default ChildCard;