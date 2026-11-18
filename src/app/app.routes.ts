import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'escaner', pathMatch: 'full' },
  {
    path: 'escaner',
    loadComponent: () => import('./escaner/escaner.page').then((m) => m.EscanerPage),
  },
  {
    path: 'qrs',
    loadComponent: () => import('./qrs/qrs.page').then((m) => m.QrsPage),
  },
  {
    path: 'admin',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
