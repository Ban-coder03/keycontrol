import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonModal,
  IonButton, IonInput, IonSelect, IonSelectOption, IonText,
  IonSegment, IonSegmentButton, IonLabel, IonIcon, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { searchOutline } from 'ionicons/icons';
import { LlavesService } from '../services/llaves.service';
import { Llave, MAX_LECCIONES, MINUTOS_POR_LECCION } from '../models/modelos';

type FiltroEstado = 'todas' | 'disponible' | 'ocupada';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    DatePipe, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent,
    IonModal, IonButton, IonInput, IonSelect, IonSelectOption, IonText,
    IonSegment, IonSegmentButton, IonLabel, IonIcon,
  ],
})
export class Tab1Page implements OnInit, OnDestroy {
  private servicio = inject(LlavesService);
  private toast = inject(ToastController);

  llaves = this.servicio.llaves;
  opciones = Array.from({ length: MAX_LECCIONES }, (_, i) => i + 1);
  minutosPorLeccion = MINUTOS_POR_LECCION;

  // Reloj en vivo
  horaActual = signal(new Date());
  private intervalo?: ReturnType<typeof setInterval>;

  // Filtro de búsqueda
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

  modalAbierto = false;
  llaveSeleccionada?: Llave;
  cedula = '';
  nombre = '';
  lecciones = 1;

  constructor() {
    addIcons({ searchOutline });
  }

  ngOnInit() {
    this.intervalo = setInterval(() => this.horaActual.set(new Date()), 1000);
  }

  ngOnDestroy() {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  alBuscar(texto: string) {
    this.textoBusqueda.set(texto);
  }

  cambiarFiltro(estado: FiltroEstado) {
    this.filtroEstado.set(estado);
  }

  abrirModal(llave: Llave) {
    this.llaveSeleccionada = llave;
    this.cedula = '';
    this.nombre = '';
    this.lecciones = 1;
    this.modalAbierto = true;
  }

  cerrarModal() {
    this.modalAbierto = false;
  }

  // Autocompleta el nombre si la cédula ya existe
  alCambiarCedula() {
    const docente = this.servicio.buscarDocente(this.cedula.trim());
    if (docente) this.nombre = docente.nombre;
  }

  async confirmar() {
    if (!this.cedula.trim() || !this.nombre.trim()) {
      return this.mostrarMensaje('Completa la cédula y el nombre.');
    }
    const res = this.servicio.tomarLlave(
      this.llaveSeleccionada!.id,
      this.cedula.trim(),
      this.nombre.trim(),
      this.lecciones
    );
    if (res.ok) this.cerrarModal();
    this.mostrarMensaje(res.mensaje!);
  }

  private async mostrarMensaje(message: string) {
    const t = await this.toast.create({ message, duration: 2500, position: 'top' });
    await t.present();
  }
}