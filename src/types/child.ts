export type Gender = 'M' | 'W';

export type Child = {
  id: string;
  vorname: string;
  nachname: string;
  jahrgang: string;
  geschlecht: Gender;
};