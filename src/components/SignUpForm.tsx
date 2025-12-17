import FormField from './FormField'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import './SignUpForm.css'
import type { Child } from '../types/child';
import ChildCard from './ChildCard';
import DashedButton from './DashedButton';
import SubmitButton from './SubmitButton';
import ExcelTool from './ExcelTool';
import InformationBanner from './InformationBanner';
import { saveRegistration, updateRegistration, loadRegistrationByToken, mapChildToAthlete } from '../lib/database';

type SignUpFormProps = {
  initialData?: {
    registrationId?: string
    trainerName: string
    verein: string
    email: string
    phoneNumber: string
    children: Child[]
  }
  editToken?: string
  seasonId?: string
  seasonYear?: number
  onSaveSuccess?: () => void
}

function createEmptyChild(): Child {
  return {
    id: crypto.randomUUID(),
    vorname: '',
    nachname: '',
    jahrgang: '',
    geschlecht: 'M',
  };
}

function SignUpForm({ initialData, editToken, onSaveSuccess, seasonId, seasonYear }: SignUpFormProps = {}) {
  const isEditMode = !!editToken
  
  const [trainerName, setTrainerName] = useState(initialData?.trainerName || "");
  const [verein, setVerein] = useState(initialData?.verein || "");
  const [email, setEmail] = useState(initialData?.email || "");
  const [phoneNumber, setPhoneNumber] = useState(initialData?.phoneNumber || "");
  
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Kostenberechnung nach Initialisierung der Kinder

  const allowedYears = useMemo(() => {
    if (!seasonYear) return null
    const y = seasonYear
    const currentYear = new Date().getFullYear()
    const minYear = y - 13 // ältester erlaubter Jahrgang
    const maxYear = currentYear - 1 // keine zukünftigen Jahrgänge
    const label = `zwischen ${minYear} und ${maxYear} (jüngere Jahrgänge sind erlaubt)`
    return { minYear, maxYear, label }
  }, [seasonYear])

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
  const [children, setChildren] = useState<Child[]>(
    initialData?.children && initialData.children.length > 0
      ? initialData.children
      : [createEmptyChild()]
  );

  const totalCost = useMemo(() => children.length * 15, [children.length]);
  const clubLabel = useMemo(() => verein.trim() || 'Ihr Verein', [verein]);
  const qrRef = useRef<HTMLDivElement | null>(null)

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

          const yearNum = parseInt(updatedChild.jahrgang, 10)
          const isYearFormatValid = /^\d{4}$/.test(updatedChild.jahrgang)
          const isYearAllowed = allowedYears
            ? yearNum >= allowedYears.minYear && yearNum <= allowedYears.maxYear
            : true
          
          // Only validate the changed field
          const newFieldError = 
            field === 'vorname' ? !isNonEmpty(updatedChild.vorname) :
            field === 'nachname' ? !isNonEmpty(updatedChild.nachname) :
            field === 'jahrgang' ? (!isYearFormatValid || !isYearAllowed) :
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

  useEffect(() => {
    const container = qrRef.current
    if (!container) return
    container.innerHTML = ''
    ;(async () => {
      try {
        const mod = await import('swissqrbill/svg')
        const SwissQRCode = (mod as any).SwissQRCode || (mod as any).default?.SwissQRCode
        if (!SwissQRCode) {
          console.error('SwissQRCode Klasse nicht gefunden.')
          return
        }
        // Use SwissQRCode to render only the QR graphic (no receipt/sections)
        const qr = new SwissQRCode(
          {
            currency: 'CHF',
            amount: Math.max(totalCost || 0, 0),
            creditor: {
              account: 'CH0700769016110842422', // IBAN required by swissqrbill
              name: 'SC Liestal',
              address: 'Leichtathletik',
              zip: '4410',
              city: 'Liestal',
              country: 'CH',
            },
            debtor: {
              name: clubLabel || 'Ihr Verein',
              address: '',
              zip: '',
              city: '',
              country: 'CH',
            },
            reference: '',
            additionalInformation: `Vereinsname: ${clubLabel || 'Ihr Verein'}`,
          },
          60 // size in mm; tweak if needed
        )
        const svg = qr.element || qr.toString?.()
        if (!svg) return
        if (typeof svg === 'string') {
          container.innerHTML = svg
        } else {
          // replaceChildren ensures we never accumulate duplicate SVGs
          container.replaceChildren(svg)
        }
        const svgEl = container.querySelector('svg')
        if (svgEl) {
          const { width, height } = svgEl.getBoundingClientRect()
          console.log('QR SVG size', {
            width: Math.round(width),
            height: Math.round(height),
            viewBox: svgEl.getAttribute('viewBox'),
          })
        }
      } catch (err) {
        console.error('QR-Bill konnte nicht erstellt werden:', err)
      }
    })()
    // Cleanup: clear container to avoid duplicates on re-render/unmount
    return () => {
      if (qrRef.current) {
        qrRef.current.innerHTML = ''
      }
    }
  }, [totalCost, clubLabel])


  async function handleSubmit(){
    if (isSubmitting) return; // Prevent multiple submissions
    
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
      const yearNum = parseInt(child.jahrgang, 10)
      const isYearAllowed = allowedYears
        ? yearNum >= allowedYears.minYear && yearNum <= allowedYears.maxYear
        : true
      newChildErrors[child.id] = {
        vorname: !isNonEmpty(child.vorname),
        nachname: !isNonEmpty(child.nachname),
        jahrgang: !/^\d{4}$/.test(child.jahrgang) || !isYearAllowed,
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
      const allowedLabel = allowedYears ? `Erlaubte Jahrgänge: ${allowedYears.label}` : undefined
      setBannerMessage(
        allowedLabel
          ? `Bitte überprüfe alle Felder und korrigiere die Fehler. ${allowedLabel}`
          : 'Bitte überprüfe alle Felder und korrigiere die Fehler.'
      );
      setBannerVariant('error');
      return; // ❌ ungültig → Fehler werden angezeigt
    }

    // ✅ gültig → absenden
    setIsSubmitting(true);
    try {
      const athletes = children.map(mapChildToAthlete);

      if (!isEditMode && !seasonId) {
        setBannerMessage('Keine Saison ausgewählt. Bitte erneut laden oder Admin kontaktieren.');
        setBannerVariant('error');
        setIsSubmitting(false);
        return;
      }
      
      if (isEditMode && editToken) {
        // Prefer the ID passed from the edit page to avoid accidental re-creates
        const registrationId = initialData?.registrationId 
          ?? (await loadRegistrationByToken(editToken))?.id;

        if (!registrationId) {
          throw new Error('Anmeldung nicht gefunden. Bitte öffne den Bearbeitungslink erneut.');
        }
        
        await updateRegistration(registrationId, {
          guardian_name: trainerName.trim(),
          club: verein.trim() || null,
          email: email.trim(),
          phone: phoneNumber.trim(),
          athletes,
          season_id: seasonId,
        });
        
        setBannerMessage('Anmeldung erfolgreich aktualisiert!');
        setBannerVariant('success');
        
        if (onSaveSuccess) {
          setTimeout(() => {
            onSaveSuccess();
          }, 2000);
        }
      } else {
        await saveRegistration({
          guardian_name: trainerName.trim(),
          club: verein.trim() || null,
          email: email.trim(),
          phone: phoneNumber.trim(),
          athletes,
          season_id: seasonId,
        });
        
        // Registration is always saved, email sending is optional
        setBannerMessage('Anmeldung erfolgreich gespeichert! Eine E-Mail mit dem Bearbeitungslink wurde versendet.');
        setBannerVariant('success');
        
        // Reset form after successful submission
        setTrainerName('');
        setVerein('');
        setEmail('');
        setPhoneNumber('');
        setChildren([createEmptyChild()]);
        setChildErrors({});
        setTrainerErrors({
          trainerName: false,
          verein: false,
          email: false,
          phoneNumber: false,
        });
      }
    } catch (error) {
      console.error('Error saving registration:', error);
      setBannerMessage(
        error instanceof Error 
          ? `Fehler beim Speichern: ${error.message}`
          : 'Fehler beim Speichern der Anmeldung. Bitte versuche es erneut.'
      );
      setBannerVariant('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
        <form className="signUpForm">
          {isEditMode && (
            <InformationBanner 
              message="Sie bearbeiten Ihre Anmeldung. Bitte speichern Sie Ihre Änderungen." 
              variant="info"
            />
          )}
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
                disabled={isEditMode}
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
                disabled={isEditMode}
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
                disabled={isEditMode}
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
                disabled={isEditMode}
                onChange={(e) => {
                  const value = e.target.value;
                  setPhoneNumber(value)
                  setTrainerErrors(prev => ({
                      ...prev,
                      phoneNumber: !isValidPhoneNumber(value),
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
              label={isSubmitting ? "Wird gespeichert..." : "Anmeldung speichern"}
              color="#4C1D95"
              onClick={handleSubmit}
              disabled={isSubmitting}
              />
            </div>
          </section>

          <section>
            <header>
              <h2>Zahlungsbedingungen</h2>
            </header>
            <div className="payment-row">
              <div className="payment-box">
                <p><strong>Gesamtbetrag:</strong> CHF {totalCost}.– (15 CHF pro Athlet/in)</p>
                <p><strong>Einzahlung:</strong> Basellandschaftliche Kantonalbank, PC 40-44-0</p>
                <p><strong>Zugunsten von:</strong> CH07 0076 9016 1108 4242 2</p>
                <p><strong>Begünstigter:</strong> SC Liestal, Leichtathletik, 4410</p>
                <p><strong>Vermerk:</strong> Vereinsname: {clubLabel}</p>
              </div>
              <div className="qr-box">
                <div ref={qrRef} id="qr-container" />
              </div>
            </div>
          </section>


        </form>
    </>
  )
}

export default SignUpForm