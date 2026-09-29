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