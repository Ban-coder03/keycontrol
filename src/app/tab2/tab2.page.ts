import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonModal,
  IonSelect, IonSelectOption, IonInput, IonIcon, IonButtons,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { timeOutline, closeOutline, searchOutline, documentTextOutline } from 'ionicons/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LlavesService } from '../services/llaves.service';
import { MAX_LECCIONES, MINUTOS_POR_LECCION } from '../models/modelos';

const DIAS_HISTORIAL = 30;

function aIsoFecha(fecha: Date): string {
  // yyyy-mm-dd en hora local (no UTC), para que el <input type="date"> no se corra de día
  const offsetMin = fecha.getTimezoneOffset();
  const local = new Date(fecha.getTime() - offsetMin * 60000);
  return local.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  imports: [
    DatePipe, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonModal, IonSelect, IonSelectOption, IonInput, IonIcon, IonButtons,
  ],
})
export class Tab2Page implements OnInit, OnDestroy {
  private servicio = inject(LlavesService);
  private alertCtrl = inject(AlertController);
  private toast = inject(ToastController);

  // La única llave que puede tener este dispositivo, o undefined si no tiene ninguna
  llaveActiva = this.servicio.llaveActiva;

  // Reloj en vivo, para saber si ya venció el plazo
  horaActual = signal(new Date());
  private intervalo?: ReturnType<typeof setInterval>;

  // true/false reactivo: si ya se cruzó la hora límite
  vencida = computed(() => {
    const llave = this.llaveActiva();
    if (!llave?.horaLimite) return false;
    return this.horaActual().getTime() >= llave.horaLimite;
  });

  opciones = Array.from({ length: MAX_LECCIONES }, (_, i) => i + 1);
  minutosPorLeccion = MINUTOS_POR_LECCION;

  modalAmpliarAbierto = false;
  leccionesAdicionales = 1;

  // --- Historial (solo lectura) ---
  modalHistorialAbierto = false;
  textoBusquedaHistorial = signal('');

  // Límites fijos del selector de fechas: no se puede filtrar fuera del último mes
  readonly fechaMinimaHistorial = aIsoFecha(new Date(Date.now() - DIAS_HISTORIAL * 24 * 60 * 60 * 1000));
  readonly fechaMaximaHistorial = aIsoFecha(new Date());

  fechaDesde = signal(this.fechaMinimaHistorial);
  fechaHasta = signal(this.fechaMaximaHistorial);

  // Siempre acotado al último mes, sin importar lo que se filtre después
  private historialUltimoMes = computed(() => {
    const limite = Date.now() - DIAS_HISTORIAL * 24 * 60 * 60 * 1000;
    return this.servicio.historial().filter((p) => p.horaDevolucion >= limite);
  });

  historialFiltrado = computed(() => {
    const texto = this.textoBusquedaHistorial().trim().toLowerCase();
    const desde = new Date(this.fechaDesde() + 'T00:00:00').getTime();
    const hasta = new Date(this.fechaHasta() + 'T23:59:59').getTime();

    return this.historialUltimoMes()
      .filter((p) => p.horaDevolucion >= desde && p.horaDevolucion <= hasta)
      .filter((p) => !texto || p.nombre.toLowerCase().includes(texto))
      .sort((a, b) => b.horaDevolucion - a.horaDevolucion); // más reciente primero
  });

  constructor() {
    addIcons({ timeOutline, closeOutline, searchOutline, documentTextOutline });
  }

  ngOnInit() {
    this.intervalo = setInterval(() => this.horaActual.set(new Date()), 1000);
  }

  ngOnDestroy() {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  async devolver() {
    const llave = this.llaveActiva();
    if (!llave) return;

    const alert = await this.alertCtrl.create({
      header: 'Devolver llave',
      message: `¿Confirmas la devolución de "${llave.id}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Devolver',
          handler: async () => {
            const res = await this.servicio.devolverLlave(llave.id);
            this.mostrarMensaje(res.mensaje!);
          },
        },
      ],
    });
    await alert.present();
  }

  abrirModalAmpliar() {
    this.leccionesAdicionales = 1;
    this.modalAmpliarAbierto = true;
  }

  cerrarModalAmpliar() {
    this.modalAmpliarAbierto = false;
  }

  async confirmarAmpliar() {
    const llave = this.llaveActiva();
    if (!llave) return;

    const res = await this.servicio.ampliarLlave(llave.id, this.leccionesAdicionales);
    if (res.ok) this.cerrarModalAmpliar();
    this.mostrarMensaje(res.mensaje!);
  }

  private async mostrarMensaje(message: string) {
    const t = await this.toast.create({ message, duration: 2500, position: 'top' });
    await t.present();
  }

  // --- Historial ---

  abrirHistorial() {
    this.modalHistorialAbierto = true;
  }

  cerrarHistorial() {
    this.modalHistorialAbierto = false;
  }

  alBuscarHistorial(texto: string) {
    this.textoBusquedaHistorial.set(texto);
  }

  alCambiarFechaDesde(valor: string) {
    this.fechaDesde.set(valor);
  }

  alCambiarFechaHasta(valor: string) {
    this.fechaHasta.set(valor);
  }

  exportarPdf() {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('KeyControl - Historial de Préstamos', 14, 16);
    doc.setFontSize(10);
    doc.text(`Del ${this.fechaDesde()} al ${this.fechaHasta()}`, 14, 22);

    const filas = this.historialFiltrado().map((p) => [
      p.nombre,
      p.aula,
      p.lecciones.toString(),
      new Date(p.horaInicio).toLocaleString('es-CR'),
      new Date(p.horaDevolucion).toLocaleString('es-CR'),
      p.extensiones.toString(),
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['Docente', 'Aula', 'Lecciones', 'Inicio', 'Devolución', 'Ampliaciones']],
      body: filas,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 37, 71] }, // azul marino, mismo tono de la app
    });

    doc.save(`historial-keycontrol-${this.fechaDesde()}-a-${this.fechaHasta()}.pdf`);
  }
}