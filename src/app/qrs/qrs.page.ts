import { Component, inject, OnInit, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import QRCode from 'qrcode';
import { LlavesService } from '../services/llaves.service';

@Component({
  selector: 'app-qrs',
  imports: [IonContent],
  template: `
    <ion-content class="ion-padding">
      <button (click)="imprimir()">Imprimir</button>
      <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:16px">
        @for (q of qrs(); track q.id) {
          <div style="text-align:center;width:170px;page-break-inside:avoid">
            <img [src]="q.img" width="150" height="150" />
            <div><strong>{{ q.id }}</strong></div>
          </div>
        }
      </div>
    </ion-content>`,
})
export class QrsPage implements OnInit {
  private servicio = inject(LlavesService);
  qrs = signal<{ id: string; img: string }[]>([]);

  async ngOnInit() {
    setTimeout(async () => {
      const lista = await Promise.all(
        this.servicio.llaves().map(async (l) => ({
          id: l.id,
          img: await QRCode.toDataURL('KC:' + l.id, { margin: 1, width: 300 }),
        }))
      );
      this.qrs.set(lista);
    }, 1500); // espera a que Firestore cargue
  }
  imprimir() { window.print(); }
}