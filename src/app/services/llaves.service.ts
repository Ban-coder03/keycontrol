import { Injectable, signal } from '@angular/core';
import { Docente, Llave, MINUTOS_POR_LECCION } from '../models/modelos';

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

    const horaLimite = Date.now() + lecciones * MINUTOS_POR_LECCION * 60_000;

    this.llaves.update((lista) =>
      lista.map((l) =>
        l.id === aulaId
          ? { ...l, estado: 'ocupada', nombreResponsable: nombre, cedulaResponsable: cedula, horaLimite }
          : l
      )
    );
    return { ok: true, mensaje: 'Llave registrada correctamente.' };
  }
}