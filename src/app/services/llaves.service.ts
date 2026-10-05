import { Injectable, signal } from '@angular/core';
import { Docente, Llave, MINUTOS_POR_LECCION, RECESOS } from '../models/modelos';

@Injectable({ providedIn: 'root' })
export class LlavesService {
  private docentes = signal<Docente[]>([
    { cedula: '101110111', nombre: 'Prof. Carlos Gómez' },
  ]);

  readonly llaves = signal<Llave[]>([
    { id: 'Aula 5', estado: 'disponible' },
    { id: 'Aula 6', estado: 'disponible' },
    { id: 'Aula 7', estado: 'disponible' },
    { id: 'Aula 8', estado: 'disponible' },
    { id: 'Aula 9', estado: 'disponible' },
    { id: 'Aula 10', estado: 'disponible' },
    { id: 'Aula 11', estado: 'disponible' },
    { id: 'Aula 13', estado: 'disponible' },
    { id: 'Aula 14', estado: 'disponible' },
    { id: 'Aula 15A', estado: 'disponible' },
    { id: 'Aula 15B', estado: 'disponible' },
    { id: 'Aula 16', estado: 'disponible' },
    { id: 'Aula 17', estado: 'disponible' },
    { id: 'Aula 18', estado: 'disponible' },
    { id: 'Aula 19', estado: 'disponible' },
    { id: 'Aula 20', estado: 'disponible' },
    { id: 'Aula 21', estado: 'disponible' },
    { id: 'Aula 23', estado: 'disponible' },
    { id: 'Aula 24', estado: 'disponible' },
    { id: 'Aula 25', estado: 'disponible' },
    { id: 'Aula 26', estado: 'disponible' },
    { id: 'Aula 27', estado: 'disponible' },
    { id: 'Aula 28', estado: 'disponible' },
    { id: 'Aula 29', estado: 'disponible' },
    { id: 'Aula 1E', estado: 'disponible' },
    { id: 'Aula 2E', estado: 'disponible' },
    { id: 'Aula 3E', estado: 'disponible' },
    { id: 'Aula 4E', estado: 'disponible' },
    { id: 'Aula 5E', estado: 'disponible' },
    { id: 'Aula 6E', estado: 'disponible' },
    { id: 'Aula 7E', estado: 'disponible' },
    { id: 'Aula 8E', estado: 'disponible' },
    { id: 'Aula 9E', estado: 'disponible' },
    { id: 'Aula 10E', estado: 'disponible' },
    { id: 'Aula 11E', estado: 'disponible' },
    { id: 'Aula 12E', estado: 'disponible' },
  ]);

  buscarDocente(cedula: string): Docente | undefined {
    return this.docentes().find((d) => d.cedula === cedula);
  }

  /**
   * Calcula la hora final sumando lecciones + recesos en cascada.
   * Un receso se suma completo si la hora de inicio del receso cae
   * dentro del rango [inicio, finActual], aunque el bloque termine
   * antes de que el receso acabe. Si al sumar un receso el nuevo fin
   * alcanza otro receso, ese también se suma (y así sucesivamente).
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
          huboCambio = true; // puede que ahora alcance otro receso, se revisa de nuevo
        }
      }
    }

    const horaFinal = new Date(horaInicio);
    horaFinal.setHours(0, finMin, 0, 0); // finMin ya incluye horas convertidas a minutos
    return horaFinal;
  }

  tomarLlave(aulaId: string, cedula: string, nombre: string, lecciones: number) {
    const yaTiene = this.llaves().some(
      (l) => l.estado === 'ocupada' && l.cedulaResponsable === cedula
    );
    if (yaTiene) {
      return { ok: false, mensaje: 'Ya tienes una llave a tu cargo.' };
    }

    const llave = this.llaves().find((l) => l.id === aulaId);
    if (!llave || llave.estado === 'ocupada') {
      return { ok: false, mensaje: 'Esta llave ya no está disponible.' };
    }

    if (!this.buscarDocente(cedula)) {
      this.docentes.update((lista) => [...lista, { cedula, nombre }]);
    }

    const horaInicio = new Date();
    const horaFinal = this.calcularHoraFinal(horaInicio, lecciones);

    this.llaves.update((lista) =>
      lista.map((l) =>
        l.id === aulaId
          ? {
            ...l,
            estado: 'ocupada',
            nombreResponsable: nombre,
            cedulaResponsable: cedula,
            horaLimite: horaFinal.getTime(),
          }
          : l
      )
    );
    return { ok: true, mensaje: 'Llave registrada correctamente.' };
  }
}