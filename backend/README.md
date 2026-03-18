# Lion Barber – API

Backend en Node.js + Express con **MySQL** para la agenda de Lion Barber.

## Requisitos

- Node.js 18+
- **MySQL** 8 (o MariaDB)

## Configuración

1. Crear la base de datos en MySQL:

```sql
CREATE DATABASE lion_barber CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Copiar `.env.example` a `.env` y completar:

```bash
cp .env.example .env
```

- `MYSQL_*`: conexión a MySQL.
- `JWT_SECRET`: clave secreta para los tokens de sesión (cambiar en producción).
- `GOOGLE_CLIENT_ID`: Client ID de tu aplicación web de Google (Google Cloud Console → APIs y servicios → Credenciales). Debe ser el mismo que `VITE_GOOGLE_CLIENT_ID` en el frontend.
- `ADMIN_EMAIL`: emails de administradores separados por coma (ej. `admin@lionbarber.com`).

## Cómo ejecutar

```bash
npm install
npm run dev
```

La API queda en **http://localhost:4000**. Al arrancar se crean las tablas y se cargan servicios y barberos si están vacías.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servidor |
| POST | `/api/auth/google` | Login con token de Google → devuelve JWT + usuario |
| GET | `/api/auth/me` | Usuario actual (header `Authorization: Bearer <token>`) |
| GET | `/api/barbers` | Lista de barberos |
| GET | `/api/services` | Lista de servicios |
| GET | `/api/appointments` | Citas (query: `date`, `barberId`) |
| GET | `/api/appointments/availability?date=&barberId=` | Horarios disponibles |
| GET | `/api/appointments/:id` | Una cita |
| POST | `/api/appointments` | Crear cita |
| PATCH | `/api/appointments/:id` | Actualizar cita |
| DELETE | `/api/appointments/:id` | Eliminar cita |

Los datos se persisten en **MySQL**.
