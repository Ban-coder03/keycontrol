import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { collection, doc, onSnapshot, runTransaction, addDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { AlertController } from '@ionic/angular';
import { db, messagingPromise } from '../firebase';
import { environment } from '../../environments/environment';
import { Docente, Llave, Prestamo, MINUTOS_POR_LECCION, RECESOS } from '../models/modelos';

const CLAVE_CEDULA_ACTIVA = 'kc_cedula_activa';

// Orden "natural": entiende números dentro del texto, así que
// "Aula 2" sale antes que "Aula 10", y "Aula 15A" antes que "Aula 15B".
// Esto es solo para cómo se muestra en la app; no afecta el panel de Firestore.
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

// Primero todas las aulas normales (1, 2, 15A, 15B...), después el bloque
// completo de las que terminan en "E" (1E, 2E, ... 12E), cada grupo en
// orden numérico. Si más adelante hay otro bloque especial, se agrega aquí.
function grupoAula(id: string): number {
  return /E$/.test(id.trim()) ? 2 : 1;
}

function compararAulas(a: { id: string }, b: { id: string }): number {
  const diferenciaGrupo = grupoAula(a.id) - grupoAula(b.id);
  if (diferenciaGrupo !== 0) return diferenciaGrupo;
  return collator.compare(a.id, b.id);
}

@Injectable({ providedIn: 'root' })
export class LlavesService {
  private alertCtrl = inject(AlertController);

  private docentesCol = collection(db, 'docentes');
  private llavesCol = collection(db, 'llaves');
  private prestamosCol = collection(db, 'prestamos');

  private docentes = signal<Docente[]>([]);

  // Estas tres señales se mantienen sincronizadas SOLAS con Firestore:
  // cualquier cambio hecho desde cualquier dispositivo se refleja aquí
  // automáticamente, sin recargar la página.
  readonly llaves = signal<Llave[]>([]);
  readonly historial = signal<Prestamo[]>([]);

  // Cédula del docente que está usando ESTE dispositivo ahora mismo (local, no va a Firestore)
  readonly cedulaActiva = signal<string | null>(this.leerCedulaGuardada());

  readonly llaveActiva = computed(() => {
    const cedula = this.cedulaActiva();
    if (!cedula) return undefined;
    return this.llaves().find(
      (l) => l.estado === 'ocupada' && l.cedulaResponsable === cedula
    );
  });

  // Solo el número de la hora límite (no el objeto completo), para que el
  // effect de abajo NO se dispare cada vez que cambia CUALQUIER llave en
  // Firestore, sino solo cuando de verdad cambia la hora límite de ESTA.
  private horaLimiteActiva = computed(() => this.llaveActiva()?.horaLimite ?? null);

  // La única alarma activa en este dispositivo (un docente solo puede
  // tener una llave a la vez, así que basta con una sola a la vez)
  private alarmaActual?: ReturnType<typeof setTimeout>;

  constructor() {
    // Pide permiso de notificaciones una sola vez, al abrir la app
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Reprograma la alarma automáticamente cada vez que cambia la hora
    // límite de la llave activa: al tomarla (se crea), al ampliar el
    // plazo (se reprograma más tarde) o al devolverla (se cancela, porque
    // llaveActiva queda undefined y horaLimiteActiva queda null).
    effect(() => {
      this.reprogramarAlarma(this.horaLimiteActiva());
    });

    // Si este dispositivo ya tiene una llave activa (quedó guardada de una
    // sesión anterior), aseguramos que su token push siga registrado.
    const cedulaGuardada = this.leerCedulaGuardada();
    if (cedulaGuardada) {
      this.registrarTokenPush(cedulaGuardada);
    }

    this.escucharMensajesEnPrimerPlano();

    onSnapshot(this.docentesCol, (snap) => {
      this.docentes.set(
        snap.docs.map((d) => ({ cedula: d.id, ...(d.data() as Omit<Docente, 'cedula'>) }))
      );
    });

    onSnapshot(this.llavesCol, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Llave, 'id'>) }));
      lista.sort(compararAulas);
      this.llaves.set(lista);
    });

    onSnapshot(this.prestamosCol, (snap) => {
      this.historial.set(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Prestamo, 'id'>) }))
      );
    });
  }

  private leerCedulaGuardada(): string | null {
    try {
      return localStorage.getItem(CLAVE_CEDULA_ACTIVA);
    } catch {
      return null;
    }
  }

  private guardarCedulaActiva(cedula: string | null) {
    this.cedulaActiva.set(cedula);
    try {
      if (cedula) localStorage.setItem(CLAVE_CEDULA_ACTIVA, cedula);
      else localStorage.removeItem(CLAVE_CEDULA_ACTIVA);
    } catch {
      // si falla el storage, al menos queda en memoria durante la sesión
    }
  }

  buscarDocente(cedula: string): Docente | undefined {
    return this.docentes().find((d) => d.cedula === cedula);
  }

  // --- Notificaciones push (FCM) ---
  // Esto es lo que permite avisar al celular aunque la pantalla esté
  // bloqueada o el navegador minimizado: un proceso externo (en Vercel)
  // revisa Firestore cada pocos minutos y, si encuentra una llave vencida
  // sin avisar, le manda un mensaje a este token a través de FCM. Google
  // entrega ese mensaje directo al sistema operativo, sin que esta pestaña
  // tenga que estar corriendo en ese momento.
  private async registrarTokenPush(cedula: string) {
    try {
      if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

      if (Notification.permission === 'default') {
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') return;
      }
      if (Notification.permission !== 'granted') return;

      const messaging = await messagingPromise;
      if (!messaging) return; // navegador sin soporte para push

      const registro = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

      const token = await getToken(messaging, {
        vapidKey: environment.vapidKey,
        serviceWorkerRegistration: registro,
      });

      if (token) {
        await setDoc(doc(db, 'docentes', cedula), { fcmTokens: arrayUnion(token) }, { merge: true });
      }
    } catch (error) {
      // No bloqueamos el flujo de tomar/ampliar una llave si el push falla
      // (por ejemplo, el docente le dio "Bloquear" al permiso del navegador).
      console.warn('No se pudo registrar el token de notificaciones push:', error);
    }
  }

  private async escucharMensajesEnPrimerPlano() {
    const messaging = await messagingPromise;
    if (!messaging) return;

    // Cuando la pestaña está visible, FCM no muestra la notificación del
    // sistema solo; nos avisa aquí. Como ya tenemos la alarma local
    // (setTimeout) mostrando la alerta de Ionic en primer plano, este
    // mensaje llega de respaldo y solo lo registramos, sin duplicar avisos.
    onMessage(messaging, (payload) => {
      console.log('Push recibido en primer plano:', payload);
    });
  }

  // --- Alarma local (setTimeout real, no revisa el reloj cada segundo) ---

  private reprogramarAlarma(horaLimiteMs: number | null) {
    if (this.alarmaActual) {
      clearTimeout(this.alarmaActual);
      this.alarmaActual = undefined;
    }

    if (!horaLimiteMs) return; // no hay llave activa: nada que programar

    const msRestantes = horaLimiteMs - Date.now();
    if (msRestantes <= 0) {
      this.dispararAlarma();
      return;
    }
    this.alarmaActual = setTimeout(() => this.dispararAlarma(), msRestantes);
  }

  private dispararAlarma() {
    this.alarmaActual = undefined;
    const llave = this.llaveActiva();
    // Puede que ya no exista (se devolvió justo cuando iba a sonar)
    if (!llave) return;
    this.notificarVencimiento(llave);
  }

  private async notificarVencimiento(llave: Llave) {
    const mensaje = `Estimado usuario, su plazo para "${llave.id}" ha vencido. Por favor devuelva la llave o extienda el plazo.`;

    // Avisamos aquí mismo (el navegador sigue corriendo): marcamos
    // notificado para que el cron externo en Vercel no mande un push
    // duplicado en su próxima revisión.
    setDoc(doc(db, 'llaves', llave.id), { notificado: true }, { merge: true }).catch(() => { });

    // Si la pestaña está en primer plano, mostramos la alerta de Ionic (más
    // clara y con acción directa). Si está en segundo plano (minimizada u
    // otra pestaña), usamos una notificación real del sistema operativo,
    // que sí se nota aunque no estén viendo la app en ese momento.
    if (document.visibilityState === 'visible' || !('Notification' in window)) {
      await this.mostrarAlertaVencimiento(llave, mensaje);
      return;
    }

    if (Notification.permission === 'granted') {
      const notificacion = new Notification('KeyControl', { body: mensaje });
      notificacion.onclick = () => {
        window.focus();
        notificacion.close();
      };
    } else {
      // Sin permiso del navegador: cuando vuelvan a esta pestaña, igual lo verán
      await this.mostrarAlertaVencimiento(llave, mensaje);
    }
  }

  private async mostrarAlertaVencimiento(llave: Llave, mensaje: string) {
    const alert = await this.alertCtrl.create({
      header: 'KeyControl',
      message: mensaje,
      backdropDismiss: false,
      buttons: [
        {
          text: 'Devolver Llave',
          handler: async () => {
            await this.devolverLlave(llave.id);
          },
        },
        { text: 'Ir a Mis Reservas para ampliar', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  /**
   * Calcula la hora final sumando lecciones + recesos en cascada.
   * Un receso se suma completo si su hora de inicio cae dentro del
   * rango [inicio, finActual], aunque el bloque termine antes de que
   * el receso acabe. Si al sumar un receso el nuevo fin alcanza otro
   * receso, ese también se suma, y así sucesivamente.
   */
  calcularHoraFinal(horaInicio: Date, lecciones: number): Date {
    const tiempoBaseMin = lecciones * MINUTOS_POR_LECCION;
    const inicioMin = horaInicio.getHours() * 60 + horaInicio.getMinutes();
    let finMin = inicioMin + tiempoBaseMin;

    const aplicados = new Set<number>();
    let huboCambio = true;

    while (huboCambio) {
      huboCambio = false;
      for (let i = 0; i < RECESOS.length; i++) {
        if (aplicados.has(i)) continue;
        const receso = RECESOS[i];
        if (receso.horaMinutos >= inicioMin && receso.horaMinutos <= finMin) {
          finMin += receso.duracion;
          aplicados.add(i);
          huboCambio = true;
        }
      }
    }

    const horaFinal = new Date(horaInicio);
    horaFinal.setHours(0, finMin, 0, 0);
    return horaFinal;
  }

  /**
   * Usa una transacción de Firestore: lee y escribe la llave de forma
   * atómica, así que si dos docentes la piden al mismo tiempo, solo
   * uno gana y el otro recibe el error de "ya no está disponible".
   */
  async tomarLlave(aulaId: string, cedula: string, nombre: string, lecciones: number) {
    const yaTiene = this.llaves().some(
      (l) => l.estado === 'ocupada' && l.cedulaResponsable === cedula
    );
    if (yaTiene) {
      return { ok: false, mensaje: 'Ya tienes una llave a tu cargo.' };
    }

    const horaInicio = new Date();
    const horaFinal = this.calcularHoraFinal(horaInicio, lecciones);
    const llaveRef = doc(db, 'llaves', aulaId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(llaveRef);
        if (!snap.exists() || snap.data()['estado'] === 'ocupada') {
          throw new Error('OCUPADA');
        }
        tx.set(llaveRef, {
          estado: 'ocupada',
          nombreResponsable: nombre,
          cedulaResponsable: cedula,
          lecciones,
          extensiones: 0,
          horaInicio: horaInicio.getTime(),
          horaLimite: horaFinal.getTime(),
          notificado: false,
        });
      });
    } catch {
      return { ok: false, mensaje: 'Esta llave ya no está disponible.' };
    }

    if (!this.buscarDocente(cedula)) {
      await setDoc(doc(db, 'docentes', cedula), { nombre });
    }

    this.guardarCedulaActiva(cedula);
    await this.registrarTokenPush(cedula);
    return { ok: true, mensaje: 'Llave registrada correctamente.' };
  }

  async devolverLlave(aulaId: string) {
    const llave = this.llaves().find((l) => l.id === aulaId);
    if (!llave || llave.estado !== 'ocupada') {
      return { ok: false, mensaje: 'Esta llave no está en uso.' };
    }

    const ahora = Date.now();

    // Guardamos el préstamo en el historial antes de limpiar la llave
    await addDoc(this.prestamosCol, {
      cedula: llave.cedulaResponsable,
      nombre: llave.nombreResponsable,
      aula: llave.id,
      lecciones: llave.lecciones ?? 0,
      horaInicio: llave.horaInicio,
      horaLimite: llave.horaLimite,
      horaDevolucion: ahora,
      extensiones: llave.extensiones ?? 0,
    });

    // Reemplaza el documento completo: así se borran nombre/cédula/hora anteriores
    await setDoc(doc(db, 'llaves', aulaId), { estado: 'disponible' });

    if (this.cedulaActiva() === llave.cedulaResponsable) {
      this.guardarCedulaActiva(null);
    }

    return { ok: true, mensaje: 'Llave devuelta correctamente.' };
  }

  async ampliarLlave(aulaId: string, leccionesAdicionales: number) {
    const llave = this.llaves().find((l) => l.id === aulaId);
    if (!llave || llave.estado !== 'ocupada' || !llave.horaLimite) {
      return { ok: false, mensaje: 'No se pudo ampliar el plazo.' };
    }

    const nuevaHoraLimite = this.calcularHoraFinal(
      new Date(llave.horaLimite),
      leccionesAdicionales
    );

    // merge: true -> solo actualiza estos campos, sin borrar el resto
    await setDoc(
      doc(db, 'llaves', aulaId),
      {
        horaLimite: nuevaHoraLimite.getTime(),
        lecciones: (llave.lecciones ?? 0) + leccionesAdicionales,
        extensiones: (llave.extensiones ?? 0) + 1,
        notificado: false, // el nuevo plazo todavía no se ha avisado
      },
      { merge: true }
    );

    return { ok: true, mensaje: 'Plazo ampliado correctamente.' };
  }
}