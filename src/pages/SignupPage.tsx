import './SignupPage.css'
import Tag from '../components/Tag'
import SignUpForm from '../components/SignUpForm'

function SignupPage() {

  return (
    <>
       <div className= "title">
        <Tag>2027</Tag>
        <h1>Anmeldung SCL Hallenmehrkampf</h1>
        <p>Anmeldeformular für Vereine</p>
        <div className="tags">
          <Tag>Kategorien: U10, U12, U14</Tag>
          <Tag>Anmeldefrist: 15.01.2027</Tag>
        </div>
      </div>

      <div className='form'><SignUpForm></SignUpForm></div>
    </>
  )
}

export default SignupPage