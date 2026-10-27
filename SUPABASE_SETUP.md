# Conectar Motherfunky's Tickets a Supabase

## 1. Crear el proyecto

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. En `Project Settings > API`, copia `Project URL` y la clave `anon public`.
3. No copies ni publiques la clave `service_role`.

## 2. Crear la base de datos

1. Abre `SQL Editor` en el proyecto.
2. Ejecuta el contenido completo de `supabase/schema.sql`.
3. En `Authentication > Users`, crea un usuario para cada persona de confianza que vaya a emitir o validar boletas. Marca la cuenta como confirmada si Supabase lo solicita.
4. Desactiva los registros públicos de email/password si el equipo no necesita crear sus propias cuentas.

El esquema permite que usuarios autenticados administren boletas. El enlace público solo ejecuta `public_ticket(uuid)`, que no expone teléfono, notas ni el token privado de la boleta.

## 3. Configurar la aplicación

Edita `supabase-config.js`:

```js
window.MF_SUPABASE_CONFIG = {
  url: "https://tu-proyecto.supabase.co",
  anonKey: "tu-clave-anon-publica"
};
```

Recarga `index.html`. El indicador superior cambiará de `Modo local` a `Supabase / inicia sesión`. Inicia sesión con el usuario creado en el paso anterior.

## 4. Publicar por HTTPS

Sube todos los archivos del proyecto a un hosting estático con HTTPS, por ejemplo GitHub Pages, Netlify, Cloudflare Pages o Vercel. La URL final debe cargar `index.html` y conservar `boleta.html` en la misma carpeta.

Usa el dominio final en `Authentication > URL Configuration` como `Site URL`. Agrega también ese dominio a `Redirect URLs` si se habilitan flujos de recuperación de contraseña.

`localhost` y `127.0.0.1` sirven para desarrollo, pero una boleta compartida desde ahí no puede abrirse en otro teléfono. La cámara y la instalación PWA también requieren HTTPS fuera de localhost.

## 5. Verificar antes del evento

1. Inicia sesión desde el panel publicado y crea una boleta de prueba.
2. Abre `Ver versión móvil` desde otro teléfono: el enlace debe incluir `?t=<uuid>`.
3. Escanea el QR como personal del evento.
4. Recarga la boleta pública: debe mostrar `USADA`.
5. Vuelve a escanearla: debe rechazar el segundo ingreso.

Sin Supabase configurado, la aplicación conserva el modo local para demostración. Ese modo no sincroniza boletas entre dispositivos ni debe usarse para validar un evento real.
