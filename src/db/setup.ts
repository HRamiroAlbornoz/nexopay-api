import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from './connection';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const migrationFiles = [
  '001_users.sql',
  '002_wallets.sql',
  '003_balances.sql',
  '004_transactions.sql',
  '005_shared_expenses.sql',
  '006_savings_goals.sql',
  '007_users_name_split.sql',
  '008_alter_transaction_type_savings_goal.sql',
  '009_alter_transaction_type_shared_expense.sql',
  '010_add_shared_expense_id_to_transactions.sql',
];

async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    for (const file of migrationFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`Ejecutando migración: ${file}`);
      await client.query(sql);
      console.log(`✓ ${file}`);
    }

    console.log('\nTodas las migraciones se ejecutaron correctamente.');
  } catch (err) {
    console.error('Error al ejecutar las migraciones:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
