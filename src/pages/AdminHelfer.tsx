import { useMemo, useState } from 'react'
import InformationBanner from '../components/InformationBanner'
import './AdminHelfer.css'

// Beispieldaten – werden ersetzt, sobald die Helferanmeldung an Supabase angebunden ist
type Shift = {
  id: string
  task: string
  start: string
  end: string
  needed: number
}

type Helper = {
  id: string
  name: string
  club: string
  email: string
  shiftIds: string[]
}

const MOCK_SHIFTS: Shift[] = [
  { id: 's1', task: 'Aufbau Halle', start: '07:00', end: '08:30', needed: 6 },
  { id: 's2', task: 'Startnummernausgabe', start: '08:00', end: '10:00', needed: 3 },
  { id: 's3', task: 'Kampfgericht Sprint', start: '09:00', end: '12:00', needed: 4 },
  { id: 's4', task: 'Kampfgericht Weitsprung', start: '09:00', end: '12:00', needed: 4 },
  { id: 's5', task: 'Kampfgericht Kugelstossen', start: '12:30', end: '15:30', needed: 3 },
  { id: 's6', task: 'Festwirtschaft', start: '10:00', end: '14:00', needed: 5 },
  { id: 's7', task: 'Rangverkündigung', start: '15:30', end: '16:30', needed: 2 },
  { id: 's8', task: 'Abbau Halle', start: '16:30', end: '18:00', needed: 6 },
]

const MOCK_HELPERS: Helper[] = [
  { id: 'h1', name: 'Anna Meier', club: 'SC Liestal', email: 'anna.meier@example.com', shiftIds: ['s1', 's3'] },
  { id: 'h2', name: 'Marco Keller', club: 'SC Liestal', email: 'marco.keller@example.com', shiftIds: ['s3', 's8'] },
  { id: 'h3', name: 'Laura Schmid', club: 'TV Pratteln', email: 'laura.schmid@example.com', shiftIds: ['s2'] },
  { id: 'h4', name: 'Thomas Weber', club: 'LV Frenke', email: 'thomas.weber@example.com', shiftIds: ['s4', 's5'] },
  { id: 'h5', name: 'Sarah Brunner', club: 'SC Liestal', email: 'sarah.brunner@example.com', shiftIds: ['s6'] },
  { id: 'h6', name: 'David Frei', club: 'TV Sissach', email: 'david.frei@example.com', shiftIds: ['s1', 's8'] },
  { id: 'h7', name: 'Nina Huber', club: 'SC Liestal', email: 'nina.huber@example.com', shiftIds: ['s6', 's7'] },
  { id: 'h8', name: 'Lukas Graf', club: 'LV Frenke', email: 'lukas.graf@example.com', shiftIds: ['s4'] },
  { id: 'h9', name: 'Mia Roth', club: 'TV Pratteln', email: 'mia.roth@example.com', shiftIds: ['s2', 's3'] },
  { id: 'h10', name: 'Jonas Baumann', club: 'SC Liestal', email: 'jonas.baumann@example.com', shiftIds: ['s1', 's5', 's8'] },
]

const shiftById = new Map(MOCK_SHIFTS.map((shift) => [shift.id, shift]))

