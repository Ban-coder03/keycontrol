export interface Docente {
  cedula: string;
  nombre: string;
}

export interface Llave {
  id: string;               
  estado: 'disponible' | 'ocupada';
  nombreResponsable?: string;
  cedulaResponsable?: string;
  horaLimite?: number;       
}

export const MINUTOS_POR_LECCION = 40;
export const MAX_LECCIONES = 13;
export interface Receso {
  horaMinutos: number; // minutos desde medianoche, ej. 9:00 = 540
  duracion: number;    // minutos que se suman
}

// 9:00, 12:00, 2:00pm, 4:10pm
export const RECESOS: Receso[] = [
  { horaMinutos: 9 * 60, duracion: 20 },
  { horaMinutos: 12 * 60, duracion: 40 },
  { horaMinutos: 14 * 60, duracion: 10 },
  { horaMinutos: 16 * 60 + 10, duracion: 10 },
];