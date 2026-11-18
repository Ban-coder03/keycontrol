import { Injectable } from '@angular/core';
import * as faceapi from 'face-api.js';

@Injectable({ providedIn: 'root' })
export class RostroService {
  private listo?: Promise<void>;

  cargar() {
    this.listo ??= (async () => {
      const ruta = '/assets/modelos';
      await faceapi.nets.tinyFaceDetector.loadFromUri(ruta);
      await faceapi.nets.faceLandmark68Net.loadFromUri(ruta);
      await faceapi.nets.faceRecognitionNet.loadFromUri(ruta);
    })();
    return this.listo;
  }

  async descriptor(video: HTMLVideoElement): Promise<number[] | null> {
    await this.cargar();
    const r = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    return r ? Array.from(r.descriptor) : null;
  }

  buscar(desc: number[], docentes: { cedula: string; rostro?: number[] }[]): string | null {
    let mejor: string | null = null;
    let menor = 0.5;
    for (const d of docentes) {
      if (!d.rostro) continue;
      const dist = faceapi.euclideanDistance(desc, d.rostro);
      if (dist < menor) { menor = dist; mejor = d.cedula; }
    }
    return mejor;
  }
}