function AdminHelfer() {
  const [searchQuery, setSearchQuery] = useState('')

  const filledByShift = useMemo(() => {
    const counts = new Map<string, number>()
    MOCK_HELPERS.forEach((helper) =>
      helper.shiftIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
    )
    return counts
  }, [])

  const totalNeeded = MOCK_SHIFTS.reduce((sum, shift) => sum + shift.needed, 0)
  const totalFilled = MOCK_SHIFTS.reduce(
    (sum, shift) => sum + Math.min(shift.needed, filledByShift.get(shift.id) ?? 0),
    0
  )
  const openSlots = totalNeeded - totalFilled

  const filteredHelpers = MOCK_HELPERS.filter((helper) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    return [helper.name, helper.club, helper.email].some((value) => value.toLowerCase().includes(query))
  })

  return (
    <div className="form">
      <div className="admin-container">
        <div className="admin-banner-wrapper">
          <InformationBanner
            variant="info"
            message="Vorschau mit Beispieldaten – die Helferanmeldung ist noch nicht live."
          />
        </div>

        <div className="admin-section">
          <h2 className="admin-section-title">Übersicht</h2>
          <div className="admin-stats-grid">
            <div className="admin-stat-card admin-stat-card-violet">
              <div className="admin-stat-value admin-stat-value-violet">{MOCK_HELPERS.length}</div>
              <div className="admin-stat-label admin-stat-label-violet">Helfer</div>
            </div>
            <div className="admin-stat-card admin-stat-card-sky">
              <div className="admin-stat-value admin-stat-value-sky">{MOCK_SHIFTS.length}</div>
              <div className="admin-stat-label admin-stat-label-sky">Schichten</div>
            </div>
            <div className="admin-stat-card admin-stat-card-emerald">
              <div className="admin-stat-value admin-stat-value-emerald">
                {Math.round((totalFilled / totalNeeded) * 100)}%
              </div>
              <div className="admin-stat-label admin-stat-label-emerald">Besetzt</div>
            </div>
            <div className="admin-stat-card admin-stat-card-amber">
              <div className="admin-stat-value admin-stat-value-amber">{openSlots}</div>
              <div className="admin-stat-label admin-stat-label-amber">Offene Plätze</div>
            </div>
          </div>
        </div>

        <div className="admin-divider" />

        <div className="admin-section">
          <h2 className="admin-section-title">Schichtplan</h2>
          <div className="helfer-shift-list">
            {MOCK_SHIFTS.map((shift) => {
              const filled = filledByShift.get(shift.id) ?? 0
              const state = filled >= shift.needed ? 'full' : filled === 0 ? 'empty' : 'partial'
              return (
                <div key={shift.id} className="helfer-shift">
                  <div className="helfer-shift-time">
                    {shift.start}
                    <span>–{shift.end}</span>
                  </div>
                  <div className="helfer-shift-info">
                    <div className="helfer-shift-task">{shift.task}</div>
                    <div className="helfer-shift-track">
                      <div
                        className={`helfer-shift-fill helfer-shift-fill-${state}`}
                        style={{ width: `${Math.min(100, (filled / shift.needed) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className={`helfer-shift-count helfer-shift-count-${state}`}>
                    {filled}/{shift.needed}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="admin-divider" />

        <div className="admin-section" style={{ marginBottom: 0 }}>
          <div className="helfer-list-header">
            <h2 className="admin-section-title" style={{ margin: 0 }}>
              Helfer ({filteredHelpers.length})
            </h2>
            <button className="admin-refresh-button" disabled title="Noch nicht verfügbar">
              Anmeldelink kopieren
            </button>
          </div>
          <input
            type="search"
            className="admin-search-input helfer-search"
            placeholder="Name, Verein oder E-Mail suchen…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <div className="helfer-list">
            {filteredHelpers.map((helper) => (
              <div key={helper.id} className="helfer-card">
                <div className="helfer-card-header">
                  <div>
                    <div className="helfer-card-name">{helper.name}</div>
                    <div className="helfer-card-meta">
                      {helper.club} · {helper.email}
                    </div>
                  </div>
                </div>
                <div className="helfer-card-shifts">
                  {helper.shiftIds.map((id) => {
                    const shift = shiftById.get(id)
                    return (
                      shift && (
                        <span key={id} className="helfer-shift-tag">
                          {shift.start} {shift.task}
                        </span>
                      )
                    )
                  })}
                </div>
              </div>
            ))}
            {filteredHelpers.length === 0 && <p className="helfer-empty">Keine Helfer gefunden.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminHelfer
