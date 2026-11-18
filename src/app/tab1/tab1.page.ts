import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonModal,
  IonButton, IonInput, IonSelect, IonSelectOption, IonText,
  IonSegment, IonSegmentButton, IonLabel, IonIcon, IonButtons, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  searchOutline, timeOutline, closeOutline, documentTextOutline,
  personAddOutline, scanOutline,
} from 'ionicons/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LlavesService } from '../services/llaves.service';
import { RostroService } from '../services/rostro.service';
import { Llave, MAX_LECCIONES, MINUTOS_POR_LECCION } from '../models/modelos';

type FiltroEstado = 'todas' | 'disponible' | 'ocupada';

const DIAS_HISTORIAL = 30;
function aIsoFecha(fecha: Date): string {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    DatePipe, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent,
    IonModal, IonButton, IonInput, IonSelect, IonSelectOption, IonText,
    IonSegment, IonSegmentButton, IonLabel, IonIcon, IonButtons,
  ],
})
export class Tab1Page implements OnInit, OnDestroy {
  private servicio = inject(LlavesService);
  private rostroSrv = inject(RostroService);
  private toast = inject(ToastController);

  llaves = this.servicio.llaves;
  opciones = Array.from({ length: MAX_LECCIONES }, (_, i) => i + 1);
  minutosPorLeccion = MINUTOS_POR_LECCION;

  horaActual = signal(new Date());
  private intervalo?: ReturnType<typeof setInterval>;

  textoBusqueda = signal('');
  filtroEstado = signal<FiltroEstado>('todas');

  llavesFiltradas = computed(() => {
    const texto = this.textoBusqueda().trim().toLowerCase();
    const estado = this.filtroEstado();
    return this.llaves().filter((llave) => {
      const coincideTexto = !texto || llave.id.toLowerCase().includes(texto);
      const coincideEstado = estado === 'todas' || llave.estado === estado;
      return coincideTexto && coincideEstado;
    });
  });

  // --- Tomar llave ---
  modalAbierto = false;
  llaveSeleccionada?: Llave;
  cedula = '';
  nombre = '';
  lecciones = 1;

  // --- Ampliar plazo ---
  modalAmpliarAbierto = false;
  llaveAmpliar?: Llave;
  leccionesAdicionales = 1;

  // --- Registrar docente ---
  modalDocenteAbierto = false;
  docCedula = '';
  docNombre = '';
  docTelefono = '';
  docConsentimiento = false;

  // --- Registrar rostro ---
  modalRostroAbierto = false;
  rostroCedula = '';
  private streamRostro?: MediaStream;

  // --- Historial ---
  modalHistorialAbierto = false;
  textoBusquedaHistorial = signal('');
  readonly fechaMinimaHistorial = aIsoFecha(new Date(Date.now() - DIAS_HISTORIAL * 86400000));
  readonly fechaMaximaHistorial = aIsoFecha(new Date());
  fechaDesde = signal(this.fechaMinimaHistorial);
  fechaHasta = signal(this.fechaMaximaHistorial);

  private historialUltimoMes = computed(() => {
    const limite = Date.now() - DIAS_HISTORIAL * 86400000;
    return this.servicio.historial().filter((p) => p.horaDevolucion >= limite);
  });

  historialFiltrado = computed(() => {
    const texto = this.textoBusquedaHistorial().trim().toLowerCase();
    const desde = new Date(this.fechaDesde() + 'T00:00:00').getTime();
    const hasta = new Date(this.fechaHasta() + 'T23:59:59').getTime();
    return this.historialUltimoMes()
      .filter((p) => p.horaDevolucion >= desde && p.horaDevolucion <= hasta)
      .filter((p) => !texto || p.nombre.toLowerCase().includes(texto))
      .sort((a, b) => b.horaDevolucion - a.horaDevolucion);
  });

  constructor() {
    addIcons({
      searchOutline, timeOutline, closeOutline, documentTextOutline,
      personAddOutline, scanOutline,
    });
  }

  ngOnInit() {
    this.intervalo = setInterval(() => this.horaActual.set(new Date()), 1000);
  }

  ngOnDestroy() {
    if (this.intervalo) clearInterval(this.intervalo);
    this.detenerCamaraRostro();
  }

  alBuscar(texto: string) { this.textoBusqueda.set(texto); }
  cambiarFiltro(estado: FiltroEstado) { this.filtroEstado.set(estado); }

  // ---------- Tomar llave (solo docentes registrados) ----------
  abrirModal(llave: Llave) {
    this.llaveSeleccionada = llave;
    this.cedula = '';
    this.nombre = '';
    this.lecciones = 1;
    this.modalAbierto = true;
  }
  cerrarModal() { this.modalAbierto = false; }

  alEscribirCedula(valor: string) {
    this.cedula = valor.replace(/\D/g, '').slice(0, 9);
    this.nombre = this.cedula.length === 9
      ? this.servicio.buscarDocente(this.cedula)?.nombre ?? ''
      : '';
  }

  async confirmar() {
    if (!/^[0-9]{9}$/.test(this.cedula)) {
      this.mostrarMensaje('La cédula debe tener 9 dígitos.');
      return;
    }
    const docente = this.servicio.buscarDocente(this.cedula);
    if (!docente) {
      this.mostrarMensaje('Cédula no registrada. Regístrala primero.');
      return;
    }
    const res = await this.servicio.tomarLlave(
      this.llaveSeleccionada!.id, this.cedula, docente.nombre, this.lecciones
    );
    if (res.ok) this.cerrarModal();
    this.mostrarMensaje(res.mensaje!);
  }

  // ---------- Ampliar plazo ----------
  abrirModalAmpliar(llave: Llave) {
    this.llaveAmpliar = llave;
    this.leccionesAdicionales = 1;
    this.modalAmpliarAbierto = true;
  }
  cerrarModalAmpliar() { this.modalAmpliarAbierto = false; }

  async confirmarAmpliar() {
    const res = await this.servicio.ampliarLlave(this.llaveAmpliar!.id, this.leccionesAdicionales);
    if (res.ok) this.cerrarModalAmpliar();
    this.mostrarMensaje(res.mensaje!);
  }

  // ---------- Registrar docente ----------
  abrirModalDocente() {
    this.docCedula = '';
    this.docNombre = '';
    this.docTelefono = '';
    this.docConsentimiento = false;
    this.modalDocenteAbierto = true;
  }
  cerrarModalDocente() { this.modalDocenteAbierto = false; }

  alEscribirDocCedula(v: string) { this.docCedula = v.replace(/\D/g, '').slice(0, 9); }
  alEscribirDocNombre(v: string) { this.docNombre = v.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]/g, ''); }
  alEscribirDocTelefono(v: string) { this.docTelefono = v.replace(/\D/g, '').slice(0, 8); }

  async guardarDocente() {
    if (!/^[0-9]{9}$/.test(this.docCedula)) {
      this.mostrarMensaje('La cédula debe tener 9 dígitos.');
      return;
    }
    if (!this.docNombre.trim()) {
      this.mostrarMensaje('Escribe el nombre completo.');
      return;
    }
    if (!/^[0-9]{8}$/.test(this.docTelefono)) {
      this.mostrarMensaje('El teléfono debe tener 8 dígitos.');
      return;
    }
    if (!this.docConsentimiento) {
      this.mostrarMensaje('Debe aceptarse el consentimiento.');
      return;
    }
    const res = await this.servicio.registrarDocente(
      this.docCedula, this.docNombre.trim(), '506' + this.docTelefono
    );
    if (res.ok) this.cerrarModalDocente();
    this.mostrarMensaje(res.mensaje);
  }

  // ---------- Registrar rostro ----------
  abrirModalRostro() {
    this.rostroCedula = '';
    this.modalRostroAbierto = true;
  }

  async iniciarCamaraRostro() {
    try {
      const video = document.getElementById('videoRostroAdmin') as HTMLVideoElement;
      this.streamRostro = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      video.srcObject = this.streamRostro;
      await video.play();
      await this.rostroSrv.cargar();
    } catch {
      this.mostrarMensaje('No se pudo acceder a la cámara.');
    }
  }

  async capturarRostro() {
    if (!this.servicio.buscarDocente(this.rostroCedula)) {
      this.mostrarMensaje('Esa cédula no está registrada.');
      return;
    }
    const video = document.getElementById('videoRostroAdmin') as HTMLVideoElement;
    const desc = await this.rostroSrv.descriptor(video);
    if (!desc) {
      this.mostrarMensaje('No se detectó un rostro. Intenta de nuevo.');
      return;
    }
    await this.servicio.guardarRostro(this.rostroCedula, desc);
    this.mostrarMensaje('Rostro registrado correctamente.');
    this.cerrarModalRostro();
  }

  alEscribirRostroCedula(v: string) { this.rostroCedula = v.replace(/\D/g, '').slice(0, 9); }

  private detenerCamaraRostro() {
    this.streamRostro?.getTracks().forEach((t) => t.stop());
    this.streamRostro = undefined;
  }

  cerrarModalRostro() {
    this.detenerCamaraRostro();
    this.modalRostroAbierto = false;
  }

  // ---------- Historial ----------
  abrirHistorial() { this.modalHistorialAbierto = true; }
  cerrarHistorial() { this.modalHistorialAbierto = false; }
  alBuscarHistorial(t: string) { this.textoBusquedaHistorial.set(t); }
  alCambiarFechaDesde(v: string) { this.fechaDesde.set(v); }
  alCambiarFechaHasta(v: string) { this.fechaHasta.set(v); }

  exportarPdf() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('KeyControl - Historial de Préstamos', 14, 16);
    doc.setFontSize(10);
    doc.text(`Del ${this.fechaDesde()} al ${this.fechaHasta()}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Docente', 'Aula', 'Lecciones', 'Inicio', 'Devolución', 'Ampliaciones']],
      body: this.historialFiltrado().map((p) => [
        p.nombre, p.aula, p.lecciones.toString(),
        new Date(p.horaInicio).toLocaleString('es-CR'),
        new Date(p.horaDevolucion).toLocaleString('es-CR'),
        p.extensiones.toString(),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 37, 71] },
    });
    doc.save(`historial-keycontrol-${this.fechaDesde()}-a-${this.fechaHasta()}.pdf`);
  }

  private async mostrarMensaje(message: string) {
    const t = await this.toast.create({ message, duration: 2500, position: 'top' });
    await t.present();
  }
}