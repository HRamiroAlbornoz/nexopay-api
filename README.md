# NexoPay API

Backend de NexoPay, una billetera digital multi-moneda. Construido con Express.js + TypeScript + PostgreSQL.

## Stack

- **Runtime**: Node.js
- **Framework**: Express.js + TypeScript
- **Base de datos**: PostgreSQL (desplegado en Railway)
- **Autenticación**: JWT + bcrypt
- **Tasas de cambio**: Frankfurter API (gratuita, sin API key)
- **Chatbot**: Google Gemini 2.5 Flash
- **Testing**: Vitest

## Requisitos previos

- Node.js 18 o superior
- Git
- Una instancia de PostgreSQL corriendo (local o en Railway)

## Instalación y setup local

**1. Clonar el repositorio**

```bash
git clone https://github.com/HRamiroAlbornoz/nexopay-api.git
cd nexopay-api
```

**2. Instalar dependencias**

```bash
npm install
```

**3. Configurar variables de entorno**

Copiar el archivo de ejemplo y completar los valores:

```bash
cp .env.example .env
```

Editar `.env` con los datos reales (ver sección de variables de entorno más abajo).

**4. Crear las tablas en la base de datos**

```bash
npm run migrate
```

**5. Cargar datos de demo (opcional)**

```bash
npm run seed
```

Crea dos usuarios de prueba con balances y transacciones precargadas para ver la app funcionando desde el primer arranque.

Credenciales de los usuarios de prueba:
- `hernan@nexopay.com` / `Test1234`
- `richard@nexopay.com` / `Test1234`

**6. Arrancar el servidor en desarrollo**

```bash
npm run dev
```

El servidor queda disponible en `http://localhost:3000`.

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor en desarrollo con recarga automática |
| `npm run build` | Compila TypeScript a JavaScript en `dist/` |
| `npm start` | Arranca el servidor compilado (producción) |
| `npm run migrate` | Crea las tablas en la base de datos |
| `npm run seed` | Carga datos de demo en la base de datos |
| `npm test` | Corre los tests con Vitest |

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de conexión a PostgreSQL |
| `JWT_SECRET` | Secreto para firmar los tokens JWT (mínimo 32 caracteres) |
| `JWT_EXPIRES_IN` | Duración del access token (ej: `15m`) |
| `PORT` | Puerto del servidor (por defecto `3000`) |
| `NODE_ENV` | Entorno: `development` o `production` |
| `GEMINI_API_KEY` | API key de Google Gemini (https://aistudio.google.com/app/apikey) |
| `CORS_ORIGIN` | Origen permitido para CORS (URL del frontend) |

## Estructura del proyecto

```
nexopay-api/
├── src/
│   ├── controllers/        # Lógica de negocio por dominio
│   │   ├── auth/
│   │   ├── wallet/
│   │   ├── transactions/
│   │   ├── shared-expenses/
│   │   ├── savings-goals/
│   │   ├── chatbot/
│   │   └── rates/
│   ├── routes/             # Definición de rutas HTTP
│   ├── queries/            # Consultas SQL por entidad
│   ├── middleware/         # Auth, errores y validación
│   ├── helpers/            # JWT, bcrypt, cálculos de moneda
│   ├── api-calls/          # Integración con Frankfurter API
│   ├── types/              # Interfaces TypeScript
│   ├── db/
│   │   ├── migrations/     # Scripts SQL de creación de tablas
│   │   ├── seeds/          # Datos de demo
│   │   ├── connection.ts   # Pool de conexión a PostgreSQL
│   │   └── setup.ts        # Ejecuta las migraciones en orden
│   └── app.ts              # Configuración de Express
├── tests/                  # Tests de Vitest
├── index.ts                # Entry point del servidor
├── .env.example            # Plantilla de variables de entorno
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

## Equipo

| Nombre | Rol |
|---|---|
| Hernán Ramiro Albornoz | Backend |
| Hernán Macias Hernández | Backend |
| Richard Anderson González | Frontend |
