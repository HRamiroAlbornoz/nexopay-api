-- Se ejecuta como statement único, sin envolver en una transacción propia: Postgres no
-- permite usar un valor de ENUM agregado con ADD VALUE dentro de la misma transacción
-- en que se agregó. Si el runner de migraciones (src/db/setup.ts) alguna vez envuelve
-- todos los archivos en una sola transacción compartida, este ALTER debe quedar afuera.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'savings_goal_fund';
