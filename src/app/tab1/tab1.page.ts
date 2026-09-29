import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonModal,
  IonButton, IonInput, IonSelect, IonSelectOption, ToastController,
} from '@ionic/angular';
import { LlavesService } from '../services/llaves.service';
import { Llave, MAX_LECCIONES, MINUTOS_POR_LECCION } from '../models/modelos';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    DatePipe, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent,
    IonModal, IonButton, IonInput, IonSelect, IonSelectOption,
  ],
})
export class Tab1Page {
  private servicio = inject(LlavesService);
  private toast = inject(ToastController);

  llaves = this.servicio.llaves;
  opciones = Array.from({ length: MAX_LECCIONES }, (_, i) => i + 1);
  minutosPorLeccion = MINUTOS_POR_LECCION;

  modalAbierto = false;
  llaveSeleccionada?: Llave;
  cedula = '';
  nombre = '';
  lecciones = 1;

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