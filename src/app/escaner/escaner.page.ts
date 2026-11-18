import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AlertController, ToastController } from '@ionic/angular';
import jsQR from 'jsqr';
import { LlavesService } from '../services/llaves.service';
import { RostroService } from '../services/rostro.service';
import { MAX_LECCIONES, MINUTOS_POR_LECCION } from '../models/modelos';

const PREFIJO = 'KC:';
const CLAVE_ADMIN = 'CTPSL';
type Pantalla = 'qr' | 'verificar' | 'lecciones';

@Component({
  selector: 'app-escaner',
  templateUrl: 'escaner.page.html',
  styleUrls: ['escaner.page.scss'],
  imports: [FormsModule],
})
export class EscanerPage {
  private servicio = inject(LlavesService);
  private rostroSrv = inject(RostroService);
  private toast = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);

  private bloqueado = false;
  private streamQr?: MediaStream;
  private intervaloQr?: ReturnType<typeof setInterval>;
  private canvas = document.createElement('canvas');
  private streamRostro?: MediaStream;
  private intervaloRostro?: ReturnType<typeof setInterval>;

  pantalla = signal<Pantalla>('qr');
  camaraActiva = signal(false);
  escaneandoRostro = signal(false);
  terminosAbiertos = signal(false);

  llaveId = '';
  cedula = '';
  nombre = '';
  lecciones = 1;
  opciones = Array.from({ length: MAX_LECCIONES }, (_, i) => i + 1);
  minutos = MINUTOS_POR_LECCION;

  abrirTerminos() { this.terminosAbiertos.set(true); }
  cerrarTerminos() { this.terminosAbiertos.set(false); }

  async activar() {
    try {
      const video = document.getElementById('videoQr') as HTMLVideoElement;
      this.streamQr = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      video.srcObject = this.streamQr;
      await video.play();
      this.camaraActiva.set(true);

      const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
      this.intervaloQr = setInterval(() => {
        if (!video.videoWidth) return;
        this.canvas.width = video.videoWidth;
        this.canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const codigo = jsQR(img.data, img.width, img.height);
        if (codigo?.data) this.alLeer(codigo.data);
      }, 250);
    } catch (e) {
      console.error('Error al iniciar cámara:', e);
      this.mensaje('No se pudo acceder a la cámara. Revisa los permisos.');
    }
  }

  private async detener() {
    if (this.intervaloQr) clearInterval(this.intervaloQr);
    this.intervaloQr = undefined;
    this.streamQr?.getTracks().forEach((t) => t.stop());
    this.streamQr = undefined;
    this.camaraActiva.set(false);
  }

  async ionViewWillLeave() {
    await this.detener();
    this.detenerRostro();
  }

  private async alLeer(texto: string) {
    console.log('QR leído:', texto);
    if (this.bloqueado) return;
    this.bloqueado = true;
    setTimeout(() => (this.bloqueado = false), 3000);

    if (!texto.startsWith(PREFIJO)) {
      this.mensaje('QR no válido.');
      return;
    }
    const id = texto.slice(PREFIJO.length);
    const llave = this.servicio.llaves().find((l) => l.id === id);
    if (!llave) {
      this.mensaje('Llave no encontrada.');
      return;
    }

    if (llave.estado === 'ocupada') {
      const r = await this.servicio.devolverLlave(id);
      this.mensaje(r.ok ? `${id} devuelta correctamente.` : r.mensaje!);
      return;
    }

    await this.detener();
    this.llaveId = id;
    this.cedula = '';
    this.pantalla.set('verificar');
  }

  // --- Reconocimiento facial ---
  async iniciarRostro() {
    this.escaneandoRostro.set(true);
    try {
      const video = document.getElementById('videoRostro') as HTMLVideoElement;
      this.streamRostro = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      video.srcObject = this.streamRostro;
      await video.play();
      await this.rostroSrv.cargar();
      this.intervaloRostro = setInterval(async () => {
        const desc = await this.rostroSrv.descriptor(video);
        if (!desc) return;
        const cedula = this.rostroSrv.buscar(desc, this.servicio.listaDocentes());
        if (cedula) {
          this.detenerRostro();
          this.cedula = cedula;
          this.verificar();
        }
      }, 1000);
    } catch {
      this.detenerRostro();
      this.mensaje('No se pudo acceder a la cámara frontal.');
    }
  }

  detenerRostro() {
    if (this.intervaloRostro) clearInterval(this.intervaloRostro);
    this.intervaloRostro = undefined;
    this.streamRostro?.getTracks().forEach((t) => t.stop());
    this.streamRostro = undefined;
    this.escaneandoRostro.set(false);
  }

  alEscribirCedula(valor: string) {
    this.cedula = valor.replace(/\D/g, '').slice(0, 9);
  }

  verificar() {
    if (!/^[0-9]{9}$/.test(this.cedula)) {
      this.mensaje('La cédula debe tener 9 dígitos.');
      return;
    }
    const docente = this.servicio.buscarDocente(this.cedula);
    if (!docente) {
      this.mensaje('Cédula no registrada. Consulta con el administrador.');
      return;
    }
    this.detenerRostro();
    this.nombre = docente.nombre;
    this.lecciones = 1;
    this.pantalla.set('lecciones');
  }

  async confirmar() {
    const r = await this.servicio.tomarLlave(this.llaveId, this.cedula, this.nombre, this.lecciones);
    this.mensaje(r.mensaje!);
    this.volverAlQr();
  }

  volverAlQr() {
    this.detenerRostro();
    this.pantalla.set('qr');
    setTimeout(() => this.activar(), 150);
  }

  async accesoAdmin() {
    const alert = await this.alertCtrl.create({
      header: 'Acceso Administrador',
      inputs: [{ name: 'clave', type: 'password', placeholder: 'Contraseña' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Entrar',
          handler: async (d) => {
            if (d.clave !== CLAVE_ADMIN) {
              this.mensaje('Contraseña incorrecta.');
              return false;
            }
            await this.detener();
            this.detenerRostro();
            this.router.navigateByUrl('/admin');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async mensaje(message: string) {
    const t = await this.toast.create({ message, duration: 2500, position: 'top' });
    await t.present();
  }
}