# NexoPay API

Backend de NexoPay, una billetera digital multi-moneda. Construido con Express.js + TypeScript + PostgreSQL.

## Stack

- **Runtime**: Node.js
- **Framework**: Express.js + TypeScript
- **Base de datos**: PostgreSQL (desplegado en Railway)
- **Autenticación**: JWT + bcrypt, con inicio de sesión con Google (verificación de ID token)
- **Tasas de cambio**: ExchangeRate-API (`open.er-api.com`, gratuita, sin API key)
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
| `JWT_EXPIRES_IN` | Duración del token (ej: `7d` — debe coincidir con el `maxAge` de la cookie) |
| `PORT` | Puerto del servidor (por defecto `3000`) |
| `NODE_ENV` | Entorno: `development` o `production` |
| `GEMINI_API_KEY` | API key de Google Gemini (https://aistudio.google.com/app/apikey) |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth (público, debe coincidir con el del frontend) — usado para verificar el ID token de "Continuar con Google" |
| `FRONTEND_URL` | Origen permitido para CORS (URL del frontend) |

Todas se validan con Zod al arrancar el servidor (`src/env.ts`) — si falta alguna crítica, la app no levanta.

## Endpoints de la API

Todas las rutas (salvo `/health`, `/api/auth/register`, `/api/auth/login` y `/api/auth/google`) requieren estar autenticado: cookie httpOnly `nexopay_token` (la setean `register`, `login` y `google`). Los errores siempre responden con el formato `{ code, message, details? }`.

### Health check

| Método | Ruta | Auth |
|---|---|---|
| GET | `/health` | No |

- **Respuesta 200**: `{ status: "ok" }`

### Auth (`/api/auth`)

**POST `/register`**
- Body: `{ email, password (8-72 caracteres), first_name (2-100), last_name (2-100) }`
- 201: `{ user: { id, email, first_name, last_name } }` (setea la cookie de sesión)
- Errores: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`

**POST `/login`**
- Body: `{ email, password }`
- 200: `{ user: { id, email, first_name, last_name } }` (setea la cookie de sesión)
- Errores: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`

**POST `/google`** — inicio de sesión con Google (verificación de ID token, sin contraseña)
- Body: `{ credential }` (ID token de Google Identity Services)
- 200: `{ user: { id, email, first_name, last_name } }` si la cuenta ya existía (logueada o recién vinculada) · 201 si se creó una cuenta nueva (en ambos casos setea la cookie de sesión)
- Errores: `400 VALIDATION_ERROR`, `401 INVALID_GOOGLE_TOKEN`, `403 GOOGLE_EMAIL_NOT_VERIFIED` (ya existe una cuenta con ese email, pero Google no la reporta verificada), `404 USER_NOT_FOUND`/`409 EMAIL_TAKEN` (solo bajo condición de carrera)
- Una cuenta creada solo por Google no tiene contraseña: si intenta loguearse luego con `/login`, recibe el mismo `401 INVALID_CREDENTIALS` genérico que una contraseña incorrecta (a propósito, para no revelar que es Google-only)

**POST `/logout`** (auth requerida)
- Sin body
- 200: `{ message: "Sesión cerrada" }` (limpia la cookie de sesión)

**GET `/me`** (auth requerida)
- 200: `{ id, email, first_name, last_name }`
- Errores: `404 USER_NOT_FOUND`

### Wallet (`/api/wallet`, auth requerida)

**GET `/`**
- 200: `{ id, created_at }`
- Errores: `404 WALLET_NOT_FOUND`

**GET `/balances`**
- 200: `[{ currency_code, amount }]` — un objeto por cada moneda soportada (`ARS`, `USD`, `EUR`)
- Errores: `404 WALLET_NOT_FOUND`

**GET `/balance-history`** — evolución diaria del balance, reconstruida a partir del ledger de transacciones (no hay tabla de snapshots, se calcula al vuelo)
- Query: `{ days (default 7, máximo 90) }`
- 200: `{ history: [{ date: "YYYY-MM-DD", ARS, USD, EUR }] }` — un punto por día, ordenado del más viejo al más nuevo; los días sin movimientos repiten el último balance conocido. Las fechas se calculan en UTC.
- Errores: `400 VALIDATION_ERROR`, `404 WALLET_NOT_FOUND`

**GET `/lookup`** — busca la wallet de otra cuenta por email (para elegir con quién compartir un gasto). Máximo 30 búsquedas cada 15 minutos por usuario.
- Query: `{ email }`
- 200: `{ wallet_id, first_name, last_name }` — nunca devuelve el email ni otros datos del usuario buscado
- Errores: `400 VALIDATION_ERROR`, `404 RECIPIENT_NOT_FOUND`, `422 CANNOT_SHARE_WITH_SELF` (el email es el del propio usuario autenticado), `429 TOO_MANY_REQUESTS`

### Transacciones (`/api/transactions`, auth requerida)

**POST `/buy`** — compra de moneda extranjera con ARS
- Body: `{ currency_to: "USD" | "EUR", amount_from (positivo, en ARS) }`
- 201: `{ transaction }`
- Errores: `400 VALIDATION_ERROR`, `404 WALLET_NOT_FOUND`, `422 INSUFFICIENT_BALANCE`

**POST `/sell`** — venta de moneda extranjera a cambio de ARS
- Body: `{ currency_from: "USD" | "EUR", amount_from (positivo) }`
- 201: `{ transaction }`
- Errores: `400 VALIDATION_ERROR`, `404 WALLET_NOT_FOUND`, `422 INSUFFICIENT_BALANCE`

**POST `/exchange`** — intercambio entre dos monedas extranjeras
- Body: `{ currency_from, currency_to: "USD" | "EUR" (deben ser distintas), amount_from (positivo) }`
- 201: `{ transaction }`
- Errores: `400 VALIDATION_ERROR`, `404 WALLET_NOT_FOUND`, `422 INSUFFICIENT_BALANCE`

**POST `/transfer`** — transferencia a otro usuario por email
- Body: `{ recipient_email, currency_code: "ARS" | "USD" | "EUR", amount (positivo) }`
- 201: `{ transaction }`
- Errores: `400 VALIDATION_ERROR`, `404 WALLET_NOT_FOUND`, `404 RECIPIENT_NOT_FOUND`, `422 INVALID_TRANSFER` (transferencia a sí mismo), `422 INSUFFICIENT_BALANCE`

**GET `/`** — historial paginado
- Query: `{ page (default 1), limit (default 20, máximo 100) }`
- 200: `{ transactions, page, limit }`
- Errores: `404 WALLET_NOT_FOUND`

### Tasas de cambio (`/api/rates`, auth requerida)

**GET `/`**
- 200: `{ base: "EUR", rates: { ARS, USD, EUR } }` (ExchangeRate-API, caché en memoria de 1h con fallback a la última tasa conocida)

### Metas de ahorro (`/api/savings-goals`, auth requerida)

**POST `/`**
- Body: `{ title (1-255 caracteres), target_amount (positivo), currency_code: "ARS" | "USD" | "EUR", target_date? (fecha futura, opcional) }`
- 201: `{ goal }`
- Errores: `400 VALIDATION_ERROR`

**GET `/`**
- 200: `{ goals }`

**POST `/:id/fund`** — abona dinero del balance del usuario a una meta
- Params: `{ id (uuid) }` · Body: `{ amount (positivo) }`
- 200: `{ goal, transaction }`
- Errores: `400 VALIDATION_ERROR`, `404 GOAL_NOT_FOUND`, `422 GOAL_NOT_ACTIVE`, `422 AMOUNT_EXCEEDS_REMAINING`, `422 INSUFFICIENT_BALANCE`

### Gastos compartidos (`/api/shared-expenses`, auth requerida)

**POST `/`** — crea un gasto y reparte la deuda entre miembros
- Body: `{ title, total_amount (positivo), currency_code: "ARS" | "USD" | "EUR", members: [{ wallet_id (uuid), amount_owed (positivo) }] (mínimo 1, sin wallets duplicadas, la suma debe igualar total_amount) }`. El creador debe estar incluido en `members` — su parte queda saldada automáticamente al crear el gasto.
- 201: `{ expense }`
- Errores: `400 VALIDATION_ERROR`, `422 CREATOR_NOT_MEMBER`, `422 INVALID_WALLETS` (alguna wallet no existe)

**GET `/`** — historial paginado de gastos donde el usuario es miembro
- Query: `{ page (default 1), limit (default 20, máximo 100) }`
- 200: `{ expenses, page, limit }`

**POST `/:id/settle`** — el miembro salda su parte completa (no admite pagos parciales)
- Params: `{ id (uuid) }` · Sin body
- 200: `{ expense, transaction }`
- Errores: `403 NOT_MEMBER`, `404 EXPENSE_NOT_FOUND`, `422 ALREADY_PAID`, `422 INSUFFICIENT_BALANCE`

### Chatbot (`/api/chatbot`, auth requerida, máximo 20 mensajes cada 15 minutos por usuario)

**POST `/`**
- Body: `{ message (1-500 caracteres) }`
- 200: `{ reply }`
- Errores: `400 VALIDATION_ERROR`, `429 CHAT_IN_PROGRESS` (ya hay un mensaje del mismo usuario en proceso), `429 TOO_MANY_REQUESTS` (rate limit), `502 CHATBOT_BLOCKED` (el filtro de seguridad de Gemini bloqueó la respuesta), `503 CHATBOT_UNAVAILABLE` (Gemini no respondió)

## Deploy

El backend corre en **Railway**, conectado a la rama `developer` de este repositorio (auto-deploy en cada push).

**Por qué Railway**: provisiona PostgreSQL administrado sin configuración manual, tiene un free tier suficiente para el alcance de este proyecto final, y se integra directo con GitHub para auto-deploy — sin pipeline de CI/CD propio que mantener.

**Pasos para deployar:**

1. Crear un proyecto en Railway y conectarlo a este repositorio.
2. Agregar una instancia de PostgreSQL desde el dashboard de Railway — provisiona `DATABASE_URL` automáticamente.
3. Configurar el resto de las variables de entorno en Railway → Variables (ver [Variables de entorno](#variables-de-entorno)) — **nunca en el código**. Importante: `src/env.ts` valida todas las variables al arrancar, así que deben estar completas *antes* del primer deploy; si falta una (por ejemplo `GEMINI_API_KEY`), el servidor no levanta y el healthcheck falla.
4. Railway corre `npm run build` y `npm start` automáticamente (scripts ya definidos en `package.json`).
5. Correr las migraciones contra la base de producción: `npm run migrate` (con `DATABASE_URL` apuntando a la instancia de Railway). **Nunca correr `npm run seed` en producción** — borra y recarga los datos existentes.
6. Verificar que el servicio esté arriba: `GET /health` debe responder `{ "status": "ok" }`.

**HTTPS**: Railway lo fuerza automáticamente sobre el dominio que asigna, sin configuración adicional.

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
│   ├── queries/            # Consultas SQL por entidad — única capa que toca la DB
│   ├── middleware/         # Auth, errores, rate limiting y validación
│   ├── helpers/            # JWT, bcrypt, cálculos de moneda, fetch con timeout
│   ├── api-calls/          # Integraciones externas (ExchangeRate-API, Gemini)
│   ├── types/              # Interfaces TypeScript por dominio
│   ├── config/             # Configuración de cookies de sesión
│   ├── db/
│   │   ├── migrations/         # Scripts SQL de creación/alteración de tablas
│   │   ├── seeds/               # Datos de demo
│   │   ├── connection.ts        # Pool de conexión a PostgreSQL
│   │   ├── with-transaction.ts  # Wrapper compartido para transacciones atómicas
│   │   └── setup.ts             # Ejecuta las migraciones en orden
│   ├── env.ts              # Validación centralizada de variables de entorno (Zod)
│   └── app.ts              # Configuración de Express
├── tests/                  # Tests de Vitest
├── index.ts                # Entry point del servidor
├── .env.example            # Plantilla de variables de entorno
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

## Decisiones de diseño

### Modelo de wallets y balances

Cada usuario tiene **exactamente una wallet** (relación 1:1, tabla `wallets`). Dentro de esa wallet, existe **un balance por cada moneda soportada** (tabla `balances`, una fila por `wallet_id` + `currency_code`).

Elegimos este modelo ("una wallet — múltiples balances") en vez de, por ejemplo, una wallet por moneda, porque:
- **Escala sin tocar el esquema**: agregar una moneda nueva (`SUPPORTED_CURRENCIES`) es insertar una fila más en `balances`, no una migración.
- **Las consultas son simples**: "¿cuánto tengo en cada moneda?" es un `SELECT` directo por `wallet_id`, sin joins complejos.
- **Coincide con el modelo mental del usuario**: una sola cuenta con saldos en distintas monedas, como una billetera física con varios bolsillos.

Los montos se guardan como `NUMERIC(18,6)` en Postgres (precisión exacta para dinero) y se castean a `float8` al leer (`amount::float8`), porque el driver `pg` devuelve `NUMERIC` como string por defecto — sin el cast, el backend recibiría `"100.50"` en vez de `100.5` y rompería cualquier operación aritmética.

### Integridad y rendimiento del modelo de datos

Las relaciones entre tablas son **claves foráneas reales**, no solo IDs sueltos validados a mano en el código: `wallets.user_id`, `balances.wallet_id`, `transactions.wallet_id`, `shared_expense_members.wallet_id`, etc. Cada una usa `ON DELETE CASCADE` cuando el hijo no tiene sentido sin el padre (borrar un usuario borra su wallet y sus balances), u `ON DELETE SET NULL` cuando el dato histórico debe sobrevivir (`transactions.related_wallet_id` y `transactions.shared_expense_id`: el movimiento de dinero queda registrado en el ledger aunque la wallet relacionada o el gasto compartido se borren después).

Las reglas de negocio más críticas están como **constraints de base de datos**, no solo como validación de Zod en la capa HTTP: `CHECK (amount >= 0)` en `balances` (un saldo nunca puede quedar negativo aunque un bug futuro lo intente), `CHECK (amount_from > 0)`/`CHECK (target_amount > 0)`/etc. en montos de transacciones, metas y gastos, y `UNIQUE (wallet_id, currency_code)` en `balances` (una wallet no puede tener dos filas para la misma moneda). Esto importa porque la validación de Zod solo protege lo que pasa por la API — los constraints protegen la integridad del dato sin importar cómo se escriba.

Hay **índices** en toda columna que se filtra u ordena en una query frecuente: `idx_transactions_wallet_id` y `idx_transactions_created_at` (todo historial de transacciones filtra por wallet y pagina ordenando por fecha descendente), `idx_shared_expense_members_wallet_id` (resolver "¿en qué gastos compartidos participo?"), `idx_savings_goals_wallet_id`, entre otros — uno por cada relación que efectivamente se recorre en el camino de lectura, no índices especulativos sobre columnas que nunca se consultan.

### Estrategia de registro de transacciones (el ledger)

La tabla `transactions` es **append-only**: ninguna fila se modifica ni se borra una vez creada. El balance "real" en todo momento vive en `balances`; `transactions` existe únicamente para auditoría e historial — si se borrara toda la tabla, los saldos de los usuarios seguirían siendo correctos.

**Atomicidad**: toda operación que mueve dinero (comprar, vender, intercambiar, transferir, fondear una meta, saldar un gasto compartido) corre dentro de una única transacción de base de datos (`BEGIN`/`COMMIT`/`ROLLBACK`, ver `src/db/with-transaction.ts`). Si cualquier paso falla — saldo insuficiente, una fila de balance que no existe — se revierte todo el conjunto, nunca queda un movimiento a medias.

**Bloqueo de filas para evitar condiciones de carrera**: cada operación bloquea (`SELECT ... FOR UPDATE`) las filas de `balances` involucradas *antes* de leer el saldo, para que dos requests concurrentes sobre la misma wallet no lean un saldo desactualizado y lo dejen negativo. Cuando una operación toca dos wallets distintas (transferencias, liquidación de gastos compartidos), las filas se bloquean siempre en el mismo orden (alfabético por `wallet_id`) — si no se hiciera así, dos operaciones inversas simultáneas (A transfiere a B mientras B transfiere a A) podrían bloquearse mutuamente esperando la fila que tiene la otra (deadlock).

**Un tipo de transacción por operación, vía ENUM de Postgres**: el campo `type` (`buy`, `sell`, `exchange`, `transfer_in`/`transfer_out`, `savings_goal_fund`, `shared_expense_paid`/`shared_expense_received`) es un ENUM a nivel de base de datos, no un `VARCHAR` libre. Elegimos esto a propósito: un ENUM rechaza a nivel de DB cualquier valor que no sea uno de los reconocidos, una protección extra contra un bug que intente escribir un tipo inválido en el ledger de un producto financiero. El costo es que agregar una operación nueva requiere una migración (`ALTER TYPE ... ADD VALUE`) además del cambio de código — lo aceptamos porque la seguridad de un ledger financiero pesa más que el costo de una migración extra por feature.

**Operaciones entre dos wallets generan dos filas, no una**: una transferencia o la liquidación de un gasto compartido registra una transacción para cada lado (`transfer_out`/`transfer_in`, `shared_expense_paid`/`shared_expense_received`), enlazadas por `related_wallet_id`. Así cada usuario ve el movimiento completo en su propio historial, no solo quien lo inició.

### Caché y fallback de tasas de cambio

`src/api-calls/exchange-rates.ts` mantiene una caché en memoria de las tasas de cambio con TTL de 1 hora, en vez de pedir la tasa actual en cada request. Tres decisiones puntuales sobre esa caché:

- **Deduplicación de requests en vuelo**: si la caché está vencida y llegan varias requests a la vez (ej: varios usuarios comprando simultáneamente), solo la primera dispara un fetch real al proveedor — el resto espera la misma promesa en curso (`inflight`) en vez de disparar un fetch cada una. Sin esto, un pico de tráfico se traduciría en N llamadas idénticas a una API externa gratuita y sin SLA.
- **Fallback a la última tasa conocida**: si el fetch falla (proveedor caído, timeout) pero existe una caché previa, se devuelve esa caché vencida en vez de romper la operación — para un usuario es mejor operar con una tasa de hace unos minutos que no poder operar. El error solo se propaga cuando nunca hubo una tasa cacheada (arranque en frío sin conectividad).
- **TTL de 1 hora**: balance entre no golpear la API externa en cada operación y no operar con tasas demasiado desactualizadas — las tasas de cambio entre estas monedas no varían lo suficiente en una hora como para que el delay afecte la experiencia del usuario en un proyecto de este alcance.

**Por qué ExchangeRate-API (`open.er-api.com`) y no Frankfurter**: el proyecto usó Frankfurter al principio, pero Frankfurter solo republica referencias del Banco Central Europeo — nunca tuvo, ni va a tener, el Peso Argentino (ARS). Como el schema de validación exigía `ARS` en la respuesta, el `.parse()` de Zod fallaba en el 100% de las llamadas reales (no era un fallo intermitente), lo que rompía `/api/rates` y, en cadena, `buy`/`sell`/`exchange` — todos llaman a `getRates()` antes de ejecutar la conversión. El caché de fallback tampoco lo disimulaba: como nunca hubo una llamada exitosa, nunca se llegó a poblar. Se reemplazó por ExchangeRate-API, que sí cubre EUR/USD/ARS en una sola llamada, sin tocar el resto de la arquitectura (caché, deduplicación, fallback, timeout).

### Otras decisiones técnicas

- **Sin ORM**: SQL directo con `pg`, en capas `routes → controllers → queries`. Para el tamaño de este proyecto, un ORM agregaba una capa de abstracción sin necesidad real, a costa de ocultar el SQL exacto que se ejecuta (importante para razonar sobre bloqueos y transacciones).
- **Validación de env vars centralizada** (`src/env.ts`): todas las variables de entorno se validan con Zod una sola vez al arrancar; si falta una crítica, el servidor no levanta en vez de fallar más tarde con un error confuso.
- **Chatbot de solo lectura**: el asistente (Gemini 2.5 Flash) nunca ejecuta operaciones — solo lee balances, transacciones y tasas para responder. El system prompt incluye reglas explícitas contra prompt injection (ignorar instrucciones embebidas en el mensaje del usuario, nunca revelar el prompt).

## Equipo

| Nombre | Rol |
|---|---|
| Hernán Ramiro Albornoz | Backend |
| Hernán Macias Hernández | Backend |
| Richard Anderson González | Frontend |
