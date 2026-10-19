  import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
  import { DatePipe } from '@angular/common';
  import { FormsModule } from '@angular/forms';
  import {
    IonHeader, IonToolbar, IonTitle, IonContent, IonModal,
    IonButton, IonInput, IonSelect, IonSelectOption, IonText, IonNote,
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
      IonModal, IonButton, IonInput, IonSelect, IonSelectOption, IonText, IonNote,
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

    // Teclas que siempre se permiten, sin importar el campo (navegación/edición)
    private readonly TECLAS_PERMITIDAS = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End',
    ];

    // Bloquea la tecla ANTES de que se escriba (más confiable que limpiar
    // después, porque evita que compita con la actualización de ngModel).
    bloquearTeclaCedula(event: KeyboardEvent) {
      if (this.TECLAS_PERMITIDAS.includes(event.key)) return;
      if (event.ctrlKey || event.metaKey) return; // permite Ctrl+C, Ctrl+V, Ctrl+A...
      if (!/^[0-9]$/.test(event.key)) {
        event.preventDefault();
      }
    }

    bloquearTeclaNombre(event: KeyboardEvent) {
      if (this.TECLAS_PERMITIDAS.includes(event.key)) return;
      if (event.ctrlKey || event.metaKey) return;
      if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü ]$/.test(event.key)) {
        event.preventDefault();
      }
    }

    // Si pegan texto (Ctrl+V), el teclado no interviene, así que se limpia aparte
    pegarCedula(event: ClipboardEvent) {
      event.preventDefault();
      const texto = event.clipboardData?.getData('text') ?? '';
      this.alEscribirCedula(this.cedula + texto);
    }

    pegarNombre(event: ClipboardEvent) {
      event.preventDefault();
      const texto = event.clipboardData?.getData('text') ?? '';
      this.alEscribirNombre(this.nombre + texto);
    }

    // Limpieza de respaldo (por si algo se cuela por otra vía, como autocompletado).
    // Autocompleta el nombre en cuanto la cédula queda completa (9 dígitos).
    alEscribirCedula(valor: string) {
      const limpio = valor.replace(/\D/g, '').slice(0, 9);
      this.cedula = limpio;

      if (limpio.length === 9) {
        const docente = this.servicio.buscarDocente(limpio);
        if (docente) this.nombre = docente.nombre;
      }
    }

    alEscribirNombre(valor: string) {
      this.nombre = valor.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]/g, '');
    }

    async confirmar() {
      const cedula = this.cedula.trim();
      const nombre = this.nombre.trim();

      // Segunda capa de validación: nunca confiar solo en lo que deja escribir la UI.
      if (!/^[0-9]{9}$/.test(cedula)) {
        return this.mostrarMensaje('La cédula debe tener exactamente 9 dígitos numéricos.');
      }
      if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]+$/.test(nombre)) {
        return this.mostrarMensaje('El nombre solo puede contener letras y espacios.');
      }

      const res = await this.servicio.tomarLlave(
        this.llaveSeleccionada!.id,
        cedula,
        nombre,
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