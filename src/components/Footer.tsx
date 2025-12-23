import { Link } from 'react-router-dom'
import './Footer.css'

function Footer() {
  return (
    <footer className="footer">
      <Link to="/impressum" className="footer-link">
        Impressum
      </Link>
    </footer>
  )
}

export default Footer

