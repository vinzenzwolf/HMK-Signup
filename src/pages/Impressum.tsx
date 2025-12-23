import './SignupPage.css'

function Impressum() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem', minHeight: '60vh' }}>
      <div className="title">
        <h1>Impressum</h1>
      </div>

      <div className="form" style={{ marginTop: '2rem', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: '600px', width: '100%' }}>
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              ADRESSE
            </h2>
            <div style={{ lineHeight: '1.8', color: '#475569' }}>
              <p style={{ margin: '0.5rem 0' }}>SC Liestal</p>
              <p style={{ margin: '0.5rem 0' }}>4410 Liestal</p>
              <p style={{ margin: '1rem 0 0.5rem 0' }}>
                <a href="mailto:info@scl-athletics.ch" style={{ color: '#4C1D95', textDecoration: 'none' }}>
                  info@scl-athletics.ch
                </a>
              </p>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              BANKVERBINDUNG
            </h2>
            <div style={{ lineHeight: '1.8', color: '#475569' }}>
              <p style={{ margin: '0.5rem 0' }}>Basellandschaftliche Kantonalbank BLKB</p>
              <p style={{ margin: '0.5rem 0' }}>4410 Liestal</p>
              <p style={{ margin: '0.5rem 0' }}>Clearing-Nr.: 769</p>
              <p style={{ margin: '0.5rem 0' }}>SWIFT/BIC-Code: BLKBCH22</p>
              <p style={{ margin: '0.5rem 0' }}>IBAN: CH07 0076 9016 1108 4242 2</p>
              <p style={{ margin: '1.5rem 0 0.5rem 0', fontWeight: 600, color: '#0f172a' }}>
                Zugunsten von
              </p>
              <p style={{ margin: '0.5rem 0' }}>SC Liestal</p>
              <p style={{ margin: '0.5rem 0' }}>Leichtathletik</p>
              <p style={{ margin: '0.5rem 0' }}>4410 Liestal</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Impressum

