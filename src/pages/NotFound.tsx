function NotFound() {
  return (
    <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>404</h1>
        <p style={{ fontSize: '1.1rem', color: '#555' }}>Die angeforderte Seite wurde nicht gefunden.</p>
      </div>
    </div>
  )
}

export default NotFound

