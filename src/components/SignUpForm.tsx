import FormField from './FormField'
import { useState, useCallback } from 'react'
import './SignUpForm.css'
import type { Child } from '../types/child';
import ChildCard from './ChildCard';
import DashedButton from './DashedButton';
import SubmitButton from './SubmitButton';
import ExcelTool from './ExcelTool';
import InformationBanner from './InformationBanner';

function createEmptyChild(): Child {
  return {
    id: crypto.randomUUID(),
    vorname: '',
    nachname: '',
    jahrgang: '',
    geschlecht: 'M',
  };
}

function SignUpForm() {
  const [trainerName, setTrainerName] = useState("");
  const [verein, setVerein] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  
  const [trainerErrors, setTrainerErrors] = useState({
    trainerName: false,
    verein: false,
    email: false,
    phoneNumber: false,
  }); 
  
  type ChildErrors = {
  vorname: boolean;
  nachname: boolean;
  jahrgang: boolean;
  geschlecht: boolean;
  duplicate: boolean;
};

const [childErrors, setChildErrors] = useState<
  Record<string, ChildErrors>
>({});

  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [bannerVariant, setBannerVariant] = useState<'error' | 'info' | 'success'>('success');

  function isNonEmpty(value: string) {
    return value.trim().length > 0;
  }

  function isValidEmail(value: string) {
    return /^\S+@\S+\.\S+$/.test(value);
  }

  function isValidPhoneNumber(value: string): boolean {
    const phone = value.trim();

    // + gefolgt von 7–15 Ziffern, Leerzeichen erlaubt
    const phoneRegex = /^\+\d(?:[\d\s]{6,14}\d)$/;

  return phoneRegex.test(phone);
}

  function isDuplicate(child: Child, allChildren: Child[]): boolean {
    const normalizedVorname = child.vorname.trim().toLowerCase();
    const normalizedNachname = child.nachname.trim().toLowerCase();
    
    if (!normalizedVorname || !normalizedNachname) {
      return false; // Leere Felder sind keine Duplikate
    }
    
    // Zähle, wie viele Children denselben Namen haben (außer dem aktuellen)
    const duplicates = allChildren.filter(c => 
      c.id !== child.id &&
      c.vorname.trim().toLowerCase() === normalizedVorname &&
      c.nachname.trim().toLowerCase() === normalizedNachname
    );
    
    return duplicates.length > 0;
  }

  //Children States and Logic
  const [children, setChildren] = useState<Child[]>([
    createEmptyChild(),
  ]);

  const addChild = () => {
    setChildren(prev => [...prev, createEmptyChild()]);
  };

  const removeChild = (id: string) => {
    setChildren(prev => prev.filter(child => child.id !== id));
  };

  const handleChildChange = useCallback(
  (
    id: string,
    field: keyof Omit<Child, 'id'>,
    value: string
  ) => {
    setChildren(prev => {
      const newChildren = prev.map(child =>
        child.id === id
          ? { ...child, [field]: value }
          : child
      );
      
      // Validate only the changed field, keep other field errors unchanged
      const updatedChild = newChildren.find(c => c.id === id);
      if (updatedChild) {
        setChildErrors(prevErrors => {
          const currentErrors = prevErrors[id] || {
            vorname: false,
            nachname: false,
            jahrgang: false,
            geschlecht: false,
            duplicate: false,
          };
          
          // Only validate the changed field
          const newFieldError = 
            field === 'vorname' ? !isNonEmpty(updatedChild.vorname) :
            field === 'nachname' ? !isNonEmpty(updatedChild.nachname) :
            field === 'jahrgang' ? !/^\d{4}$/.test(updatedChild.jahrgang) :
            field === 'geschlecht' ? updatedChild.geschlecht !== 'M' && updatedChild.geschlecht !== 'W' :
            currentErrors[field as keyof ChildErrors] as boolean;
          
          // Check duplicate if vorname or nachname changed, otherwise keep current duplicate status
          const duplicate = (field === 'vorname' || field === 'nachname') 
            ? isDuplicate(updatedChild, newChildren)
            : currentErrors.duplicate;
          
          return {
            ...prevErrors,
            [id]: {
              ...currentErrors,
              [field]: newFieldError,
              duplicate,
            },
          };
        });
        
        // Also check for duplicates in other children that might now be duplicates
        // (only if vorname or nachname changed)
        if (field === 'vorname' || field === 'nachname') {
          newChildren.forEach(child => {
            if (child.id !== id) {
              setChildErrors(prevErrors => ({
                ...prevErrors,
                [child.id]: {
                  ...(prevErrors[child.id] || {
                    vorname: false,
                    nachname: false,
                    jahrgang: false,
                    geschlecht: false,
                    duplicate: false,
                  }),
                  duplicate: isDuplicate(child, newChildren),
                },
              }));
            }
          });
        }
      }
      
      return newChildren;
    });
  },
  []
);


  function handleSubmit(){
    // Validate all trainer fields
    const trainerValidation = {
      trainerName: !isNonEmpty(trainerName),
      verein: !isNonEmpty(verein),
      email: !isValidEmail(email),
      phoneNumber: !isValidPhoneNumber(phoneNumber),
    };
    setTrainerErrors(trainerValidation);

    // Validate all children
    const newChildErrors: Record<string, ChildErrors> = {};
    children.forEach(child => {
      newChildErrors[child.id] = {
        vorname: !isNonEmpty(child.vorname),
        nachname: !isNonEmpty(child.nachname),
        jahrgang: !/^\d{4}$/.test(child.jahrgang),
        geschlecht: child.geschlecht !== 'M' && child.geschlecht !== 'W',
        duplicate: isDuplicate(child, children),
      };
    });
    setChildErrors(newChildErrors);

    // Check if form is valid
    const hasTrainerErrors = Object.values(trainerValidation).some(err => err);
    const hasChildErrors = Object.values(newChildErrors).some(childErr => 
      Object.values(childErr).some(err => err)
    );

    if (hasTrainerErrors || hasChildErrors) {
      setBannerMessage('Bitte überprüfe alle Felder und korrigiere die Fehler.');
      setBannerVariant('error');
      return; // ❌ ungültig → Fehler werden angezeigt
    }

    // ✅ gültig → absenden
    console.log('Formular gültig, absenden!');
    setBannerMessage('Anmeldung erfolgreich gespeichert!');
    setBannerVariant('success');
  };

  return (
    <>
        <form className="signUpForm">
          {bannerMessage && (
            <InformationBanner 
              message={bannerMessage} 
              variant={bannerVariant}
            />
          )}
          <section>
              <header>
                  <h2>Trainer/in</h2>
              </header>
              
              <div className="input-grid">
                <FormField
                id="trainerName"
                name="trainerName"
                label='Vor/ Nachname *'
                placeholder='Max Mustermann'
                value= {trainerName}
                error={trainerErrors.trainerName}
                onChange={(e) => {
                  const value = e.target.value;
                  setTrainerName(value)
                  setTrainerErrors(prev => ({
                      ...prev,
                      trainerName: !isNonEmpty(value),
                  }));
                }}
                />

                <FormField
                id="verein"
                name="verein"
                label='Verein *'
                placeholder='SC Liestal'
                value= {verein}
                error={trainerErrors.verein}
                onChange={(e) => {
                  const value = e.target.value;
                  setVerein(value)
                  setTrainerErrors(prev => ({
                      ...prev,
                      verein: !isNonEmpty(value),
                  }));
                }}
                />

                <FormField
                id="email"
                name="email"
                label='Email *'
                placeholder='max@scl-athletics.ch'
                value = {email}
                error={trainerErrors.email}
                onChange={(e) => {
                  const value = e.target.value;
                  setEmail(value)
                  setTrainerErrors(prev => ({
                      ...prev,
                      email: !isValidEmail(value),
                  }));
                }}
                />

                <FormField
                id="phoneNumber"
                name="phoneNumber"
                label='Telefonnummer *'
                placeholder='+41 78 882 26 50'
                value={phoneNumber}
                error={trainerErrors.phoneNumber}
                onChange={(e) => {
                  const value = e.target.value;
                  setPhoneNumber(value)
                  setTrainerErrors(prev => ({
                      ...prev,
                      phoneNumber: !isValidPhoneNumber(phoneNumber),
                  }));
                }}
                />
              </div>
          </section>

          <section>
            <header>
              <h2>Athlet/Innen</h2>
            </header>

            <ExcelTool
                onImport={(importedChildren) => {setChildren(importedChildren);}}/>


            {children.map((child, index) => (
              <ChildCard
                key={child.id}
                child={child}
                index={index}
                onChange={handleChildChange}
                onRemove={removeChild}
                disableRemove={children.length === 1}
                errors={childErrors[child.id]}
              />
            ))}

            <div className='add-child-box'>
              <DashedButton
              label="+ füge eine weitere Athlet/in hinzu"
              color="#4C1D95"
              onClick={addChild}
              />
            </div>
            

          </section>

          <section>
            <div className='add-child-box'>
              <SubmitButton
              label="Anmeldung speichern"
              color="#4C1D95"
              onClick={handleSubmit}
              />
            </div>
          </section>


        </form>
    </>
  )
}

export default SignUpForm