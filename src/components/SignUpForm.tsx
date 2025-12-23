import FormField from './FormField'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './SignUpForm.css'
import type { Child } from '../types/child';
import ChildCard from './ChildCard';
import DashedButton from './DashedButton';
import SubmitButton from './SubmitButton';
import ExcelTool from './ExcelTool';
import InformationBanner from './InformationBanner';
import InvoiceSection from './InvoiceSection';
import { saveRegistration, updateRegistration, loadRegistrationByToken, mapChildToAthlete } from '../lib/database';
import logoSrcUrl from '../assets/SCL_Logo.png';

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
  seasonPaymentDeadline?: string | null
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

function SignUpForm({ initialData, editToken, onSaveSuccess, seasonId, seasonYear, seasonPaymentDeadline }: SignUpFormProps = {}) {
  const isEditMode = !!editToken
  const navigate = useNavigate()
  
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
  const [emailError, setEmailError] = useState(false);
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
  const invoiceDate = useMemo(() => new Date(), [])
  const invoiceDueDate = useMemo(() => {
    if (seasonPaymentDeadline) {
      const d = new Date(seasonPaymentDeadline)
      if (!Number.isNaN(d.getTime())) return d
    }
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date
  }, [seasonPaymentDeadline])
  const [invoiceBillDataUrl, setInvoiceBillDataUrl] = useState<string | null>(null)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)

  // Load logo as data URL for PDF (loads via HTTP, doesn't touch the file)
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    async function loadLogoAsDataUrl() {
      try {
        // Use the imported URL from Vite - this will be a URL like /assets/SCL_Logo-abc123.png
        const response = await fetch(logoSrcUrl)
        if (!response.ok) {
          console.warn('Logo konnte nicht geladen werden:', response.status)
          setLogoDataUrl(null)
          return
        }
        
        const blob = await response.blob()
        
        // Convert blob to data URL using FileReader
        const reader = new FileReader()
        reader.onloadend = () => {
          const dataUrl = reader.result as string
          if (dataUrl && dataUrl.startsWith('data:')) {
            setLogoDataUrl(dataUrl)
          } else {
            setLogoDataUrl(null)
          }
        }
        reader.onerror = () => {
          console.warn('Fehler beim Konvertieren des Logos')
          setLogoDataUrl(null)
        }
        reader.readAsDataURL(blob)
      } catch (err) {
        console.warn('Logo konnte nicht geladen werden:', err)
        setLogoDataUrl(null)
      }
    }
    
    loadLogoAsDataUrl()
  }, [])

  useEffect(() => {
    ;(async () => {
      if (typeof globalThis === 'undefined' || (globalThis as any).Buffer) return
      try {
        const mod = await import('buffer')
        if (mod?.Buffer) {
          ;(globalThis as any).Buffer = mod.Buffer
        }
      } catch (err) {
        console.error('Buffer Polyfill konnte nicht geladen werden:', err)
      }
    })()
  }, [])


  async function svgToPngDataUrl(svg: string): Promise<string | null> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    return new Promise(resolve => {
      try {
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
          const scale = 2 // render at 2x for better quality
          const targetWidth = (img.naturalWidth || 840) * scale
          const targetHeight = (img.naturalHeight || 420) * scale
          const canvas = document.createElement('canvas')
          canvas.width = targetWidth
          canvas.height = targetHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            URL.revokeObjectURL(url)
            resolve(null)
            return
          }
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          resolve(null)
        }
        img.src = url
      } catch (err) {
        console.error('SVG → PNG Konvertierung fehlgeschlagen:', err)
        resolve(null)
      }
    })
  }

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
    ;(async () => {
      try {
        const mod = await import('swissqrbill/svg')
        const SwissQRBill = (mod as any).SwissQRBill || (mod as any).default?.SwissQRBill
        if (!SwissQRBill) return
        const bill = new SwissQRBill(
          {
            currency: 'CHF',
            amount: Math.max(totalCost || 0, 0),
            creditor: {
              account: 'CH0700769016110842422',
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
          { language: 'DE' }
        )
        const svg = bill?.toString?.()
        if (!svg || typeof svg !== 'string') return
        const pngUrl = await svgToPngDataUrl(svg)
        if (pngUrl) setInvoiceBillDataUrl(pngUrl)
      } catch (err) {
        console.error('QR-Bill (Einzahlungsschein) konnte nicht erstellt werden:', err)
      }
    })()
  }, [totalCost, clubLabel])


  function validateChildren(): boolean {
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
    
    // Check if there are any child errors
    const hasChildErrors = Object.values(newChildErrors).some(childErr => 
      Object.values(childErr).some(err => err)
    );
    
    return !hasChildErrors;
  }

  async function saveFormData(skipNavigation = false): Promise<boolean> {
    if (isSubmitting) return false; // Prevent multiple submissions
    
    // Validate all trainer fields
    const trainerValidation = {
      trainerName: !isNonEmpty(trainerName),
      verein: !isNonEmpty(verein),
      email: !isValidEmail(email),
      phoneNumber: !isValidPhoneNumber(phoneNumber),
    };
    setTrainerErrors(trainerValidation);

    // Validate all children
    const isChildrenValid = validateChildren();
    const hasTrainerErrors = Object.values(trainerValidation).some(err => err);

    if (hasTrainerErrors || !isChildrenValid) {
      const allowedLabel = allowedYears ? `Erlaubte Jahrgänge: ${allowedYears.label}` : undefined
      setBannerMessage(
        allowedLabel
          ? `Bitte überprüfe alle Felder und korrigiere die Fehler. ${allowedLabel}`
          : 'Bitte überprüfe alle Felder und korrigiere die Fehler.'
      );
      setBannerVariant('error');
      return false; // ❌ ungültig → Fehler werden angezeigt
    }

    // ✅ gültig → absenden
    setIsSubmitting(true);
    try {
      const athletes = children.map(mapChildToAthlete);

      if (!isEditMode && !seasonId) {
        setBannerMessage('Keine Saison ausgewählt. Bitte erneut laden oder Admin kontaktieren.');
        setBannerVariant('error');
        setIsSubmitting(false);
        return false;
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
        
        setEmailError(false); // Clear email error on success
        if (!skipNavigation) {
          setBannerMessage('Anmeldung erfolgreich aktualisiert!');
          setBannerVariant('success');
          
          if (onSaveSuccess) {
            setTimeout(() => {
              onSaveSuccess();
            }, 2000);
          }
        }
        return true;
      } else {
        const result = await saveRegistration({
          guardian_name: trainerName.trim(),
          club: verein.trim() || null,
          email: email.trim(),
          phone: phoneNumber.trim(),
          athletes,
          season_id: seasonId,
        });
        
        setEmailError(false); // Clear email error on success
        if (!skipNavigation) {
          // Registration is always saved, email sending is optional
          setBannerMessage('Anmeldung erfolgreich gespeichert! Eine E-Mail mit dem Bearbeitungslink wurde versendet. Sie werden nun zur Bearbeitungsseite weitergeleitet...');
          setBannerVariant('success');
          
          // Navigate to edit page with token
          if (result.edit_token && seasonYear) {
            // Redirect after a short delay to show success message
            setTimeout(() => {
              navigate(`/${seasonYear}/edit/${result.edit_token}`);
            }, 1500);
          } else {
            // Fallback: Reset form if navigation is not possible
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
        }
        return true;
      }
    } catch (error) {
      console.error('Error saving registration:', error);
      
      // Check if this is an email error
      const isEmailError = error instanceof Error && (error as any).isEmailError;
      
      if (isEmailError) {
        // Registration was saved, but email failed
        setEmailError(true);
        setTrainerErrors(prev => ({
          ...prev,
          email: true,
        }));
        setBannerMessage(
          'E-Mail konnte nicht versendet werden. Bitte korrigieren Sie die E-Mail-Adresse und versuchen Sie es erneut. Die Anmeldung wurde bereits gespeichert.'
        );
        setBannerVariant('error');
        return false;
      } else {
        // Other errors
        setEmailError(false);
        setBannerMessage(
          error instanceof Error 
            ? `Fehler beim Speichern: ${error.message}`
            : 'Fehler beim Speichern der Anmeldung. Bitte versuche es erneut.'
        );
        setBannerVariant('error');
        return false;
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(){
    await saveFormData(false);
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
                disabled={isEditMode && !emailError}
                onChange={(e) => {
                  const value = e.target.value;
                  setEmail(value)
                  setEmailError(false); // Clear email error when user starts typing
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

          <InvoiceSection
            clubName={verein || 'Verein'}
            trainerName={trainerName || 'Trainer/in'}
            athleteCount={children.length}
            totalAmount={Math.max(totalCost, 0)}
            invoiceDate={invoiceDate}
            dueDate={invoiceDueDate}
            logoSrc={logoDataUrl}
            billDataUrl={invoiceBillDataUrl}
            onDownloadClick={async () => {
              // Validate children first
              const isChildrenValid = validateChildren();
              if (!isChildrenValid) {
                const allowedLabel = allowedYears ? `Erlaubte Jahrgänge: ${allowedYears.label}` : undefined
                setBannerMessage(
                  allowedLabel
                    ? `Bitte überprüfe alle Athleten-Felder und korrigiere die Fehler vor dem Download. ${allowedLabel}`
                    : 'Bitte überprüfe alle Athleten-Felder und korrigiere die Fehler vor dem Download.'
                );
                setBannerVariant('error');
                return false;
              }
              
              // Save form data before allowing download (skip navigation)
              const saved = await saveFormData(true);
              if (saved) {
                setBannerMessage('Formular wurde gespeichert. Rechnung wird heruntergeladen...');
                setBannerVariant('success');
              }
              return saved;
            }}
          />

        </form>
    </>
  )
}

export default SignUpForm