# Camuflaje 🎭

Juego de fiesta para 2-8 jugadores, solo con el móvil. Cada ronda hay una
pregunta con un hueco: todos inventan una respuesta falsa creíble, se
mezclan con la real, y hay que votar cuál es la verdadera.

## 1. Crear el proyecto en Firebase

1. Ve a https://console.firebase.google.com y crea un proyecto nuevo
   (o reutiliza uno que ya tengas).
2. En el menú lateral, entra en **Build > Realtime Database** (NO Firestore)
   y pulsa "Crear base de datos".
3. Elige una región (europe-west1 va bien desde España) y arranca en
   **modo de prueba** (acceso abierto 30 días — luego aplicamos las reglas
   de abajo para dejarlo permanente).
4. Ve a ⚙️ **Configuración del proyecto > General**, baja hasta "Tus apps",
   pulsa el icono `</>` (Web), dale un nombre y copia el objeto `firebaseConfig`
   que te aparece.
5. Pega ese objeto en `firebase-config.js`, sustituyendo los valores de
   ejemplo.

## 2. Reglas de seguridad de la base de datos

Es un juego casual sin login, así que no hay autenticación de usuarios.
Para que no quede abierta indefinidamente al expirar el modo de prueba,
ve a **Realtime Database > Reglas** y pon esto:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Esto permite leer/escribir cualquier sala por su código de 4 letras —
suficiente para un juego de mesa entre amigos, ya que nadie va a estar
adivinando códigos al azar. Si en el futuro quieres más seguridad, se
puede añadir Firebase Anonymous Auth, pero para esto es overkill.

## 3. Probar en local

Los módulos de JavaScript (`type="module"`) no funcionan abriendo el
`index.html` directamente con doble clic (protocolo `file://`). Necesitas
un servidor local sencillo. Desde la carpeta del proyecto:

```bash
python3 -m http.server 8080
```

Y abre `http://localhost:8080` en el móvil y el ordenador (si están en la
misma red). Para probarlo con varios móviles de verdad, lo más cómodo es
ya subirlo a GitHub Pages (paso 4) y usar la URL real.

## 4. Publicar en GitHub Pages

Igual que hiciste con Comandero CRV:

```bash
git init
git add .
git commit -m "Camuflaje: primera versión jugable"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/camuflaje.git
git push -u origin main
```

Luego en GitHub: **Settings > Pages > Branch: main** y guardar. En un par
de minutos tendrás la URL pública (tipo `https://tu_usuario.github.io/camuflaje/`).

## 5. Cómo se juega

1. Un jugador pulsa "Crear sala" → le sale un código de 4 letras.
2. El resto entra desde su móvil, pestaña "Unirme", escribe el código.
3. Con 2+ jugadores, el que creó la sala (el "anfitrión", con 👑) pulsa
   "Empezar partida".
4. Cada ronda: todos escriben su mentira → el anfitrión pasa a votación →
   todos votan → el anfitrión revela resultados → siguiente ronda.
5. Tras 5 rondas, marcador final. El anfitrión puede pulsar "Jugar otra vez"
   para resetear puntuaciones sin tener que crear sala nueva.

## Estructura de archivos

```
index.html          → estructura de todas las pantallas
style.css            → diseño visual (paleta morado/lima/rosa)
app.js               → toda la lógica del juego y Firebase
questions.js         → banco de preguntas (añade las que quieras)
firebase-config.js   → tus credenciales de Firebase (paso 1)
manifest.json        → hace que sea instalable como app
service-worker.js    → cacheo básico para que cargue rápido
icons/               → iconos del PWA
```

## Limitaciones conocidas / posibles mejoras futuras

- **Sin anti-trucos real**: como todo corre en el navegador, alguien con
  conocimientos podría mirar el código fuente y ver las respuestas
  correctas en `questions.js`. Es un juego de honor entre amigos, no hay
  forma de evitarlo del todo sin un backend propio (que sería matar
  moscas a cañonazos para esto).
- **Si el anfitrión cierra la pestaña a media partida**, nadie puede avanzar
  de fase (no hay traspaso de "anfitrión" automático). Se podría añadir
  con `onDisconnect()` de Firebase más adelante si da problemas en la práctica.
- **Las salas no se borran solas**: con el tiempo se acumulan en la base de
  datos. Para una base de datos personal de uso esporádico no pasa nada,
  pero si lo usas mucho podrías añadir una función que borre salas con
  `createdAt` de hace más de 24h.
- **Banco de preguntas**: ahora mismo tiene 20. Cuantas más añadas a
  `questions.js`, menos se repetirán las partidas.
