// Service Worker de Firebase Cloud Messaging.
// Este archivo corre FUERA de Angular, en segundo plano, incluso con la
// pestaña cerrada (mientras el navegador siga abierto). Por eso usa
// importScripts en vez de "import", y NO puede importar nada del proyecto.
//
// IMPORTANTE: debe quedar servido exactamente en /firebase-messaging-sw.js
// (la raíz del sitio), no dentro de una subcarpeta.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Mismos valores de environment.ts > firebaseConfig.
// Se repiten aquí a propósito: un Service Worker no puede importar el
// environment de Angular, así que esta es la única copia que necesita vivir
// en dos lugares. Si cambias el proyecto de Firebase, actualiza ambos.
firebase.initializeApp({
  apiKey: 'AIzaSyBKl06-Qo-qp_SyuInZSKtZxP3eVETdD-c',
  authDomain: 'keycontrol-55fb6.firebaseapp.com',
  projectId: 'keycontrol-55fb6',
  storageBucket: 'keycontrol-55fb6.firebasestorage.app',
  messagingSenderId: '962373358303',
  appId: '1:962373358303:web:96bb948114a108307ccf6a',
});

const messaging = firebase.messaging();

// Se dispara cuando llega un push y la pestaña NO está en primer plano.
// Firebase ya muestra la notificación del sistema automáticamente con
// los datos que mandemos desde el servidor (ver /api más adelante),
// así que aquí solo definimos qué pasa si el usuario le hace clic.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) return cliente.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});