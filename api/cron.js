const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}
const db = getFirestore();

module.exports = async (req, res) => {
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).send('No autorizado');
  }

  const ahora = Date.now();
  const snap = await db.collection('llaves').where('estado', '==', 'ocupada').get();
  let enviadas = 0;

  for (const d of snap.docs) {
    const l = d.data();
    if (!l.horaLimite || l.horaLimite > ahora || l.notificado === true) continue;

    const docente = await db.collection('docentes').doc(String(l.cedulaResponsable)).get();
    const token = docente.exists ? docente.data().fcmToken : null;

    if (token) {
      try {
        await getMessaging().send({
          token,
          notification: {
            title: 'KeyControl',
            body: `Estimado usuario, su plazo ha vencido (${d.id}). Por favor devolver la llave o extender el plazo.`,
          },
        });
        enviadas++;
      } catch (e) {
        console.warn('Error enviando a', l.cedulaResponsable, e.code);
      }
    }
    await d.ref.update({ notificado: true });
  }

  res.status(200).json({ revisadas: snap.size, enviadas });
};