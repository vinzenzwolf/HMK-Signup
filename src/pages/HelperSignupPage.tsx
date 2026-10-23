import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FormField from '../components/FormField'
import InformationBanner from '../components/InformationBanner'
import SubmitButton from '../components/SubmitButton'
import Tag from '../components/Tag'
import { loadActiveSeason, loadSeasonByYear, type Season } from '../lib/database'
import {
  loadHelperForm,
  saveHelperSignup,
  type HelperAvailability,
  type HelperForm,
  type HelperInterest,
  type HelperSignupData,
} from '../lib/helpers'
import '../components/SignUpForm.css'
import './SignupPage.css'
import './HelperSignupPage.css'

const EMPTY_FORM: HelperSignupData = {
  availability: 'ganzer_tag',
  interests: [],
  first_name: '',
  last_name: '',
  mobile: '',
  email: '',
}

const REQUIRED_FIELDS = ['first_name', 'last_name', 'mobile', 'email'] as const
type RequiredField = (typeof REQUIRED_FIELDS)[number]

function formatEventDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('de-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function HelperSignupPage() {
  const { year } = useParams<{ year: string }>()
  const navigate = useNavigate()
  const [season, setSeason] = useState<Season | null>(null)
  const [helperForm, setHelperForm] = useState<HelperForm | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<HelperSignupData>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Set<RequiredField>>(new Set())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ emailSent: boolean } | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const seasonData = year ? await loadSeasonByYear(Number(year)) : await loadActiveSeason()
        if (!seasonData) {
          setLoadError('Wettkampf nicht gefunden. Bitte überprüfen Sie den Link.')
          return
        }
        if (!year) {
          navigate(`/${seasonData.year}/helfer`, { replace: true })
          return
        }
        setSeason(seasonData)
        setHelperForm(await loadHelperForm(seasonData.id))
      } catch (err) {
        console.error('Error loading helper form:', err)
        setLoadError('Fehler beim Laden des Formulars. Bitte versuchen Sie es erneut.')
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [year, navigate])

  function updateField(field: keyof HelperSignupData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors.has(field as RequiredField)) {
      setFieldErrors((prev) => {
        const next = new Set(prev)
        next.delete(field as RequiredField)
        return next
      })
    }
  }

  function toggleInterest(interest: HelperInterest) {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }))
  }

  async function handleSubmit() {
    if (!season) return
    const errors = new Set<RequiredField>(REQUIRED_FIELDS.filter((field) => !form[field].trim()))
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.add('email')
    setFieldErrors(errors)
    if (errors.size > 0) {
      setSubmitError('Bitte alle Pflichtfelder korrekt ausfüllen.')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      setSubmitted(await saveHelperSignup(season.id, form))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Anmeldung konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Lade Formular...</p>
      </div>
    )
  }

  const availabilityOptions: Array<{ value: HelperAvailability; label: string; bold?: boolean }> = [
    { value: 'ganzer_tag', label: 'Ganzer Tag', bold: true },
    { value: 'vormittag', label: helperForm?.morning_label ?? 'Vormittag' },
    { value: 'nachmittag', label: helperForm?.afternoon_label ?? 'Nachmittag' },
  ]

  return (
    <>
      <div className="title">
        <Tag>{season ? String(season.year) : '----'}</Tag>
        <h1>Anmeldung Helfer</h1>
        <p>{season ? `Hallenmehrkampf vom ${formatEventDate(season.event_date)}` : 'SCL Hallenmehrkampf'}</p>
      </div>

      <div className="form">
        {loadError ? (
          <InformationBanner message={loadError} variant="error" />
        ) : !helperForm || !helperForm.is_open ? (
          <InformationBanner message="Die Helferanmeldung für diesen Wettkampf ist zurzeit nicht geöffnet." variant="info" />
        ) : submitted ? (
          <div className="signUpForm helper-form helper-success">
            <div className="helper-success-icon">✓</div>
            <h2>Vielen Dank für Ihre Anmeldung!</h2>
            <p>
              {submitted.emailSent
                ? `Wir haben Ihnen eine Bestätigung an ${form.email} gesendet.`
                : 'Ihre Anmeldung ist bei uns eingegangen. Die Bestätigungsmail konnte leider nicht versendet werden.'}
            </p>
            <p>
              Die genaue Einteilung erhalten Sie vor dem Wettkampf.
              {helperForm.contact_email && (
                <>
                  {' '}Bei Fragen: <a href={`mailto:${helperForm.contact_email}`}>{helperForm.contact_email}</a>
                </>
              )}
            </p>
          </div>
        ) : (
          <form className="signUpForm helper-form" onSubmit={(event) => event.preventDefault()}>
            {helperForm.note && <p className="helper-note">{helperForm.note}</p>}

            <section>
              <h2>Ich kann helfen</h2>
              <div className="helper-options">
                {availabilityOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`helper-option${form.availability === option.value ? ' helper-option-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="availability"
                      value={option.value}
                      checked={form.availability === option.value}
                      onChange={() => setForm((prev) => ({ ...prev, availability: option.value }))}
                    />
                    <span className={option.bold ? 'helper-option-bold' : undefined}>{option.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h2>Ich bin interessiert an der Arbeit</h2>
              <p className="helper-hint">Der Wunsch kann nicht immer berücksichtigt werden.</p>
              <div className="helper-options">
                <label className={`helper-option${form.interests.includes('wirtschaft') ? ' helper-option-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.interests.includes('wirtschaft')}
                    onChange={() => toggleInterest('wirtschaft')}
                  />
                  <span>
                    In der Wirtschaft
                    <small>In der Wirtschaft werden Helfer, die den ganzen Tag helfen, bevorzugt.</small>
                  </span>
                </label>
                <label className={`helper-option${form.interests.includes('anlagen') ? ' helper-option-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.interests.includes('anlagen')}
                    onChange={() => toggleInterest('anlagen')}
                  />
                  <span>Bei den Wettkampf-Anlagen</span>
                </label>
              </div>
            </section>

            <section>
              <h2>Kontaktangaben</h2>
              <div className="input-grid">
                <FormField id="helper-first-name" name="first_name" label="Vorname" value={form.first_name}
                  onChange={(e) => updateField('first_name', e.target.value)} error={fieldErrors.has('first_name')} />
                <FormField id="helper-last-name" name="last_name" label="Name" value={form.last_name}
                  onChange={(e) => updateField('last_name', e.target.value)} error={fieldErrors.has('last_name')} />
                <FormField id="helper-mobile" name="mobile" label="Natel" type="tel" value={form.mobile}
                  onChange={(e) => updateField('mobile', e.target.value)} error={fieldErrors.has('mobile')} />
                <FormField id="helper-email" name="email" label="E-Mail" type="email" value={form.email}
                  onChange={(e) => updateField('email', e.target.value)} error={fieldErrors.has('email')} />
              </div>
            </section>

            <section>
              {submitError && (
                <div className="helper-submit-error">
                  <InformationBanner message={submitError} variant="error" />
                </div>
              )}
              <div className="helper-submit">
                <SubmitButton
                  label={isSubmitting ? 'Wird gesendet…' : 'Als Helfer anmelden'}
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                />
              </div>
            </section>
          </form>
        )}
      </div>
    </>
  )
}

export default HelperSignupPage
