import { Injectable, signal } from '@angular/core';
import { collection, doc, onSnapshot, runTransaction, addDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Docente, Llave, Prestamo, MINUTOS_POR_LECCION, RECESOS } from '../models/modelos';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

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
  private docentesCol = collection(db, 'docentes');
  private llavesCol = collection(db, 'llaves');
  private prestamosCol = collection(db, 'prestamos');

  private docentes = signal<Docente[]>([]);
  readonly listaDocentes = this.docentes.asReadonly();

  readonly llaves = signal<Llave[]>([]);
  readonly historial = signal<Prestamo[]>([]);

  constructor() {
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

  buscarDocente(cedula: string): Docente | undefined {
    return this.docentes().find((d) => d.cedula === cedula);
  }

  async registrarDocente(cedula: string, nombre: string, telefono: string) {
    if (this.buscarDocente(cedula)) {
      return { ok: false, mensaje: 'Esa cédula ya está registrada.' };
    }
    await setDoc(doc(db, 'docentes', cedula), { nombre, telefono });
    return { ok: true, mensaje: 'Docente registrado correctamente.' };
  }

  async guardarRostro(cedula: string, rostro: number[]) {
    await setDoc(doc(db, 'docentes', cedula), { rostro }, { merge: true });
  }

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
          aviso10: false,
          avisoVencido: false,
        });
      });
    } catch {
      return { ok: false, mensaje: 'Esta llave ya no está disponible.' };
    }

    if (!this.buscarDocente(cedula)) {
      await setDoc(doc(db, 'docentes', cedula), { nombre });
    }

    return { ok: true, mensaje: 'Llave registrada correctamente.' };
  }

  async devolverLlave(aulaId: string) {
    const llave = this.llaves().find((l) => l.id === aulaId);
    if (!llave || llave.estado !== 'ocupada') {
      return { ok: false, mensaje: 'Esta llave no está en uso.' };
    }

    await addDoc(this.prestamosCol, {
      cedula: llave.cedulaResponsable,
      nombre: llave.nombreResponsable,
      aula: llave.id,
      lecciones: llave.lecciones ?? 0,
      horaInicio: llave.horaInicio,
      horaLimite: llave.horaLimite,
      horaDevolucion: Date.now(),
      extensiones: llave.extensiones ?? 0,
    });

    await setDoc(doc(db, 'llaves', aulaId), { estado: 'disponible' });

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

    await setDoc(
      doc(db, 'llaves', aulaId),
      {
        horaLimite: nuevaHoraLimite.getTime(),
        lecciones: (llave.lecciones ?? 0) + leccionesAdicionales,
        extensiones: (llave.extensiones ?? 0) + 1,
        aviso10: false,
        avisoVencido: false,
      },
      { merge: true }
    );

    return { ok: true, mensaje: 'Plazo ampliado correctamente.' };
  }
}