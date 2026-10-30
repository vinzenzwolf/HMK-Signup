import { useCallback, useEffect, useMemo, useState } from 'react'
import InformationBanner from '../components/InformationBanner'
import { UsageBar } from '../components/ServiceStatus'
import { useAdminRoles } from '../lib/adminRoles'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  addContact,
  buildBroadcastHtml,
  createTemplate,
  deleteContact,
  deleteTemplate,
  importContacts,
  isValidEmail,
  loadBroadcasts,
  loadContacts,
  loadSignupHistory,
  loadTemplates,
  normalizeEmail,
  parseEmailList,
  previewImport,
  removeAttachment,
  sendBroadcast,
  sendTestMail,
  unsubscribeContact,
  updateTemplate,
  uploadAttachment,
  type Broadcast,
  type BroadcastContent,
  type BroadcastTemplate,
  type ContactStatus,
  type ImportPreview,
  type NewsletterContact,
  type SignupHistory,
} from '../lib/broadcast'
import './AdminHelfer.css'
import './AdminBroadcast.css'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
// Limit des Resend Free-Plans – bei einem Planwechsel hier anpassen
const RESEND_CONTACT_LIMIT = 1000

const EMPTY_CONTENT: BroadcastContent = {
  title: '',
  body: '',
  buttonLabel: 'Jetzt anmelden',
  buttonUrl: 'https://hmk.scl-athletics.ch',
  attachments: [],
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })

