import { Link } from 'react-router-dom'
import logoSrc from '../assets/SCL_Logo.png'
import './SiteHeader.css'

function SiteHeader() {
  return (
    <header className="site-header">
      <Link to="/" className="site-header-brand">
        <span className="site-header-logo">
          <img src={logoSrc} alt="" />
        </span>
        <span className="site-header-name">SC Liestal</span>
      </Link>
      <a href="https://scl-athletics.ch" className="site-header-link">
        scl-athletics.ch
      </a>
    </header>
  )
}

export default SiteHeader
