import FormField from './FormField'
import { useState } from 'react'
import './SignUpForm.css'

function SignUpForm() {
  const [trainerName, setTrainerName] = useState("");
  const [verein, setVerein] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  return (
    <>
        <form className="signUpForm">

            <section>
                <header className="section-header">
                <div>
                    <h2>Trainer/in</h2>
                </div>
                </header>
                
                <div className="input-grid">
                  <FormField
                  label='Vor/ Nachname'
                  placeholder='Max Mustermann'
                  value= {trainerName}
                  onChange={(e) => setTrainerName(e.target.value)}
                  />
                  <FormField
                  label='Verein'
                  placeholder='SC Liestal'
                  value= {verein}
                  onChange={(e) => setVerein(e.target.value)}
                  />
                  <FormField
                  label='Email'
                  placeholder='max@scl-athletics.ch'
                  value = {email}
                  onChange={(e) => setEmail(e.target.value)}
                  />
                  <FormField
                  label='Telefonnummer'
                  placeholder='+41 78 882 26 50'
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
            </section>



        </form>
    </>
  )
}

export default SignUpForm