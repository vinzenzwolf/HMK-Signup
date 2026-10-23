import { useCallback, useEffect, useState } from 'react'
import InformationBanner from '../components/InformationBanner'
import { listSeasons, type Season } from '../lib/database'
import {
  INTEREST_LABELS,
  availabilityLabel,
  createHelperForm,
  deleteHelperSignup,
  helperSignupLink,
  loadHelperForm,
  loadHelperSignups,
  updateHelperForm,
  type HelperForm,
  type HelperSignup,
} from '../lib/helpers'
import * as XLSX from 'xlsx'
import './AdminHelfer.css'

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })

function AdminHelfer() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [helperForm, setHelperForm] = useState<HelperForm | null>(null)
  const [signups, setSignups] = useState<HelperSignup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [settings, setSettings] = useState({ morning_label: '', afternoon_label: '', note: '', contact_email: '' })
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const applySettings = (form: HelperForm) =>
    setSettings({
      morning_label: form.morning_label,
      afternoon_label: form.afternoon_label,
      note: form.note,
      contact_email: form.contact_email ?? '',
    })

  const season = seasons.find((s) => s.id === seasonId) ?? null
  const link = season ? helperSignupLink(season.year) : ''

  useEffect(() => {
    listSeasons()
      .then((data) => {
        setSeasons(data)
        const preferred = data.find((s) => s.is_active) ?? data[0]
        setSeasonId(preferred?.id ?? null)
        if (!preferred) setIsLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Saisons konnten nicht geladen werden.')
        setIsLoading(false)
      })
  }, [])

  const loadSeasonData = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const [form, helperSignups] = await Promise.all([loadHelperForm(id), loadHelperSignups(id)])
      setHelperForm(form)
      setSignups(helperSignups)
      if (form) applySettings(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Daten konnten nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!seasonId) return
    loadSeasonData(seasonId)
  }, [seasonId, loadSeasonData])

  const filteredSignups = signups.filter((signup) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    return [signup.first_name, signup.last_name, signup.email, signup.mobile]
      .some((value) => value?.toLowerCase().includes(query))
  })

  function showSuccess(message: string) {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(null), 4000)
  }

  async function handleCreateForm() {
    if (!seasonId) return
    try {
      const form = await createHelperForm(seasonId)
      setHelperForm(form)
      applySettings(form)
      showSuccess('Helferanmeldung erstellt. Passe die Angaben an und öffne sie, sobald sie bereit ist.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen.')
    }
  }

  async function handleToggleOpen() {
    if (!seasonId || !helperForm) return
    try {
      setHelperForm(await updateHelperForm(seasonId, { is_open: !helperForm.is_open }))
      showSuccess(helperForm.is_open ? 'Helferanmeldung geschlossen.' : 'Helferanmeldung ist jetzt geöffnet.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern.')
    }
  }

  async function handleSaveSettings() {
    if (!seasonId) return
    const contactEmail = settings.contact_email.trim()
    if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      setError('Bitte eine gültige Kontakt-E-Mail eingeben.')
      return
    }
    setIsSavingSettings(true)
    try {
      setHelperForm(
        await updateHelperForm(seasonId, {
          morning_label: settings.morning_label.trim(),
          afternoon_label: settings.afternoon_label.trim(),
          note: settings.note.trim(),
          contact_email: contactEmail || null,
        })
      )
      showSuccess('Einstellungen gespeichert.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern.')
    } finally {
      setIsSavingSettings(false)
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      setError('Link konnte nicht kopiert werden.')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteHelperSignup(id)
      setSignups((prev) => prev.filter((s) => s.id !== id))
      setConfirmDeleteId(null)
      showSuccess('Helferanmeldung gelöscht.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen.')
    }
  }

  // Öffnet das lokale E-Mail-Programm; Helfer im BCC, damit sie ihre Adressen nicht gegenseitig sehen
  function emailAllHelpers() {
    const emails = Array.from(new Set(signups.map((s) => s.email.trim().toLowerCase())))
    const to = helperForm?.contact_email ?? ''
    const subject = encodeURIComponent(`Hallenmehrkampf ${season?.year ?? ''}`.trim())
    window.location.href = `mailto:${to}?bcc=${emails.join(',')}&subject=${subject}`
  }

  function exportExcel() {
    const rows = signups.map((s) => ({
      Vorname: s.first_name,
      Name: s.last_name,
      Einsatz: availabilityLabel(s.availability, helperForm),
      Wirtschaft: s.interests.includes('wirtschaft') ? 'ja' : '',
      'Wettkampf-Anlagen': s.interests.includes('anlagen') ? 'ja' : '',
      Natel: s.mobile,
      'E-Mail': s.email,
      'Angemeldet am': formatDate(s.created_at),
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    sheet['!cols'] = [16, 16, 34, 11, 18, 16, 30, 14].map((wch) => ({ wch }))
    sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1' }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Helfer')
    XLSX.writeFile(workbook, `helfer_${season?.year ?? ''}.xlsx`)
  }

  return (
    <div className="form">
      <div className="admin-container">
        {error && (
          <div className="admin-banner-wrapper">
            <InformationBanner message={error} variant="error" />
          </div>
        )}
        {successMessage && (
          <div className="admin-banner-wrapper">
            <InformationBanner message={successMessage} variant="success" />
          </div>
        )}

        <div className="admin-section helfer-season-select">
          <label className="admin-label" htmlFor="helfer-season">Wettkampf</label>
          <select
            id="helfer-season"
            className="admin-input admin-select"
            value={seasonId ?? ''}
            onChange={(event) => setSeasonId(event.target.value)}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.event_number}. Hallenmehrkampf {s.year} – {formatDate(s.event_date)}
                {s.is_active ? ' (aktiv)' : ''}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p>Lade Helferdaten…</p>
        ) : !season ? (
          <p>Noch keine Saison vorhanden. Lege zuerst unter «Anmeldungen» eine Saison an.</p>
        ) : !helperForm ? (
          <div className="helfer-empty-state">
            <h2 className="admin-section-title" style={{ marginBottom: '0.75rem' }}>
              Noch keine Helferanmeldung für {season.year}
            </h2>
            <p>Erstelle das Formular, passe die Einsatzzeiten an und verschicke danach den Link.</p>
            <button className="admin-refresh-button" onClick={handleCreateForm}>
              Helferanmeldung erstellen
            </button>
          </div>
        ) : (
          <>
            {/* Formular & Link */}
            <div className="admin-section">
              <div className="helfer-form-header">
                <h2 className="admin-section-title" style={{ margin: 0 }}>Formular</h2>
                <span className={`helfer-status ${helperForm.is_open ? 'helfer-status-open' : 'helfer-status-closed'}`}>
                  {helperForm.is_open ? 'Geöffnet' : 'Geschlossen'}
                </span>
                <button
                  className={`admin-button ${helperForm.is_open ? 'admin-button-secondary' : 'admin-button-primary'}`}
                  onClick={handleToggleOpen}
                >
                  {helperForm.is_open ? 'Schliessen' : 'Öffnen'}
                </button>
              </div>

              <div className="helfer-link-box">
                <a href={link} target="_blank" rel="noopener noreferrer" className="helfer-link">
                  {link}
                </a>
                <button className="admin-button admin-button-secondary" onClick={handleCopyLink}>
                  {linkCopied ? 'Kopiert ✓' : 'Link kopieren'}
                </button>
              </div>
              {!helperForm.is_open && (
                <p className="helfer-hint">Solange das Formular geschlossen ist, sehen Besucher nur einen Hinweis.</p>
              )}

              <div className="helfer-settings">
                <label className="admin-label" htmlFor="helfer-morning">Vormittag</label>
                <input
                  id="helfer-morning"
                  className="admin-input"
                  value={settings.morning_label}
                  onChange={(e) => setSettings((prev) => ({ ...prev, morning_label: e.target.value }))}
                />
                <label className="admin-label" htmlFor="helfer-afternoon">Nachmittag</label>
                <input
                  id="helfer-afternoon"
                  className="admin-input"
                  value={settings.afternoon_label}
                  onChange={(e) => setSettings((prev) => ({ ...prev, afternoon_label: e.target.value }))}
                />
                <label className="admin-label" htmlFor="helfer-note">Hinweis oben im Formular</label>
                <textarea
                  id="helfer-note"
                  className="admin-input"
                  rows={2}
                  value={settings.note}
                  onChange={(e) => setSettings((prev) => ({ ...prev, note: e.target.value }))}
                />
                <label className="admin-label" htmlFor="helfer-contact">Kontakt-E-Mail für Fragen</label>
                <input
                  id="helfer-contact"
                  type="email"
                  className="admin-input"
                  placeholder="z.B. helfer@scliestal.ch"
                  value={settings.contact_email}
                  onChange={(e) => setSettings((prev) => ({ ...prev, contact_email: e.target.value }))}
                />
                <p className="helfer-hint" style={{ margin: 0 }}>
                  Erscheint in der Bestätigungsmail an Helfer und auf der Danke-Seite. Antworten auf die Mail gehen an diese Adresse.
                </p>
                <div>
                  <button className="admin-refresh-button" onClick={handleSaveSettings} disabled={isSavingSettings}>
                    {isSavingSettings ? 'Speichere…' : 'Einstellungen speichern'}
                  </button>
                </div>
              </div>
            </div>

            <div className="admin-divider" />

            {/* Helferliste */}
            <div className="admin-section" style={{ marginBottom: 0 }}>
              <div className="helfer-list-header">
                <h2 className="admin-section-title" style={{ margin: 0 }}>
                  Helfer ({searchQuery ? `${filteredSignups.length} von ${signups.length}` : signups.length})
                </h2>
                <div className="helfer-list-actions">
                  <button className="admin-button admin-button-secondary" onClick={emailAllHelpers} disabled={signups.length === 0}>
                    E-Mail an alle
                  </button>
                  <button className="admin-refresh-button" onClick={exportExcel} disabled={signups.length === 0}>
                    Excel exportieren
                  </button>
                </div>
              </div>
              <input
                type="search"
                className="admin-search-input helfer-search"
                placeholder="Name, Natel oder E-Mail suchen…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <div className="helfer-list">
                {filteredSignups.map((signup) => (
                  <div key={signup.id} className="helfer-card">
                    <div className="helfer-card-header">
                      <div>
                        <div className="helfer-card-name">
                          {signup.first_name} {signup.last_name}
                        </div>
                        <div className="helfer-card-meta">
                          Natel {signup.mobile} · <a href={`mailto:${signup.email}`}>{signup.email}</a>
                        </div>
                      </div>
                      {confirmDeleteId === signup.id ? (
                        <div className="helfer-delete-confirm">
                          <button className="admin-button admin-button-danger" onClick={() => handleDelete(signup.id)}>
                            Löschen
                          </button>
                          <button className="admin-button admin-button-secondary" onClick={() => setConfirmDeleteId(null)}>
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <button className="helfer-delete" onClick={() => setConfirmDeleteId(signup.id)} aria-label="Löschen">
                          Löschen
                        </button>
                      )}
                    </div>
                    <div className="helfer-card-shifts">
                      <span className="helfer-shift-tag">{availabilityLabel(signup.availability, helperForm)}</span>
                      {signup.interests.map((interest) => (
                        <span key={interest} className="helfer-shift-tag helfer-interest-tag">
                          {INTEREST_LABELS[interest]}
                        </span>
                      ))}
                      <span className="helfer-card-date">angemeldet am {formatDate(signup.created_at)}</span>
                    </div>
                  </div>
                ))}
                {filteredSignups.length === 0 && (
                  <p className="helfer-empty">
                    {signups.length === 0 ? 'Noch keine Helfer angemeldet.' : 'Keine Helfer gefunden.'}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminHelfer
