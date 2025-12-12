import FormField from './FormField'
import { useState, useCallback } from 'react'
import './SignUpForm.css'
import type { Child } from '../types/child';
import ChildCard from './ChildCard';
import DashedButton from './DashedButton';
import SubmitButton from './SubmitButton';
import ExcelTool from './ExcelTool';

function createEmptyChild(): Child {
  return {
    id: crypto.randomUUID(),
    vorname: '',
    nachname: '',
    jahrgang: '',
    geschlecht: 'M',
  };
}

function SignUpForm() {
  const [trainerName, setTrainerName] = useState("");
  const [verein, setVerein] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [children, setChildren] = useState<Child[]>([
    createEmptyChild(),
  ]);

  const addChild = () => {
    setChildren(prev => [...prev, createEmptyChild()]);
  };

  const removeChild = (id: string) => {
    setChildren(prev => prev.filter(child => child.id !== id));
  };

  const handleChildChange = useCallback(
  (
    id: string,
    field: keyof Omit<Child, 'id'>,
    value: string
  ) => {
    setChildren(prev =>
      prev.map(child =>
        child.id === id
          ? { ...child, [field]: value }
          : child
      )
    );
  },
  []
);

  return (
    <>
        <form className="signUpForm">

          <section>
              <header>
                  <h2>Trainer/in</h2>
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

          <section>
            <header>
              <h2>Athlet/Innen</h2>
            </header>

            <ExcelTool
                onImport={(importedChildren) => {setChildren(importedChildren);}}/>


            {children.map((child, index) => (
              <ChildCard
                key={child.id}
                child={child}
                index={index}
                onChange={handleChildChange}   // 👈 HIER
                onRemove={removeChild}
                disableRemove={children.length === 1}
              />
            ))}

            <div className='add-child-box'>
              <DashedButton
              label="+ füge eine weitere Athlet/in hinzu"
              color="#4C1D95"
              onClick={addChild}
              />
            </div>
            

          </section>

          <section>
            <div className='add-child-box'>
              <SubmitButton
              label="Anmeldung speichern"
              color="#4C1D95"
              onClick={addChild}
              />
            </div>
          </section>


        </form>
    </>
  )
}

export default SignUpForm