function AdminBroadcast() {
  const { email: adminEmail } = useAdminRoles()
  const [contacts, setContacts] = useState<NewsletterContact[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([])
  const [signupHistory, setSignupHistory] = useState<SignupHistory>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [newContact, setNewContact] = useState({ email: '', name: '', club: '' })

  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [pastedEmails, setPastedEmails] = useState('')
  const [importConsent, setImportConsent] = useState(false)

  const [subject, setSubject] = useState('')
  const [content, setContent] = useState<BroadcastContent>(EMPTY_CONTENT)
  const [testAddress, setTestAddress] = useState(adminEmail ?? '')
  const [confirmSend, setConfirmSend] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const [activeTemplateId, setActiveTemplateId] = useState('')
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null)
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  // Nur PDFs aus diesem Entwurf dürfen aus dem Speicher – Vorlagen und versendete Mails verlinken die übrigen
  const [draftUploads, setDraftUploads] = useState<string[]>([])

  const refresh = useCallback(async () => {
    const [contactData, broadcastData, historyData, templateData] = await Promise.all([
      loadContacts(),
      loadBroadcasts(),
      loadSignupHistory(),
      loadTemplates(),
    ])
    setContacts(contactData)
    setBroadcasts(broadcastData)
    setSignupHistory(historyData)
    setTemplates(templateData)
  }, [])

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : 'Daten konnten nicht geladen werden.'))
      .finally(() => setIsLoading(false))
  }, [refresh])

  // Meldungen stehen oben auf der Seite, die Buttons weit unten
  useEffect(() => {
    if (error || successMessage) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [error, successMessage])

  const run = async (action: () => Promise<string | void>) => {
    setIsBusy(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const message = await action()
      if (message) setSuccessMessage(message)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setIsBusy(false)
    }
  }

  const subscribedCount = contacts.filter((contact) => contact.status === 'subscribed').length
  const inactiveCount = contacts.length - subscribedCount
  const returningCount = contacts.filter((contact) => (signupHistory.get(contact.email)?.length ?? 0) > 1).length

  const filteredContacts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return contacts.filter(
      (contact) =>
        (statusFilter === 'all' || contact.status === statusFilter) &&
        (!query || [contact.email, contact.name, contact.club].some((value) => value?.toLowerCase().includes(query)))
    )
  }, [contacts, searchQuery, statusFilter])

  const html = useMemo(() => buildBroadcastHtml(content), [content])
  const missingFields = [
    !subject.trim() && 'Betreff',
    !content.title.trim() && 'Titel',
    !content.body.trim() && 'Text',
  ].filter(Boolean)
  const canSend = missingFields.length === 0
  const activeTemplate = templates.find((template) => template.id === activeTemplateId)
  const hasDraft =
    Boolean(subject.trim() || content.title.trim() || content.body.trim()) || content.attachments.length > 0

  function applyTemplate(id: string) {
    const template = templates.find((entry) => entry.id === id)
    if (!template) return
    setSubject(template.subject)
    setContent({ ...EMPTY_CONTENT, ...template.content })
    setActiveTemplateId(id)
    setPendingTemplateId(null)
    setConfirmDeleteTemplate(false)
  }

  function handleSelectTemplate(id: string) {
    setConfirmDeleteTemplate(false)
    if (!id) {
      setActiveTemplateId('')
      setPendingTemplateId(null)
    } else if (hasDraft) {
      setPendingTemplateId(id)
    } else {
      applyTemplate(id)
    }
  }

  async function handleCreateTemplate() {
    const name = templateName.trim()
    await run(async () => {
      const id = await createTemplate(name, subject, content)
      await refresh()
      setActiveTemplateId(id)
      setTemplateName('')
      setDraftUploads([])
      return `Vorlage «${name}» gespeichert.`
    })
  }

  async function handleUpdateTemplate() {
    if (!activeTemplate) return
    await run(async () => {
      await updateTemplate(activeTemplate.id, subject, content)
      await refresh()
      setDraftUploads([])
      return `Vorlage «${activeTemplate.name}» aktualisiert.`
    })
  }

  async function handleDeleteTemplate() {
    if (!activeTemplate) return
    await run(async () => {
      await deleteTemplate(activeTemplate.id)
      await refresh()
      setActiveTemplateId('')
      setConfirmDeleteTemplate(false)
      return `Vorlage «${activeTemplate.name}» gelöscht.`
    })
  }

  async function handleAddContact() {
    const email = normalizeEmail(newContact.email)
    if (!isValidEmail(email)) {
      setError('Bitte eine gültige E-Mail-Adresse eingeben.')
      return
    }
    const existing = contacts.find((contact) => contact.email === email)
    if (existing) {
      setError(`${email} ist bereits erfasst (${STATUS_LABELS[existing.status]}).`)
      return
    }
    const added = await run(async () => {
      await addContact({ email, name: newContact.name.trim() || null, club: newContact.club.trim() || null })
      await refresh()
      return `${email} hinzugefügt.`
    })
    if (added) setNewContact({ email: '', name: '', club: '' })
  }

  function handlePreviewPasted() {
    setImportConsent(false)
    setImportPreview(previewImport(parseEmailList(pastedEmails), contacts))
  }

  async function handleImport() {
    if (!importPreview) return
    const imported = await run(async () => {
      await importContacts(importPreview.fresh)
      await refresh()
      return `${importPreview.fresh.length} Empfänger importiert.`
    })
    if (imported) {
      setImportPreview(null)
      setPastedEmails('')
    }
  }

  async function handleAttachments(files: FileList | null) {
    if (!files) return
    await run(async () => {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error(`${file.name} ist kein PDF.`)
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} ist grösser als 10 MB.`)
        const attachment = await uploadAttachment(file)
        setContent((prev) => ({ ...prev, attachments: [...prev.attachments, attachment] }))
        setDraftUploads((prev) => [...prev, attachment.path])
      }
    })
  }

  async function handleRemoveAttachment(path: string) {
    await run(async () => {
      if (draftUploads.includes(path)) await removeAttachment(path)
      setContent((prev) => ({ ...prev, attachments: prev.attachments.filter((file) => file.path !== path) }))
    })
  }

  async function handleSendTest() {
    const address = normalizeEmail(testAddress)
    if (!isValidEmail(address)) {
      setError('Bitte eine gültige Testadresse eingeben.')
      return
    }
    await run(() => sendTestMail(address, subject.trim(), html).then((result) => result.message))
  }

  async function handleSend() {
    setConfirmSend(false)
    const sent = await run(async () => {
      const message = await sendBroadcast(subject.trim(), content, html)
      await refresh()
      return message
    })
    if (sent) {
      setSubject('')
      setContent(EMPTY_CONTENT)
      setActiveTemplateId('')
      setDraftUploads([])
    }
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

        {isLoading ? (
          <p>Lade Empfänger…</p>
        ) : (
          <>
            {/* Neuer Broadcast */}
            <div className="admin-section">
              <h2 className="admin-section-title">Neuer Broadcast</h2>
              <div className="broadcast-templates">
                <select
                  className="admin-input admin-select"
                  aria-label="Vorlage laden"
                  disabled={isBusy}
                  value={pendingTemplateId ?? activeTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                >
                  <option value="">Vorlage laden…</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                {pendingTemplateId ? (
                  <>
                    <span className="broadcast-confirm">Aktuellen Entwurf ersetzen?</span>
                    <button
                      className="admin-button admin-button-primary"
                      onClick={() => applyTemplate(pendingTemplateId)}
                    >
                      Ja, Vorlage laden
                    </button>
                    <button className="admin-button admin-button-secondary" onClick={() => setPendingTemplateId(null)}>
                      Abbrechen
                    </button>
                  </>
                ) : (
                  activeTemplate && (
                    <>
                      <button
                        className="admin-button admin-button-secondary"
                        disabled={isBusy}
                        onClick={handleUpdateTemplate}
                      >
                        Vorlage aktualisieren
                      </button>
                      {confirmDeleteTemplate ? (
                        <button
                          className="admin-button admin-button-primary"
                          disabled={isBusy}
                          onClick={handleDeleteTemplate}
                        >
                          Endgültig löschen
                        </button>
                      ) : (
                        <button
                          className="admin-button admin-button-secondary"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteTemplate(true)}
                        >
                          Vorlage löschen
                        </button>
                      )}
                    </>
                  )
                )}
              </div>
              <div className="broadcast-templates">
                <input
                  className="admin-input"
                  placeholder="Name der Vorlage"
                  aria-label="Name der Vorlage"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button
                  className="admin-button admin-button-secondary"
                  disabled={isBusy || !templateName.trim()}
                  onClick={handleCreateTemplate}
                >
                  Als Vorlage speichern
                </button>
              </div>
              <div className="broadcast-editor">
                <div className="broadcast-fields">
                  <label className="admin-label" htmlFor="broadcast-subject">Betreff</label>
                  <input
                    id="broadcast-subject"
                    className="admin-input"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                  <label className="admin-label" htmlFor="broadcast-title">Titel</label>
                  <input
                    id="broadcast-title"
                    className="admin-input"
                    placeholder="z.B. Einladung zum 5. SCL Hallenmehrkampf"
                    value={content.title}
                    onChange={(e) => setContent((prev) => ({ ...prev, title: e.target.value }))}
                  />
                  <label className="admin-label" htmlFor="broadcast-body">Text</label>
                  <textarea
                    id="broadcast-body"
                    className="admin-input"
                    rows={8}
                    value={content.body}
                    onChange={(e) => setContent((prev) => ({ ...prev, body: e.target.value }))}
                  />
                  <p className="helfer-hint">Eine Leerzeile beginnt einen neuen Absatz.</p>
                  <label className="admin-label" htmlFor="broadcast-button-label">Button-Text</label>
                  <input
                    id="broadcast-button-label"
                    className="admin-input"
                    value={content.buttonLabel}
                    onChange={(e) => setContent((prev) => ({ ...prev, buttonLabel: e.target.value }))}
                  />
                  <label className="admin-label" htmlFor="broadcast-button-url">Button-Link</label>
                  <input
                    id="broadcast-button-url"
                    className="admin-input"
                    value={content.buttonUrl}
                    onChange={(e) => setContent((prev) => ({ ...prev, buttonUrl: e.target.value }))}
                  />
                  <label className="admin-label" htmlFor="broadcast-files">PDF-Anhänge</label>
                  <input
                    id="broadcast-files"
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    disabled={isBusy}
                    onChange={(e) => {
                      handleAttachments(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <p className="helfer-hint">
                    Max. 10 MB pro PDF. Anhänge werden als Download-Link in die Mail eingefügt und sind öffentlich abrufbar. Keine Personendaten hochladen.
                  </p>
                  {content.attachments.map((file) => (
                    <div key={file.path} className="broadcast-attachment">
                      <a href={file.url} target="_blank" rel="noopener noreferrer">{file.name}</a>
                      <button
                        className="admin-button admin-button-secondary"
                        disabled={isBusy}
                        onClick={() => handleRemoveAttachment(file.path)}
                      >
                        Entfernen
                      </button>
                    </div>
                  ))}
                </div>

                <div className="broadcast-preview">
                  <p className="admin-label">Vorschau</p>
                  <iframe title="Vorschau der Mail" sandbox="" srcDoc={html} className="broadcast-preview-frame" />
                </div>
              </div>

              <div className="broadcast-actions">
                <input
                  type="email"
                  className="admin-input"
                  placeholder="Testadresse"
                  aria-label="Testadresse"
                  value={testAddress}
                  onChange={(e) => setTestAddress(e.target.value)}
                />
                <button
                  className="admin-button admin-button-secondary"
                  disabled={isBusy || !canSend}
                  onClick={handleSendTest}
                >
                  Testmail senden
                </button>
                {confirmSend ? (
                  <>
                    <span className="broadcast-confirm">An {subscribedCount} Empfänger versenden?</span>
                    <button className="admin-button admin-button-primary" disabled={isBusy} onClick={handleSend}>
                      Ja, jetzt versenden
                    </button>
                    <button className="admin-button admin-button-secondary" onClick={() => setConfirmSend(false)}>
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button
                    className="admin-button admin-button-primary"
                    disabled={isBusy || !canSend || subscribedCount === 0}
                    onClick={() => setConfirmSend(true)}
                  >
                    Versenden
                  </button>
                )}
              </div>
              {!canSend && <p className="helfer-hint">Zum Senden fehlt noch: {missingFields.join(', ')}.</p>}
            </div>

            {/* Empfänger */}
            <div className="admin-section">
              <div className="helfer-list-header">
                <h2 className="admin-section-title" style={{ margin: 0 }}>
                  Empfänger ({subscribedCount} aktiv, {inactiveCount} inaktiv, {returningCount} wiederkehrend)
                </h2>
              </div>

              <div className="broadcast-usage">
                <UsageBar
                  label="Kontakte"
                  used={contacts.length}
                  limit={RESEND_CONTACT_LIMIT}
                  unit="Kontakte"
                  hint="Broadcasts selbst sind unbegrenzt"
                />
              </div>

              <div className="broadcast-add">
                <input
                  type="email"
                  className="admin-input"
                  placeholder="E-Mail"
                  aria-label="E-Mail"
                  value={newContact.email}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, email: e.target.value }))}
                />
                <input
                  className="admin-input"
                  placeholder="Name"
                  aria-label="Name"
                  value={newContact.name}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  className="admin-input"
                  placeholder="Verein"
                  aria-label="Verein"
                  value={newContact.club}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, club: e.target.value }))}
                />
                <button className="admin-button admin-button-secondary" disabled={isBusy} onClick={handleAddContact}>
                  Hinzufügen
                </button>
              </div>

              <div className="broadcast-import">
                <label className="admin-label" htmlFor="broadcast-paste">Adressen einfügen</label>
                <textarea
                  id="broadcast-paste"
                  className="admin-input"
                  rows={4}
                  placeholder="Eine Adresse pro Zeile"
                  value={pastedEmails}
                  onChange={(e) => setPastedEmails(e.target.value)}
                />
                <div>
                  <button
                    className="admin-button admin-button-secondary"
                    disabled={isBusy || !pastedEmails.trim()}
                    onClick={handlePreviewPasted}
                  >
                    Auf Dubletten prüfen
                  </button>
                </div>
                {importPreview && (
                  <div className="helfer-card">
                    <div className="helfer-card-name">Eingefügte Liste</div>
                    <div className="helfer-card-meta">
                      {importPreview.fresh.length} neu · {importPreview.duplicates} bereits erfasst oder doppelt ·{' '}
                      {importPreview.invalid} ungültig · {importPreview.unsubscribed} abgemeldet (werden nicht reaktiviert)
                    </div>
                    <label className="broadcast-consent">
                      <input
                        type="checkbox"
                        checked={importConsent}
                        onChange={(e) => setImportConsent(e.target.checked)}
                      />
                      Ich bestätige, dass diese Personen dem Empfang zugestimmt haben.
                    </label>
                    <div className="broadcast-import-actions">
                      <button
                        className="admin-button admin-button-primary"
                        disabled={isBusy || !importConsent || importPreview.fresh.length === 0}
                        onClick={handleImport}
                      >
                        {importPreview.fresh.length} importieren
                      </button>
                      <button className="admin-button admin-button-secondary" onClick={() => setImportPreview(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="broadcast-filters">
                <input
                  className="admin-input"
                  placeholder="Suchen…"
                  aria-label="Empfänger suchen"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="admin-input admin-select"
                  aria-label="Status filtern"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ContactStatus | 'all')}
                >
                  <option value="all">Alle</option>
                  {Object.entries(STATUS_LABELS).map(([status, label]) => (
                    <option key={status} value={status}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="helfer-list">
                {filteredContacts.length === 0 && <p className="helfer-empty">Keine Empfänger gefunden.</p>}
                {filteredContacts.map((contact) => {
                  const signups = signupHistory.get(contact.email) ?? []
                  return (
                  <div key={contact.id} className="helfer-card broadcast-contact">
                    <div>
                      <div className="helfer-card-name">{contact.email}</div>
                      <div className="helfer-card-meta">
                        {[contact.name, contact.club].filter(Boolean).join(' · ') || 'Kein Name'}
                      </div>
                      <div className="helfer-card-meta">
                        {signups.length > 0
                          ? `Angemeldet: ${signups
                              .map(({ year, athletes }) => `${year} (${athletes} Athlet/innen)`)
                              .join(', ')}`
                          : 'Noch nie angemeldet'}
                      </div>
                      <div className="helfer-card-shifts">
                        <span className="helfer-shift-tag">{STATUS_LABELS[contact.status]}</span>
                        <span className="helfer-shift-tag" title={contact.consent_note ?? undefined}>
                          {SOURCE_LABELS[contact.source]}
                        </span>
                        {signups.length > 1 && <span className="helfer-shift-tag">Wiederkehrend</span>}
                      </div>
                    </div>
                    <div className="broadcast-contact-actions">
                      {contact.status === 'subscribed' && (
                        <button
                          className="admin-button admin-button-secondary"
                          disabled={isBusy}
                          onClick={() =>
                            run(async () => {
                              await unsubscribeContact(contact.id)
                              await refresh()
                            })
                          }
                        >
                          Abmelden
                        </button>
                      )}
                      {confirmDeleteId === contact.id ? (
                        <button
                          className="admin-button admin-button-primary"
                          disabled={isBusy}
                          onClick={() =>
                            run(async () => {
                              const { message } = await deleteContact(contact.id)
                              setConfirmDeleteId(null)
                              await refresh()
                              return message
                            })
                          }
                        >
                          Endgültig löschen
                        </button>
                      ) : (
                        <button
                          className="admin-button admin-button-secondary"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(contact.id)}
                        >
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>

            {/* Verlauf */}
            <div className="admin-section">
              <h2 className="admin-section-title">Verlauf</h2>
              <div className="helfer-list">
                {broadcasts.length === 0 && <p className="helfer-empty">Noch keine Broadcasts versendet.</p>}
                {broadcasts.map((broadcast) => (
                  <div key={broadcast.id} className="helfer-card">
                    <div className="helfer-card-name">{broadcast.subject}</div>
                    <div className="helfer-card-meta">
                      {broadcast.status === 'sent' && broadcast.sent_at
                        ? `${formatDate(broadcast.sent_at)} · ${broadcast.recipient_count ?? 0} Empfänger`
                        : broadcast.status === 'failed'
                          ? `Fehlgeschlagen: ${broadcast.error ?? 'Unbekannter Fehler'}`
                          : 'Wird versendet…'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AdminBroadcast
