import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { isSupported, getMessaging } from 'firebase/messaging';
import { environment } from '../environments/environment';

// Una sola instancia de Firebase para toda la app.
// Cualquier servicio que necesite Firestore importa "db" desde aquí.
const app = initializeApp(environment.firebaseConfig);
export const db = getFirestore(app);

// getMessaging() falla en navegadores/contextos sin soporte (Safari viejo,
// modo incógnito en algunos casos, etc.), así que se resuelve de forma
// perezosa y seguimos funcionando igual aunque no haya push disponible.
export const messagingPromise = isSupported().then((soportado) =>
  soportado ? getMessaging(app) : null
);