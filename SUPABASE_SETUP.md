# Conectar Motherfunky's Tickets a Supabase

## 1. Crear el proyecto

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. En `Project Settings > API`, copia `Project URL` y la clave `anon public`.
3. No copies ni publiques la clave `service_role`.

## 2. Crear la base de datos

1. Abre `SQL Editor` en el proyecto.
2. Ejecuta el contenido completo de `supabase/schema.sql`.
3. Ejecuta después `supabase/events-migration.sql` para habilitar múltiples eventos. Crea el evento inicial, enlaza las boletas existentes y conserva sus enlaces públicos.
4. En `Authentication > Users`, crea y confirma `losmotherfunkys@gmail.com`; esa cuenta será la única autorizada para ver, emitir y administrar boletas, además de escanear y validar QR. Las cuentas adicionales solo pueden administrar eventos.
5. Desactiva los registros públicos de email/password si el equipo no necesita crear sus propias cuentas.

Solo `losmotherfunkys@gmail.com` puede consultar, crear, editar o eliminar filas de `event_tickets`. Supabase aplica esa regla con RLS; ocultar la interfaz no es la única protección. El enlace público solo ejecuta `public_ticket(uuid)`, que no expone teléfono, notas ni el token privado de la boleta.

Los eventos pueden gestionarse por cualquier usuario autenticado del equipo. La cuenta `losmotherfunkys@gmail.com` es la única que puede abrir el escáner, registrar ingresos por QR o acceder a información privada de boletas; esas restricciones también se aplican dentro de Supabase.

Las personas sin credenciales pueden abrir `boleta.html` con su enlace personal y usar `Ver eventos` para consultar la programación publicada. Si cambia el correo administrador, actualiza `public.is_event_admin()` en `supabase/events-migration.sql` y ejecuta el archivo de nuevo.

### Si el proyecto ya estaba conectado

No ejecutes de nuevo el esquema completo. Ejecuta únicamente `supabase/events-migration.sql` en `SQL Editor` antes de publicar esta versión. La migración mantiene temporalmente la validación de una PWA anterior mientras las instalaciones reciben la actualización.

Antes de activar un evento con otro nombre, recarga o reinstala el panel en todos los dispositivos de puerta. La versión anterior filtra por un nombre fijo y no puede separar correctamente los eventos nuevos en su lista local.

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

1. Sin iniciar sesión, abre `Ver eventos` y verifica que se muestre la programación; el lector QR debe permanecer oculto.
2. Con otra cuenta autenticada, verifica que se puedan gestionar eventos pero no aparezcan boletas, emisión ni escáner.
3. Inicia sesión con `losmotherfunkys@gmail.com`, crea una boleta de prueba para el evento activo.
4. Abre `Ver versión móvil` desde otro teléfono: el enlace debe incluir `?t=<uuid>` y mostrar la información del evento.
5. Con `losmotherfunkys@gmail.com`, abre el lector QR y valida la boleta.
6. Recarga la boleta pública: debe mostrar `USADA`.
7. Intenta consultar o crear una boleta con otra cuenta autenticada: Supabase debe rechazarlo.

Sin Supabase configurado, la aplicación conserva una vista pública local de eventos. Las herramientas privadas de boletas y el escáner permanecen ocultos y no debe usarse para validar un evento real.
