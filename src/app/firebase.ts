import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { environment } from '../environments/environment';

// Una sola instancia de Firebase para toda la app.
// Cualquier servicio que necesite Firestore importa "db" desde aquí.
const app = initializeApp(environment.firebaseConfig);
export const db = getFirestore(app);