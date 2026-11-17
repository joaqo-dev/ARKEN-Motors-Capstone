'use server';

import { redirect } from 'next/navigation';
import { config } from '../../lib/config';

// Baja (o reactivación) de recordatorios desde el enlace del correo (Módulo 18).
// Va del servidor de Next a la API; el token firmado identifica al cliente.
export async function cambiarRecordatorios(datos: FormData) {
  const token = String(datos.get('token') ?? '');
  const acepta = datos.get('acepta') === 'si';
  const res = await fetch(`${config.apiUrl}/publico/recordatorios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, acepta }),
    cache: 'no-store',
  }).catch(() => null);
  const resultado = res?.ok ? (acepta ? 'activado' : 'baja') : 'error';
  redirect(`/recordatorios?t=${encodeURIComponent(token)}&listo=${resultado}`);
}
